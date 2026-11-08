import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { lerp, lerpAngle } from '../core/math';
import type { BrowserInput } from '../core/input';
import { SYSTEM_ORDER, SystemRegistry } from '../core/systems';
import type { SettingsStore } from '../core/settingsStore';
import { ARENA, type BlockData } from '../data/arena';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { ARROW_CAMERA_SPEED, MOUSE_CAMERA_SPEED } from '../data/controls';
import { DUMMY_BALANCE, FEEDBACK_BALANCE, PLAYER_BALANCE } from '../data/balance';
import { ENEMY_KINDS, type EnemyKind } from '../data/enemies';
import { LUMBRE_PALETTE } from '../data/palettes';
import { QUALITY_PRESETS } from '../data/quality';
import { createPlayer, updatePlayer, type PlayerState } from '../game/player';
import { dodgeProgress, isInvulnerable } from '../game/dodge';
import {
  cancelCombo,
  comboModifiers,
  createCombo,
  currentStep,
  inHitWindow,
  isInArc,
  updateCombo,
  type ComboState,
} from '../game/combat';
import { createDummy, hitDummy, updateDummy, type DummyState } from '../game/dummy';
import { FlashLimiter, flashIntensity, shakeOffset } from '../game/feedback';
import {
  aliveEnemies,
  createEncounter,
  resetEncounter,
  retryEncounter,
  updateEncounter,
  type EncounterEvent,
  type EncounterState,
} from '../game/encounter';
import { isDead } from '../game/health';
import { waveNumber } from '../game/waves';
import { applyLook, createCameraRig, updateCameraPose, type CameraRig } from '../world/cameraRig';
import { createArenaEnvironment } from '../render/environment';
import { CharacterView } from '../render/characterView';
import { DummyView } from '../render/dummyModel';
import { EncounterView } from '../render/encounterView';
import { Sfx } from '../audio/sfx';
import { createWorldScene, applyShadowFilter, type WorldScene } from './worldScene';
import { createPostProcess, applyPostProcessQuality } from './postProcess';
import { ThirdPersonCamera } from './thirdPersonCamera';
import { loadModel, type LoadedModel } from './models';

/** Modelos de Blender que necesita una partida, ya cargados. */
export interface SessionAssets {
  readonly blade: LoadedModel;
  readonly dummy: LoadedModel;
  readonly characters: Readonly<Record<CharacterId, LoadedModel>>;
  readonly enemies: Readonly<Record<EnemyKind, LoadedModel>>;
}

/** Carga todos los modelos de la partida a la vez. `onProgress` recibe la fracción cargada (0..1). */
async function loadAssets(world: WorldScene, onProgress: (fraction: number) => void): Promise<SessionAssets> {
  const files = ['blade', 'dummy', 'alba', 'ciro', ...ENEMY_KINDS];
  let done = 0;
  onProgress(0);
  const loaded = await Promise.all(
    files.map(async (name) => {
      const model = await loadModel(world.scene, `${name}.glb`);
      onProgress(++done / files.length);
      return [name, model] as const;
    }),
  );
  const byName = new Map(loaded);
  const get = (name: string): LoadedModel => {
    const model = byName.get(name);
    if (!model) throw new Error(`Falta el modelo ${name}`);
    return model;
  };
  return {
    blade: get('blade'),
    dummy: get('dummy'),
    characters: { alba: get('alba'), ciro: get('ciro') },
    enemies: {
      brumilla: get('brumilla'),
      acechador: get('acechador'),
      coloso: get('coloso'),
      tirador: get('tirador'),
    },
  };
}

/** Inclinación de la cámara al mostrar al personaje en la pantalla de elección. */
const SHOWCASE_PITCH = 0.1;
/** Duración del tinte rojo al recibir un golpe (s). */
const HURT_TINT_SECONDS = 0.35;

/** Lo que muestra el HUD en cada fotograma. */
export interface HudSnapshot {
  readonly quarters: number;
  readonly maxQuarters: number;
  readonly sparks: number;
  readonly wave: number;
  /** Segundos hasta la siguiente oleada (null si se está luchando). */
  readonly nextWaveIn: number | null;
  readonly enemies: number;
  readonly dodgeReady: boolean;
}

