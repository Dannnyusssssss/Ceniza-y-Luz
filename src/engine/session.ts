import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { BrowserInput } from '../core/input';
import { SystemRegistry } from '../core/systems';
import type { SettingsStore } from '../core/settingsStore';
import type { CharacterId } from '../data/characters';
import { FEEDBACK_BALANCE } from '../data/balance';
import { HOME_SHOTS, RESCUE_SHOTS } from '../data/intro';
import { LUMBRE_NIGHT_PALETTE, type ZonePalette } from '../data/palettes';
import { QUALITY_PRESETS } from '../data/quality';
import { applyRenderScale } from './renderScale';
import { ZONES, type ExitData, type ZoneId } from '../data/zones';
import {
  createAdventure,
  enterZone,
  type AdventureEvent,
  type AdventureState,
  type Interactable,
} from '../game/adventure';
import type { AbilityState } from '../game/abilities';
import { createPlayer, type PlayerState } from '../game/player';
import { createGuardian, type GuardianEvent, type GuardianState } from '../game/guardian';
import { createRegent, type RegentEvent, type RegentState } from '../game/regent';
import { isInvulnerable } from '../game/dodge';
import { cancelCombo, createCombo, type ComboState } from '../game/combat';
import { createDummy, type DummyState } from '../game/dummy';
import {
  clearCombat,
  createEncounter,
  resetEncounter,
  retryEncounter,
  spawnZoneEnemies,
  type EncounterState,
} from '../game/encounter';
import { reviveLoaded, resetHealth, setLife } from '../game/health';
import { addSparks, usePotion } from '../game/inventory';
import { createProgress, hasFlag, maxQuarters, setFlag, type Progress } from '../game/progress';
import { createCameraRig, type CameraRig } from '../world/cameraRig';
import { Music } from '../audio/music';
import { Sfx } from '../audio/sfx';
import { loadAssets, type SessionAssets } from './assets';
import { CombatFeedback } from './combatFeedback';
import { PowersRunner, type PowersContext } from './powers';
import { RegentRunner } from './regentRunner';
import { SessionEvents } from './sessionEvents';
import type { HudSnapshot } from './sessionHud';
import { registerSessionSystems } from './sessionSystems';
import { SolidBlocks } from './solidBlocks';
import { SessionView } from './sessionView';
import { createWorldScene, type WorldScene } from './worldScene';

/** Modo de juego: la aventura o la arena de oleadas (solo para probar el balance). */
export type GameMode = 'story' | 'arena';

/** Inclinación de la cámara al mostrar al personaje en la pantalla de elección. */
const SHOWCASE_PITCH = 0.1;
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
  readonly regentRunner: RegentRunner;
  guardian: GuardianState | null = null;
  regent: RegentState | null = null;
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
  onRegent: (event: RegentEvent) => void = () => undefined;
  readonly view: SessionView;
  readonly feedback: CombatFeedback;
  /** Lo que se puede usar ahora con E. */
  prompt: Interactable | null = null;
  private readonly solids = new SolidBlocks();
  private readonly events = new SessionEvents(this);

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
    applyRenderScale(engine, quality, settings.value.resolutionScale);
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
    readonly input: BrowserInput,
    readonly settings: SettingsStore,
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
      onGuardianEvents: (events) => this.events.guardian(events),
      onRegentEvents: (events) => this.events.regent(events),
      onBurst: (x, z) => this.view.encounterView.burst(x, z, settings.value.reduceMotion),
      onDummyHit: (dummy) => this.onDummyChanged(dummy),
      onBladeImpact: () => {
        this.hitStop = FEEDBACK_BALANCE.hitStop;
        this.feedback.shake();
      },
    });
    this.regentRunner = new RegentRunner({
      onEncounterEvents: (events) => {
        if (this.feedback.handle(events)) this.feedback.shake();
      },
      onRegentEvents: (events) => this.events.regent(events),
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
    registerSessionSystems(this.systems, this);
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
    const beaten = boss ? this.progress.bosses.includes(boss.id) : false;
    this.guardian = boss?.id === 'guardian' ? createGuardian(boss, beaten) : null;
    this.regent = boss?.id === 'regente' ? createRegent(boss, beaten) : null;
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

  /** El final, en la sala del trono: planos fijos con los dos gemelos. */
  startRescueScene(): void {
    this.view.startIntro(this.adventure, this.progress.character, RESCUE_SHOTS, true);
  }

  /** El final, de vuelta en Lumbre. La partida guardada no cambia de lugar: sigue en el último faro. */
  startHomeScene(): void {
    this.view.endIntro();
    this.loadZone('lumbre', START_ENTRY);
    this.view.startIntro(this.adventure, this.progress.character, HOME_SHOTS, true);
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
  blocksNow(): ReturnType<SolidBlocks['get']> {
    return this.solids.get(this.adventure, this.dummy);
  }

  /** Lo que necesitan las habilidades y el jefe en este paso. */
  powersContext(): PowersContext {
    return {
      adventure: this.adventure,
      player: this.player,
      encounter: this.encounter,
      combo: this.combo,
      dummy: this.dummy,
      guardian: this.guardian,
      regent: this.regent,
      cameraYaw: this.cameraRig.yaw,
      damageSetting: this.settings.value.damageTaken,
      invulnerable: isInvulnerable(this.player.dodge) || this.powers.dashing,
    };
  }

  /** Atiende lo que pasó en el mundo. */
  handleAdventure(events: readonly AdventureEvent[]): void {
    this.events.adventure(events);
  }

  get reduceMotion(): boolean {
    return this.settings.value.reduceMotion;
  }

  dispose(): void {
    this.music.dispose();
    this.sfx.dispose();
    this.world.scene.dispose();
    this.engine.setHardwareScalingLevel(1);
  }
}
