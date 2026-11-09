import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { BrowserInput } from '../core/input';
import { SYSTEM_ORDER, SystemRegistry } from '../core/systems';
import type { SettingsStore } from '../core/settingsStore';
import type { CharacterId } from '../data/characters';
import { DUMMY_BALANCE, FEEDBACK_BALANCE, PLAYER_BALANCE } from '../data/balance';
import { LUMBRE_NIGHT_PALETTE, type ZonePalette } from '../data/palettes';
import { QUALITY_PRESETS } from '../data/quality';
import { ZONES, type ExitData, type NpcId, type ZoneId } from '../data/zones';
import {
  createAdventure,
  currentExit,
  defeatBoss,
  enterZone,
  interact,
  nearestInteractable,
  type AdventureEvent,
  type AdventureState,
  type Interactable,
} from '../game/adventure';
import type { AbilityState } from '../game/abilities';
import { createPlayer, updatePlayer, type PlayerState } from '../game/player';
import { createGuardian, resetGuardian, type GuardianEvent, type GuardianState } from '../game/guardian';
import { isInvulnerable } from '../game/dodge';
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
import {
  clearCombat,
  createEncounter,
  resetEncounter,
  retryEncounter,
  spawnZoneEnemies,
  updateEncounter,
  type EncounterState,
} from '../game/encounter';
import { isDead, reviveLoaded, resetHealth, setLife } from '../game/health';
import { addSparks, usePotion } from '../game/inventory';
import {
  createProgress,
  dodgeCooldownFactor,
  hasFlag,
  maxQuarters,
  setFlag,
  templeFactor,
  type Progress,
} from '../game/progress';
import { createCameraRig, type CameraRig } from '../world/cameraRig';
import { Music } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { loadAssets, type SessionAssets } from './assets';
import { CombatFeedback } from './combatFeedback';
import { PowersRunner, type PowersContext } from './powers';
import { playAdventureEffects, playGuardianEffects, type EffectTargets } from './sessionEffects';
import { buildHudSnapshot, type HudSnapshot } from './sessionHud';
import { SolidBlocks } from './solidBlocks';
import { SessionView } from './sessionView';
import { createWorldScene, type WorldScene } from './worldScene';

/** Modo de juego: la aventura o la arena de oleadas (solo para probar el balance). */
export type GameMode = 'story' | 'arena';

/** Inclinación de la cámara al mostrar al personaje en la pantalla de elección. */
const SHOWCASE_PITCH = 0.1;
/** Cada cuántos pasos de lógica se busca qué hay al alcance (6 = 10 veces por segundo). */
const PROMPT_EVERY_STEPS = 6;
/** Todas las zonas tienen este punto de llegada: es donde se empieza. */
const START_ENTRY = 'start';

export type { HudSnapshot };

/**
 * Una partida: zona actual, personaje, enemigos y sistemas registrados en orden. Lo que se ve está en `SessionView`.
 * La lógica avanza en `fixedUpdate` (60 Hz); el render se interpola en `frameUpdate`.
 */
export class GameSession {
  readonly systems = new SystemRegistry();
  readonly world: WorldScene;
  readonly player: PlayerState;
  readonly cameraRig: CameraRig;
  readonly combo: ComboState = createCombo();
  readonly dummy: DummyState = createDummy(0, 0);
  readonly encounter: EncounterState;
  readonly sfx = new Sfx();
  readonly music = new Music();
  readonly powers: PowersRunner;
  guardian: GuardianState | null = null;
  adventure: AdventureState;
  /** Pausa de impacto restante (s). */
  hitStop = 0;
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
  /** Algo pasó al usar un objeto: la interfaz muestra el diálogo o el aviso que toque. */
  onAdventure: (event: AdventureEvent) => void = () => undefined;
  /** El jugador llegó a una salida de la zona. */
  onExit: (exit: ExitData) => void = () => undefined;
  /** Algo importante del jefe: la interfaz lo muestra (toda señal sonora tiene su señal visual). */
  onGuardian: (event: GuardianEvent) => void = () => undefined;
  private readonly view: SessionView;
  private readonly feedback: CombatFeedback;
  private stepCount = 0;
  private prompt: Interactable | null = null;
  private readonly solids = new SolidBlocks();

