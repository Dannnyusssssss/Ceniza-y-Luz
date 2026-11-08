import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { lerp, lerpAngle } from '../core/math';
import type { BrowserInput } from '../core/input';
import { SYSTEM_ORDER, SystemRegistry } from '../core/systems';
import type { SettingsStore } from '../core/settingsStore';
import { ARENA, type BlockData } from '../data/arena';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { ARROW_CAMERA_SPEED, MOUSE_CAMERA_SPEED } from '../data/controls';
import { DUMMY_BALANCE, FEEDBACK_BALANCE } from '../data/balance';
import { LUMBRE_PALETTE } from '../data/palettes';
import { QUALITY_PRESETS } from '../data/quality';
import { createPlayer, updatePlayer, type PlayerState } from '../game/player';
import { dodgeProgress } from '../game/dodge';
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
import { applyLook, createCameraRig, updateCameraPose, type CameraRig } from '../world/cameraRig';
import { createArenaEnvironment } from '../render/environment';
import { CharacterView } from '../render/characterView';
import { DummyView } from '../render/dummyModel';
import { createWorldScene, applyShadowFilter, type WorldScene } from './worldScene';
import { createPostProcess, applyPostProcessQuality } from './postProcess';
import { ThirdPersonCamera } from './thirdPersonCamera';
import { loadModel, type LoadedModel } from './models';

/** Modelos de Blender que necesita una partida, ya cargados. */
export interface SessionAssets {
  readonly blade: LoadedModel;
  readonly dummy: LoadedModel;
  readonly characters: Readonly<Record<CharacterId, LoadedModel>>;
}

/** Carga todos los modelos de la partida a la vez. `onProgress` recibe la fracción cargada (0..1). */
async function loadAssets(world: WorldScene, onProgress: (fraction: number) => void): Promise<SessionAssets> {
  const total = 4;
  let done = 0;
  const load = async (file: string): Promise<LoadedModel> => {
    const model = await loadModel(world.scene, file);
    onProgress(++done / total);
    return model;
  };
  onProgress(0);
  const [blade, dummy, alba, ciro] = await Promise.all([
    load('blade.glb'),
    load('dummy.glb'),
    load('alba.glb'),
    load('ciro.glb'),
  ]);
  return { blade, dummy, characters: { alba, ciro } };
}

/** Inclinación de la cámara al mostrar al personaje en la pantalla de elección. */
const SHOWCASE_PITCH = 0.1;

/**
 * Una partida en la arena: escena, personaje, muñeco, cámara y sistemas registrados en orden.
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
  private character: CharacterView;
  private readonly dummyView: DummyView;
  private readonly flashLimiter = new FlashLimiter();
  /** Reloj de la lógica (segundos de juego, no de pared). */
  private clock = 0;
  private flashStart = Number.NEGATIVE_INFINITY;
  private shakeStart = Number.NEGATIVE_INFINITY;
  private hitStop = 0;
  /** Bloques sólidos con el muñeco incluido (mientras está en pie). */
  private readonly blocksWithDummy: readonly BlockData[];
  /** Si es false, la lógica no avanza (pausa o menús). */
  playing = false;
  /** Avisa a la interfaz de que cambió la vida del muñeco. */
  onDummyChanged: (dummy: DummyState) => void = () => undefined;

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

    settings.onChange((s) => {
      const q = QUALITY_PRESETS[s.quality];
      engine.setHardwareScalingLevel(q.hardwareScaling);
      applyShadowFilter(this.world.shadows, q);
      applyPostProcessQuality(this.pipeline, q);
      this.camera.setFov(s.fov);
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

  /** Vuelve a dejar la arena como al principio (al regresar a la pantalla de inicio). */
  resetArena(): void {
    const p = this.player;
    p.x = p.prevX = ARENA.playerSpawn.x;
    p.z = p.prevZ = ARENA.playerSpawn.z;
    p.yaw = p.prevYaw = ARENA.playerSpawnYaw;
    p.vx = p.vz = p.speed = 0;
    p.dodge.phase = 'ready';
    p.dodge.time = 0;
    cancelCombo(this.combo);
    this.dummy.health = this.dummy.maxHealth;
    this.dummy.respawn = 0;
    this.dummy.sinceHit = Number.POSITIVE_INFINITY;
    this.onDummyChanged(this.dummy);
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

  /** Comprueba si el golpe actual alcanza al muñeco y aplica daño, destello, sacudida y pausa de impacto. */
  private resolveHits(): void {
    const step = currentStep(this.combo);
    if (!step || !inHitWindow(this.combo)) return;
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
    if (!reach) return;
    const dealt = hitDummy(this.dummy, step.damage, this.combo.swingId);
    if (dealt <= 0) return;
    this.onDummyChanged(this.dummy);
    this.hitStop = FEEDBACK_BALANCE.hitStop;
    this.shakeStart = this.clock;
    // El destello solo se permite si no está activado "Reducir parpadeo" y no supera 3 por segundo.
    if (!this.settings.value.reduceFlashing && this.flashLimiter.tryFlash(this.clock)) {
      this.flashStart = this.clock;
    }
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
        const dodgePressed = state.takePressed('dodge');
        const dodging = this.player.dodge.phase === 'dodging';
        const attackPressed = state.takePressed('attack') && !dodging;
        if (dodgePressed && this.player.dodge.phase === 'ready') cancelCombo(this.combo);
        updateCombo(this.combo, attackPressed, dt);
        const axis = state.moveAxis();
        updatePlayer(
          this.player,
          { moveX: axis.x, moveZ: axis.z, walk: state.isDown('walk'), dodge: dodgePressed },
          this.cameraRig.yaw,
          dt,
          this.dummy.respawn > 0 ? ARENA.blocks : this.blocksWithDummy,
          comboModifiers(this.combo),
        );
      },
    });

    this.systems.register({
      name: 'combat',
      order: SYSTEM_ORDER.combat,
      fixedUpdate: () => {
        if (this.playing && this.hitStop <= 0) this.resolveHits();
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
            reduceMotion: s.reduceMotion,
          },
          this.playing ? animSeconds : frameSeconds,
        );
        const flash = s.reduceFlashing ? 0 : flashIntensity(this.clock - this.flashStart);
        this.dummyView.update(this.dummy, flash, s.reduceMotion, animSeconds);
      },
    });
  }

  dispose(): void {
    this.world.scene.dispose();
    this.engine.setHardwareScalingLevel(1);
  }
}