/**
 * Una partida en la arena: escena, personaje, muñeco, enemigos, cámara y sistemas registrados en orden.
 * La lógica avanza en `fixedUpdate` (60 Hz); el render se interpola en `frameUpdate`.
 */
export class GameSession {
  readonly systems = new SystemRegistry();
  readonly world: WorldScene;
  readonly camera: ThirdPersonCamera;
  readonly pipeline: DefaultRenderingPipeline;
  readonly player: PlayerState;
  readonly cameraRig: CameraRig;
  readonly combo: ComboState = createCombo();
  readonly dummy: DummyState = createDummy(ARENA.dummy.x, ARENA.dummy.z);
  readonly encounter: EncounterState = createEncounter();
  readonly sfx = new Sfx();
  private character: CharacterView;
  private readonly dummyView: DummyView;
  private readonly encounterView: EncounterView;
  private readonly flashLimiter = new FlashLimiter();
  /** Reloj de la lógica (segundos de juego, no de pared). */
  private clock = 0;
  private flashStart = Number.NEGATIVE_INFINITY;
  private shakeStart = Number.NEGATIVE_INFINITY;
  private hurtTintStart = Number.NEGATIVE_INFINITY;
  private hitStop = 0;
  /** Bloques sólidos con el muñeco incluido (mientras está en pie). */
  private readonly blocksWithDummy: readonly BlockData[];
  /** Si es false, la lógica no avanza (pausa o menús). */
  playing = false;
  /** Avisa a la interfaz de que cambió la vida del muñeco. */
  onDummyChanged: (dummy: DummyState) => void = () => undefined;
  /** Datos del HUD, una vez por fotograma mientras se juega. */
  onHud: (hud: HudSnapshot) => void = () => undefined;
  /** Mensaje corto y visible (oleadas). También sirve como señal visual de los sonidos de oleada. */
  onBanner: (text: 'waveStarted' | 'waveCleared', wave: number) => void = () => undefined;
  /** El jugador cayó y ya se puede mostrar "Reintentar". */
  onRetryReady: () => void = () => undefined;

  /** Crea la escena, carga los modelos y prepara la partida. */
  static async create(
    engine: AbstractEngine,
    input: BrowserInput,
    settings: SettingsStore,
    characterId: CharacterId,
    onProgress: (fraction: number) => void = () => undefined,
  ): Promise<GameSession> {
    const quality = QUALITY_PRESETS[settings.value.quality];
    engine.setHardwareScalingLevel(quality.hardwareScaling);
    const world = createWorldScene(engine, LUMBRE_PALETTE, quality);
    try {
      const assets = await loadAssets(world, onProgress);
      return new GameSession(engine, input, settings, characterId, world, assets);
    } catch (error) {
      world.scene.dispose();
      throw error;
    }
  }

  private constructor(
    private readonly engine: AbstractEngine,
    private readonly input: BrowserInput,
    private readonly settings: SettingsStore,
    characterId: CharacterId,
    world: WorldScene,
    private readonly assets: SessionAssets,
  ) {
    const quality = QUALITY_PRESETS[settings.value.quality];
    this.world = world;
    createArenaEnvironment(this.world.scene, LUMBRE_PALETTE, this.world.materials, this.world.shadows);

    this.player = createPlayer(ARENA.playerSpawn.x, ARENA.playerSpawn.z, ARENA.playerSpawnYaw);
    this.cameraRig = createCameraRig(ARENA.playerSpawnYaw);
    this.camera = new ThirdPersonCamera(this.world.scene, settings.value.fov);
    this.pipeline = createPostProcess(this.world.scene, this.camera.camera, quality);
    this.character = this.buildCharacter(characterId);
    this.dummyView = new DummyView(this.world.scene, assets.dummy, this.world.materials, this.world.shadows);
    this.encounterView = new EncounterView(
      this.world.scene,
      assets.enemies,
      this.world.materials,
      this.world.shadows,
    );

    this.sfx.setMuted(settings.value.muted);
    settings.onChange((s) => {
      const q = QUALITY_PRESETS[s.quality];
      engine.setHardwareScalingLevel(q.hardwareScaling);
      applyShadowFilter(this.world.shadows, q);
      applyPostProcessQuality(this.pipeline, q);
      this.camera.setFov(s.fov);
      this.sfx.setMuted(s.muted);
    });

    const r = DUMMY_BALANCE.radius * 0.7;
    this.blocksWithDummy = [
      ...ARENA.blocks,
      { x: this.dummy.x, z: this.dummy.z, halfX: r, halfZ: r, height: 1.8, kind: 'pillar' },
    ];

    this.registerSystems();
  }