  /** Crea la escena, carga los modelos y prepara la partida. */
  static async create(
    engine: AbstractEngine,
    input: BrowserInput,
    settings: SettingsStore,
    characterId: CharacterId,
    mode: GameMode,
    onProgress: (fraction: number) => void = () => undefined,
  ): Promise<GameSession> {
    const quality = QUALITY_PRESETS[settings.value.quality];
    engine.setHardwareScalingLevel(quality.hardwareScaling);
    const world = createWorldScene(engine, ZONES.lumbre.palette, quality);
    try {
      const assets = await loadAssets(world, onProgress);
      return new GameSession(engine, input, settings, characterId, mode, world, assets);
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
    readonly mode: GameMode,
    world: WorldScene,
    assets: SessionAssets,
  ) {
    this.world = world;
    this.encounter = createEncounter(20261108, mode === 'arena');
    this.adventure = createAdventure(this.freshProgress(characterId), this.homeZone());
    this.player = createPlayer(0, 0, 0);
    this.cameraRig = createCameraRig(0);
    this.view = new SessionView(engine, world, assets, settings, characterId);
    this.feedback = new CombatFeedback(settings, this.sfx, this.view.encounterView, {
      onCancelCombo: () => cancelCombo(this.combo),
      onSparks: (count) => addSparks(this.progress, count),
      onRetryReady: () => this.onRetryReady(),
      onWave: (kind, wave) => this.onBanner(kind, wave),
    });
    this.powers = new PowersRunner(this.sfx, {
      onEncounterEvents: (events) => {
        if (this.feedback.handle(events)) this.feedback.shake();
      },
      onAdventureEvents: (events) => this.handleAdventure(events),
      onGuardianEvents: (events) => this.handleGuardian(events),
      onBurst: (x, z) => this.view.encounterView.burst(x, z, settings.value.reduceMotion),
      onDummyHit: (dummy) => this.onDummyChanged(dummy),
      onBladeImpact: () => {
        this.hitStop = FEEDBACK_BALANCE.hitStop;
        this.feedback.shake();
      },
    });
    this.sfx.setMuted(settings.value.muted);
    this.music.setEnabled(settings.value.music);
    settings.onChange((s) => {
      this.sfx.setMuted(s.muted);
      this.music.setEnabled(s.music);
    });
    this.view.setBladeVisible(hasFlag(this.progress, 'bladeTaken'));
    this.loadZone(this.homeZone(), START_ENTRY);
    this.registerSystems();
  }

  private homeZone(): ZoneId {
    return this.mode === 'arena' ? 'arena' : 'lumbre';
  }

  private freshProgress(characterId: CharacterId): Progress {
    const progress = createProgress(characterId);
    if (this.mode === 'arena') progress.flags.push('introSeen', 'bladeTaken');
    return progress;
  }

  get progress(): Progress {
    return this.adventure.progress;
  }

  /** Estado de las habilidades (la vista dibuja los disparos). */
  get abilities(): AbilityState {
    return this.powers.state;
  }

  /** Crea o reanuda el audio y la música. Solo se puede tras una acción del jugador. */
  unlockAudio(): void {
    this.sfx.unlock();
    this.music.attach(this.sfx.output);
  }

  /** Crea la zona y coloca al jugador. Los enemigos vuelven a su sitio; lo abierto y resuelto se conserva. */
  private loadZone(zoneId: ZoneId, entry: string, palette?: ZonePalette, npcs = true): void {
    clearCombat(this.encounter);
    enterZone(this.adventure, zoneId);
    const zone = this.adventure.zone;
    const boss = zone.boss;
    this.guardian = boss ? createGuardian(boss, this.progress.bosses.includes(boss.id)) : null;
    this.view.loadZone(this.adventure, palette, npcs);
    this.music.setZone(zoneId);
    spawnZoneEnemies(this.encounter, zone.enemies);
    if (zone.dummy) {
      this.dummy.x = zone.dummy.x;
      this.dummy.z = zone.dummy.z;
      this.dummy.health = this.dummy.maxHealth;
      this.dummy.respawn = 0;
      this.dummy.sinceHit = Number.POSITIVE_INFINITY;
      this.onDummyChanged(this.dummy);
    }
    this.solids.invalidate();
    this.prompt = null;
    this.placePlayer(entry);
  }

  /** Coloca al jugador en un punto de llegada, con la cámara detrás de él. */
  private placePlayer(entry: string): void {
    const place = this.adventure.zone.entries[entry];
    if (!place) return;
    const p = this.player;
    p.x = p.prevX = place.x;
    p.z = p.prevZ = place.z;
    p.yaw = p.prevYaw = place.yaw;
    p.vx = p.vz = p.speed = 0;
    p.dodge.phase = 'ready';
    p.dodge.time = 0;
    cancelCombo(this.combo);
    this.powers.reset();
    this.hitStop = 0;
    this.cameraRig.yaw = place.yaw;
    this.view.focusShadows(place.x, place.z);
  }

  /** Empieza una aventura con este progreso (nuevo o de un guardado). */
  private adoptProgress(progress: Progress): void {
    this.adventure = createAdventure(progress, progress.place.zone);
    setLife(this.encounter.health, maxQuarters(progress), progress.quarters);
    reviveLoaded(this.encounter.health);
    this.encounter.retryAnnounced = false;
    this.setCharacter(progress.character);
  }

  /** Nueva partida: la intro, de noche en Lumbre. */
  startIntro(characterId: CharacterId): void {
    this.adoptProgress(this.freshProgress(characterId));
    this.loadZone('lumbre', START_ENTRY, LUMBRE_NIGHT_PALETTE, false);
    this.view.startIntro(this.adventure, characterId);
  }

  setIntroShot(index: number): void {
    this.view.setIntroShot(index);
  }

  /** Termina la intro: amanece en Lumbre y empieza el juego. */
  endIntro(): void {
    this.view.endIntro();
    setFlag(this.progress, 'introSeen');
    this.loadZone('lumbre', START_ENTRY);
    this.view.setBladeVisible(false);
  }

  /** Continúa una partida guardada. */
  continueGame(progress: Progress): void {
    this.adoptProgress(progress);
    this.loadZone(progress.place.zone, progress.place.entry);
  }

  /** Cambia de zona (salidas). */
  changeZone(zone: ZoneId, entry: string): void {
    this.progress.place = { zone, entry };
    this.loadZone(zone, entry);
    this.input.state.clear();
  }

  /** Guarda en el progreso la vida actual y lo devuelve, listo para escribirlo. */
  snapshot(): Progress {
    this.progress.quarters = Math.max(1, this.encounter.health.quarters);
    return this.progress;
  }

  /** Cambia de personaje (pantalla de elección). */
  setCharacter(characterId: CharacterId): void {
    this.progress.character = characterId;
    this.view.setCharacter(characterId, hasFlag(this.progress, 'bladeTaken'));
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

  /** Reintentar tras caer: vida llena, en el último faro. En la arena, la misma oleada en el punto de salida. */
  retry(): void {
    if (this.mode === 'arena') {
      retryEncounter(this.encounter);
      this.view.encounterView.clear();
      this.placePlayer(START_ENTRY);
    } else {
      const { zone, entry } = this.progress.respawn;
      resetHealth(this.encounter.health);
      this.encounter.retryAnnounced = false;
      this.progress.place = { zone, entry };
      this.loadZone(zone, entry);
    }
    this.input.state.clear();
  }

  /** Vuelve al estado de la pantalla de inicio. */
  resetToMenu(): void {
    this.view.endIntro();
    this.adoptProgress(this.freshProgress(this.progress.character));
    if (this.mode === 'arena') resetEncounter(this.encounter);
    this.loadZone(this.homeZone(), START_ENTRY);
  }

  /** Bebe una poción desde el inventario. */
  drinkPotion(): boolean {
    const used = usePotion(this.progress, this.encounter.health);
    if (used) this.sfx.play('potion');
    return used;
  }

  /** Un aldeano deja de hablar. */
  endTalk(): void {
    this.view.setTalking(null);
  }

  /** Bloques sólidos de este paso: los de la zona y el muñeco en pie. */
  private blocksNow(): ReturnType<SolidBlocks['get']> {
    return this.solids.get(this.adventure, this.dummy);
  }

  /** Lo que necesitan las habilidades y el jefe en este paso. */
  private powersContext(): PowersContext {
    return {
      adventure: this.adventure,
      player: this.player,
      encounter: this.encounter,
      combo: this.combo,
      dummy: this.dummy,
      guardian: this.guardian,
      cameraYaw: this.cameraRig.yaw,
      damageSetting: this.settings.value.damageTaken,
      invulnerable: isInvulnerable(this.player.dodge) || this.powers.dashing,
    };
  }

  private effects(): EffectTargets {
    return {
      sfx: this.sfx,
      music: this.music,
      feedback: this.feedback,
      view: this.view,
      reduceMotion: this.settings.value.reduceMotion,
    };
  }

  private handleGuardian(events: readonly GuardianEvent[]): void {
    for (const e of events) {
      playGuardianEffects(this.effects(), this.guardian, e);
      if (e.type === 'guardianDefeated' && this.guardian) {
        this.handleAdventure(defeatBoss(this.adventure, this.guardian.data.id));
      }
      this.onGuardian(e);
    }
  }

  /** Comprueba si el golpe actual alcanza al muñeco. */
  private resolveDummyHit(): boolean {
    if (!this.adventure.zone.dummy) return false;
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
    const damage = Math.round(step.damage * templeFactor(this.progress.temple));
    if (!reach || hitDummy(this.dummy, damage, this.combo.swingId) <= 0) return false;
    this.onDummyChanged(this.dummy);
    if (this.feedback.tryFlash()) this.feedback.flashStart = this.feedback.clock;
    return true;
  }

  /** Efectos de usar un objeto; los textos los pone la interfaz. */
  private handleAdventure(events: readonly AdventureEvent[]): void {
    for (const e of events) {
      playAdventureEffects(this.effects(), e);
      if (e.type === 'talk') this.faceNpc(e.npc);
      if (e.type === 'rest') this.rest();
      if (e.type === 'chestOpened' && e.result.heartGained) {
        const max = maxQuarters(this.progress);
        setLife(this.encounter.health, max, max);
      }
      this.onAdventure(e);
    }
  }

  private faceNpc(id: NpcId): void {
    const npc = this.adventure.zone.npcs.find((n) => n.id === id);
    if (!npc) return;
    const p = this.player;
    p.yaw = p.prevYaw = Math.atan2(npc.x - p.x, npc.z - p.z);
    this.view.setTalking(id, p.x, p.z);
  }

  /** Descansar: cura, y los enemigos de la zona vuelven a su sitio. */
  private rest(): void {
    this.sfx.play('rest');
    resetHealth(this.encounter.health);
    this.view.encounterView.clear();
    clearCombat(this.encounter);
    spawnZoneEnemies(this.encounter, this.adventure.zone.enemies);
    if (this.guardian) resetGuardian(this.guardian);
  }

  /** Busca qué hay al alcance (unas veces por segundo), lo usa si se pulsó E y comprueba las salidas. */
  private updateInteraction(pressed: boolean): void {
    const p = this.player;
    if (++this.stepCount % PROMPT_EVERY_STEPS === 0 || pressed) {
      this.prompt = nearestInteractable(this.adventure, p.x, p.z);
    }
    if (pressed && this.prompt) {
      const item = this.prompt;
      this.prompt = null;
      this.handleAdventure(interact(this.adventure, item, p.x, p.z));
      return;
    }
    const exit = currentExit(this.adventure, p.x, p.z);
    if (exit) this.onExit(exit);
  }

  private registerSystems(): void {
    const state = this.input.state;

    this.systems.register({
      name: 'player',
      order: SYSTEM_ORDER.player,
      fixedUpdate: (dt) => {
        if (!this.playing) return;
        this.feedback.clock += dt;
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
        const axisNow = stunned ? { x: 0, z: 0 } : state.moveAxis();
        const dashing = this.powers.handleInput(this.powersContext(), dt, {
          stunned,
          dodging,
          pulse: state.takePressed('pulse'),
          dash: state.takePressed('dash'),
          moveX: axisNow.x,
          moveZ: axisNow.z,
          blocks: this.blocksNow(),
        });
        if (dashing) {
          // La carrera manda: ni otros movimientos ni ataques hasta que termine.
          state.takePressed('attack');
          state.takePressed('dodge');
          this.updateInteraction(false);
          return;
        }
        // Sin la Hoja no hay ataque.
        const hasBlade = hasFlag(this.progress, 'bladeTaken');
        const attackPressed = state.takePressed('attack') && !dodging && !stunned && hasBlade;
        if (dodgePressed && this.player.dodge.phase === 'ready') cancelCombo(this.combo);
        const wasReady = this.player.dodge.phase === 'ready';
        if (updateCombo(this.combo, attackPressed, dt) !== null) this.sfx.play('swing', this.combo.step);
        this.player.dodge.cooldownFactor = dodgeCooldownFactor(this.progress);
        updatePlayer(
          this.player,
          { moveX: axisNow.x, moveZ: axisNow.z, walk: state.isDown('walk'), dodge: dodgePressed },
          this.cameraRig.yaw,
          dt,
          this.blocksNow(),
          comboModifiers(this.combo),
        );
        if (wasReady && this.player.dodge.phase === 'dodging') this.sfx.play('dodge');
        this.updateInteraction(state.takePressed('interact') && !stunned);
      },
    });

    this.systems.register({
      name: 'combat',
      order: SYSTEM_ORDER.combat,
      fixedUpdate: (dt) => {
        if (!this.playing || this.hitStop > 0) return;
        this.powers.stepGuardian(this.powersContext(), dt);
        const dummyHit = this.resolveDummyHit();
        if (dummyHit) this.sfx.play('hit');
        const events = updateEncounter(this.encounter, dt, {
          player: this.player,
          playerRadius: PLAYER_BALANCE.radius,
          combo: this.combo,
          dodging: isInvulnerable(this.player.dodge) || this.powers.dashing,
          damageSetting: this.settings.value.damageTaken,
          blocks: this.blocksNow(),
          damageFactor: templeFactor(this.progress.temple),
        });
        this.powers.stepPulses(this.powersContext(), dt, this.blocksNow());
        const impact = this.feedback.handle(events) || dummyHit;
        if (impact) {
          this.hitStop = FEEDBACK_BALANCE.hitStop;
          this.feedback.shake();
        }
      },
    });

    this.systems.register({
      name: 'dummy',
      order: SYSTEM_ORDER.dummy,
      fixedUpdate: (dt) => {
        if (!this.playing || !this.adventure.zone.dummy) return;
        const wasDefeated = this.dummy.respawn > 0;
        updateDummy(this.dummy, dt);
        if (wasDefeated && this.dummy.respawn === 0) this.onDummyChanged(this.dummy);
      },
    });

    this.systems.register({
      name: 'camera',
      order: SYSTEM_ORDER.camera,
      frameUpdate: (frameSeconds, alpha) => {
        const mouse = state.takeMouseDelta();
        const look = this.playing
          ? {
              mouseX: mouse.x,
              mouseY: mouse.y,
              arrowX: (state.isDown('camRight') ? 1 : 0) - (state.isDown('camLeft') ? 1 : 0),
              arrowY: (state.isDown('camUp') ? 1 : 0) - (state.isDown('camDown') ? 1 : 0),
            }
          : null;
        this.view.updateCamera(this.cameraRig, this, look, this.feedback, frameSeconds, alpha);
      },
    });

    this.systems.register({
      name: 'render',
      order: SYSTEM_ORDER.render,
      frameUpdate: (frameSeconds, alpha) => this.view.render(this, this.feedback, frameSeconds, alpha),
    });

    this.systems.register({
      name: 'ui',
      order: SYSTEM_ORDER.ui,
      frameUpdate: () => {
        if (!this.playing) return;
        this.onHud(
          buildHudSnapshot({
            encounter: this.encounter,
            progress: this.progress,
            player: this.player,
            zone: this.adventure.zone,
            abilities: this.powers.state,
            guardian: this.guardian,
            prompt: this.prompt,
            arena: this.mode === 'arena',
          }),
        );
      },
    });
  }

  dispose(): void {
    this.music.dispose();
    this.sfx.dispose();
    this.world.scene.dispose();
    this.engine.setHardwareScalingLevel(1);
  }
}