  /** Cambia de personaje (pantalla de elección). */
  setCharacter(characterId: CharacterId): void {
    this.character.dispose();
    this.character = this.buildCharacter(characterId);
  }

  /** Coloca la cámara delante del personaje para la pantalla de elección (escena quieta, sin jugar). */
  showcase(): void {
    this.cameraRig.yaw = this.player.yaw + Math.PI;
    this.cameraRig.pitch = SHOWCASE_PITCH;
  }

  /** Empieza a jugar con la cámara detrás del personaje. Solo se llama por una acción del jugador. */
  beginPlay(): void {
    this.cameraRig.yaw = this.player.yaw;
    this.cameraRig.pitch = 0.28;
    this.input.state.clear();
  }

  /** Reintentar tras caer: vida llena, la misma oleada y el jugador en el punto de salida. */
  retry(): void {
    retryEncounter(this.encounter);
    this.encounterView.clear();
    this.placePlayerAtSpawn();
    this.cameraRig.yaw = this.player.yaw;
    this.input.state.clear();
  }

  /** Vuelve a dejar la arena como al principio (al regresar a la pantalla de inicio). */
  resetArena(): void {
    this.placePlayerAtSpawn();
    resetEncounter(this.encounter);
    this.encounterView.clear();
    this.dummy.health = this.dummy.maxHealth;
    this.dummy.respawn = 0;
    this.dummy.sinceHit = Number.POSITIVE_INFINITY;
    this.onDummyChanged(this.dummy);
  }

  private placePlayerAtSpawn(): void {
    const p = this.player;
    p.x = p.prevX = ARENA.playerSpawn.x;
    p.z = p.prevZ = ARENA.playerSpawn.z;
    p.yaw = p.prevYaw = ARENA.playerSpawnYaw;
    p.vx = p.vz = p.speed = 0;
    p.dodge.phase = 'ready';
    p.dodge.time = 0;
    cancelCombo(this.combo);
    this.hitStop = 0;
  }

  private buildCharacter(characterId: CharacterId): CharacterView {
    return new CharacterView(
      this.world.scene,
      CHARACTERS[characterId],
      this.assets.characters[characterId],
      this.assets.blade,
      this.world.materials,
      this.world.shadows,
    );
  }

  /** Destello de golpe, si "Reducir parpadeo" no está activo y no se superan 3 por segundo. */
  private tryFlash(): boolean {
    return !this.settings.value.reduceFlashing && this.flashLimiter.tryFlash(this.clock);
  }

  /** Comprueba si el golpe actual alcanza al muñeco. */
  private resolveDummyHit(): boolean {
    const step = currentStep(this.combo);
    if (!step || !inHitWindow(this.combo)) return false;
    const p = this.player;
    const reach = isInArc(
      p.x,
      p.z,
      p.yaw,
      this.dummy.x,
      this.dummy.z,
      DUMMY_BALANCE.radius,
      step.range,
      step.halfArc,
    );
    if (!reach || hitDummy(this.dummy, step.damage, this.combo.swingId) <= 0) return false;
    this.onDummyChanged(this.dummy);
    if (this.tryFlash()) this.flashStart = this.clock;
    return true;
  }

  /** Sonido, destellos, sacudida y avisos de lo que pasó en el combate. */
  private handleEvents(events: readonly EncounterEvent[]): boolean {
    let impact = false;
    const reduceMotion = this.settings.value.reduceMotion;
    for (const e of events) {
      switch (e.type) {
        case 'enemyHit':
          impact = true;
          this.sfx.play(e.killed ? 'kill' : 'hit');
          if (this.tryFlash()) this.encounterView.flashEnemy(e.id);
          break;
        case 'enemyWindup':
          this.sfx.play('warn', ENEMY_KINDS.indexOf(e.kind));
          break;
        case 'enemyAttack':
          if (e.kind === 'coloso') {
            this.sfx.play('slam');
            this.shakeStart = this.clock;
          } else if (e.kind !== 'tirador') {
            this.sfx.play('dodge');
          }
          break;
        case 'projectileFired':
          this.sfx.play('shoot');
          break;
        case 'projectileEnded':
          this.encounterView.burst(e.x, e.z, reduceMotion);
          if (e.how === 'cut') this.sfx.play('cut');
          break;
        case 'playerHit':
          cancelCombo(this.combo);
          this.sfx.play('hurt');
          this.shakeStart = this.clock;
          if (this.tryFlash()) this.hurtTintStart = this.clock;
          break;
        case 'playerDown':
          this.sfx.play('down');
          break;
        case 'retryReady':
          this.onRetryReady();
          break;
        case 'sparksCollected':
          this.sfx.play('spark', this.encounter.sparkCount % 5);
          break;
        case 'waveStarted':
          this.sfx.play('wave');
          this.onBanner('waveStarted', e.number);
          break;
        case 'waveCleared':
          this.onBanner('waveCleared', e.number);
          break;
        case 'enemySpawned':
          break;
      }
    }
    return impact;
  }

  private registerSystems(): void {
    const state = this.input.state;

    this.systems.register({
      name: 'player',
      order: SYSTEM_ORDER.player,
      fixedUpdate: (dt) => {
        if (!this.playing) return;
        this.clock += dt;
        if (this.hitStop > 0) {
          // Pausa de impacto: un instante congelado al conectar un golpe.
          this.hitStop = Math.max(0, this.hitStop - dt);
          return;
        }
        const health = this.encounter.health;
        // Caído o empujado por un golpe: no responde a los controles.
        const stunned = isDead(health) || health.knockTime > 0;
        const dodgePressed = state.takePressed('dodge') && !stunned;
        const dodging = this.player.dodge.phase === 'dodging';
        const attackPressed = state.takePressed('attack') && !dodging && !stunned;
        if (dodgePressed && this.player.dodge.phase === 'ready') cancelCombo(this.combo);
        const wasReady = this.player.dodge.phase === 'ready';
        if (updateCombo(this.combo, attackPressed, dt) !== null) this.sfx.play('swing', this.combo.step);
        const axis = stunned ? { x: 0, z: 0 } : state.moveAxis();
        updatePlayer(
          this.player,
          { moveX: axis.x, moveZ: axis.z, walk: state.isDown('walk'), dodge: dodgePressed },
          this.cameraRig.yaw,
          dt,
          this.dummy.respawn > 0 ? ARENA.blocks : this.blocksWithDummy,
          comboModifiers(this.combo),
        );
        if (wasReady && this.player.dodge.phase === 'dodging') this.sfx.play('dodge');
      },
    });

    this.systems.register({
      name: 'combat',
      order: SYSTEM_ORDER.combat,
      fixedUpdate: (dt) => {
        if (!this.playing || this.hitStop > 0) return;
        const dummyHit = this.resolveDummyHit();
        if (dummyHit) this.sfx.play('hit');
        const events = updateEncounter(this.encounter, dt, {
          player: this.player,
          playerRadius: PLAYER_BALANCE.radius,
          combo: this.combo,
          dodging: isInvulnerable(this.player.dodge),
          damageSetting: this.settings.value.damageTaken,
          blocks: this.dummy.respawn > 0 ? ARENA.blocks : this.blocksWithDummy,
        });
        const impact = this.handleEvents(events) || dummyHit;
        if (impact) {
          this.hitStop = FEEDBACK_BALANCE.hitStop;
          this.shakeStart = this.clock;
        }
      },
    });

    this.systems.register({
      name: 'dummy',
      order: SYSTEM_ORDER.dummy,
      fixedUpdate: (dt) => {
        if (!this.playing) return;
        const wasDefeated = this.dummy.respawn > 0;
        updateDummy(this.dummy, dt);
        if (wasDefeated && this.dummy.respawn === 0) this.onDummyChanged(this.dummy);
      },
    });

    this.systems.register({
      name: 'camera',
      order: SYSTEM_ORDER.camera,
      frameUpdate: (frameSeconds, alpha) => {
        const s = this.settings.value;
        const mouse = state.takeMouseDelta();
        if (this.playing) {
          const arrowX = (state.isDown('camRight') ? 1 : 0) - (state.isDown('camLeft') ? 1 : 0);
          const arrowY = (state.isDown('camUp') ? 1 : 0) - (state.isDown('camDown') ? 1 : 0);
          applyLook(
            this.cameraRig,
            { mouseX: mouse.x, mouseY: mouse.y, arrowX, arrowY },
            {
              sensitivity: s.sensitivity,
              invertY: s.invertY,
              mouseSpeed: MOUSE_CAMERA_SPEED,
              arrowSpeed: ARROW_CAMERA_SPEED,
            },
            frameSeconds,
          );
        }
        // La sacudida de golpe no existe con "Reducir movimiento".
        const shake = shakeOffset(this.clock - this.shakeStart, !s.reduceMotion);
        this.camera.setShake(shake.x, shake.y);
        const px = lerp(this.player.prevX, this.player.x, alpha);
        const pz = lerp(this.player.prevZ, this.player.z, alpha);
        this.camera.apply(updateCameraPose(this.cameraRig, px, pz, ARENA.blocks, frameSeconds));
      },
    });

    this.systems.register({
      name: 'render',
      order: SYSTEM_ORDER.render,
      frameUpdate: (frameSeconds, alpha) => {
        const p = this.player;
        const s = this.settings.value;
        const health = this.encounter.health;
        const animSeconds = this.playing && this.hitStop <= 0 ? frameSeconds : 0;
        const root = this.character.root;
        root.position.set(lerp(p.prevX, p.x, alpha), 0, lerp(p.prevZ, p.z, alpha));
        root.rotation.y = lerpAngle(p.prevYaw, p.yaw, alpha);
        const step = currentStep(this.combo);
        // En la pantalla de elección el personaje respira (reposo) aunque la partida no avance.
        this.character.update(
          {
            speed: this.playing ? p.speed : 0,
            dodge: dodgeProgress(p.dodge),
            attack: step ? { step: this.combo.step, time: this.combo.time } : null,
            hurt: health.sinceHit,
            dead: isDead(health) ? health.deadFor : null,
            reduceMotion: s.reduceMotion,
          },
          this.playing ? animSeconds : frameSeconds,
        );
        const tint = this.clock - this.hurtTintStart;
        this.character.setHurtTint(s.reduceFlashing ? 0 : Math.max(0, 1 - tint / HURT_TINT_SECONDS));
        const flash = s.reduceFlashing ? 0 : flashIntensity(this.clock - this.flashStart);
        this.dummyView.update(this.dummy, flash, s.reduceMotion, animSeconds);
        this.encounterView.update(this.encounter, alpha, animSeconds, s.reduceFlashing, s.reduceMotion);
      },
    });

    this.systems.register({
      name: 'ui',
      order: SYSTEM_ORDER.ui,
      frameUpdate: () => {
        if (!this.playing) return;
        const e = this.encounter;
        this.onHud({
          quarters: e.health.quarters,
          maxQuarters: e.health.maxQuarters,
          sparks: e.sparkCount,
          wave: waveNumber(e.waves),
          nextWaveIn: e.waves.phase === 'waiting' ? Math.max(0, e.waves.timer) : null,
          enemies: aliveEnemies(e),
          dodgeReady: this.player.dodge.phase === 'ready',
        });
      },
    });
  }

  dispose(): void {
    this.sfx.dispose();
    this.world.scene.dispose();
    this.engine.setHardwareScalingLevel(1);
  }
}
