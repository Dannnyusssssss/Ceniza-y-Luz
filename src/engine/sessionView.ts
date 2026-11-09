import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { lerp, lerpAngle } from '../core/math';
import type { SettingsStore } from '../core/settingsStore';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { QUALITY_PRESETS } from '../data/quality';
import type { ZonePalette } from '../data/palettes';
import type { NpcId } from '../data/zones';
import { isGateOpen, type AdventureState } from '../game/adventure';
import { currentStep, type ComboState } from '../game/combat';
import { dashProgress, type AbilityState } from '../game/abilities';
import { dodgeProgress } from '../game/dodge';
import type { DummyState } from '../game/dummy';
import type { EncounterState } from '../game/encounter';
import { flashIntensity, shakeOffset } from '../game/feedback';
import type { GuardianState } from '../game/guardian';
import { isDead } from '../game/health';
import type { PlayerState } from '../game/player';
import { applyLook, updateCameraPose, type CameraRig, type LookInput } from '../world/cameraRig';
import { groundHeight } from '../world/terrain';
import { ARROW_CAMERA_SPEED, MOUSE_CAMERA_SPEED } from '../data/controls';
import { AbilityView } from '../render/abilityView';
import { CharacterView } from '../render/characterView';
import { GuardianView } from '../render/guardianView';
import { DummyView } from '../render/dummyModel';
import { EncounterView } from '../render/encounterView';
import { ZoneEnvironment } from '../render/zoneEnvironment';
import { ZoneProps } from '../render/zoneProps';
import type { SessionAssets } from './assets';
import type { CombatFeedback } from './combatFeedback';
import { IntroDirector } from './introDirector';
import { createPostProcess, applyPostProcessQuality } from './postProcess';
import { ThirdPersonCamera } from './thirdPersonCamera';
import {
  applyPalette,
  applyShadowFilter,
  focusShadows,
  setShadowExtent,
  type WorldScene,
} from './worldScene';

/** Duración del tinte rojo al recibir un golpe (s). */
const HURT_TINT_SECONDS = 0.35;

/** Estado de la partida que necesita la vista en cada fotograma. */
export interface ViewState {
  readonly adventure: AdventureState;
  readonly player: PlayerState;
  readonly combo: ComboState;
  readonly dummy: DummyState;
  readonly encounter: EncounterState;
  readonly playing: boolean;
  readonly hitStop: number;
  readonly abilities: AbilityState;
  readonly guardian: GuardianState | null;
}

/**
 * Lo que se ve de una partida: cámara, personaje, zona, enemigos e intro. Lee el estado y dibuja; nunca lo cambia.
 * Al salir de una zona libera todo lo que creó para ella.
 */
export class SessionView {
  readonly camera: ThirdPersonCamera;
  readonly pipeline: DefaultRenderingPipeline;
  readonly encounterView: EncounterView;
  private character: CharacterView;
  private readonly dummyView: DummyView;
  private environment: ZoneEnvironment | null = null;
  private props: ZoneProps | null = null;
  private intro: IntroDirector | null = null;
  private readonly abilityView: AbilityView;
  private guardianView: GuardianView | null = null;
  private groundAt: (x: number, z: number) => number = () => 0;

  constructor(
    engine: AbstractEngine,
    private readonly world: WorldScene,
    private readonly assets: SessionAssets,
    private readonly settings: SettingsStore,
    characterId: CharacterId,
  ) {
    const quality = QUALITY_PRESETS[settings.value.quality];
    this.camera = new ThirdPersonCamera(world.scene, settings.value.fov);
    this.pipeline = createPostProcess(world.scene, this.camera.camera, quality);
    this.character = this.buildCharacter(characterId);
    this.dummyView = new DummyView(world.scene, assets.dummy, world.materials, world.shadows);
    this.encounterView = new EncounterView(world.scene, assets.enemies, world.materials, world.shadows);
    this.abilityView = new AbilityView(world.scene, world.materials, () => this.groundAt);
    settings.onChange((s) => {
      const q = QUALITY_PRESETS[s.quality];
      engine.setHardwareScalingLevel(q.hardwareScaling);
      applyShadowFilter(world.shadows, q);
      applyPostProcessQuality(this.pipeline, q);
      this.camera.setFov(s.fov);
    });
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

  setCharacter(characterId: CharacterId, bladeVisible: boolean): void {
    this.character.dispose();
    this.character = this.buildCharacter(characterId);
    this.character.setBladeVisible(bladeVisible);
  }

  setBladeVisible(visible: boolean): void {
    this.character.setBladeVisible(visible);
  }

  /** Quita la zona actual: todo lo que se creó para ella se libera. */
  unloadZone(): void {
    this.props?.dispose();
    this.props = null;
    this.environment?.dispose();
    this.environment = null;
    this.encounterView.clear();
    this.abilityView.clear();
    this.guardianView?.dispose();
    this.guardianView = null;
  }

  /** Destello del jefe al recibir un golpe (quien llama respeta el límite de 3 por segundo). */
  flashGuardian(): void {
    this.guardianView?.flash();
  }

  /** Crea lo que se ve de la zona actual de la aventura. */
  loadZone(adventure: AdventureState, palette: ZonePalette | undefined, npcs: boolean): void {
    this.unloadZone();
    const zone = adventure.zone;
    const look = palette ?? zone.palette;
    const { scene, materials, shadows } = this.world;
    applyPalette(this.world, look);
    setShadowExtent(this.world, zone.shadowExtent);
    this.environment = new ZoneEnvironment(scene, zone, adventure.layout, look, materials, shadows);
    this.props = new ZoneProps(scene, zone, this.assets.props, materials, shadows, adventure, { npcs });
    this.groundAt = (x, z) => groundHeight(zone, x, z);
    this.encounterView.setGround(this.groundAt);
    if (zone.boss && !adventure.progress.bosses.includes(zone.boss.id)) {
      this.guardianView = new GuardianView(scene, this.assets.guardian, materials, shadows, this.groundAt);
    }
    this.dummyView.setVisible(zone.dummy !== null);
  }

  startIntro(adventure: AdventureState, characterId: CharacterId): void {
    this.character.setBladeVisible(false);
    this.intro = new IntroDirector(
      this.world.scene,
      adventure.zone,
      this.character,
      this.camera,
      this.encounterView,
      this.assets,
      this.world.materials,
      this.world.shadows,
      characterId,
    );
  }

  setIntroShot(index: number): void {
    this.intro?.show(index);
  }

  endIntro(): void {
    this.intro?.dispose();
    this.intro = null;
  }

  setTalking(id: NpcId | null, x = 0, z = 0): void {
    this.props?.setTalking(id, x, z);
  }

  focusShadows(x: number, z: number): void {
    focusShadows(this.world, x, z);
  }

  /** Mueve la cámara según lo que pide el jugador. En la intro la ponen sus planos fijos. */
  updateCamera(
    rig: CameraRig,
    state: ViewState,
    look: LookInput | null,
    feedback: CombatFeedback,
    frameSeconds: number,
    alpha: number,
  ): void {
    if (this.intro) return;
    const s = this.settings.value;
    if (look) {
      applyLook(
        rig,
        look,
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
    const shake = shakeOffset(feedback.clock - feedback.shakeStart, !s.reduceMotion);
    this.camera.setShake(shake.x, shake.y);
    const px = lerp(state.player.prevX, state.player.x, alpha);
    const pz = lerp(state.player.prevZ, state.player.z, alpha);
    const zone = state.adventure.zone;
    this.camera.apply(
      updateCameraPose(rig, px, pz, state.adventure.layout.cameraBlocks, frameSeconds, undefined, (x, z) =>
        groundHeight(zone, x, z),
      ),
    );
    focusShadows(this.world, px, pz);
  }

  /** Dibuja un fotograma: entorno, objetos, personaje, muñeco y combate. */
  render(state: ViewState, feedback: CombatFeedback, frameSeconds: number, alpha: number): void {
    const { player: p, encounter, adventure, combo, dummy, playing, hitStop, abilities, guardian } = state;
    const s = this.settings.value;
    const health = encounter.health;
    const zone = adventure.zone;
    const animSeconds = playing && hitStop <= 0 ? frameSeconds : 0;
    const mist = zone.gates.find((g) => g.style === 'mist');
    this.environment?.update(
      frameSeconds,
      s.reduceMotion,
      mist !== undefined && isGateOpen(adventure, mist),
      QUALITY_PRESETS[s.quality].lightShafts,
    );
    // Los aldeanos y los objetos siguen vivos en los diálogos y en la pantalla de elección.
    this.props?.update(adventure, frameSeconds, s.reduceMotion, p.x, p.z);
    if (this.intro) {
      this.intro.update(frameSeconds, s.reduceMotion);
      return;
    }
    const root = this.character.root;
    const x = lerp(p.prevX, p.x, alpha);
    const z = lerp(p.prevZ, p.z, alpha);
    root.position.set(x, groundHeight(zone, x, z), z);
    root.rotation.y = lerpAngle(p.prevYaw, p.yaw, alpha);
    const step = currentStep(combo);
    // En la pantalla de elección el personaje respira (reposo) aunque la partida no avance.
    this.character.update(
      {
        speed: playing ? p.speed : 0,
        dodge: dashProgress(abilities) ?? dodgeProgress(p.dodge),
        attack: step ? { step: combo.step, time: combo.time } : null,
        hurt: health.sinceHit,
        dead: isDead(health) ? health.deadFor : null,
        reduceMotion: s.reduceMotion,
      },
      playing ? animSeconds : frameSeconds,
    );
    const tint = feedback.clock - feedback.hurtTintStart;
    this.character.setHurtTint(s.reduceFlashing ? 0 : Math.max(0, 1 - tint / HURT_TINT_SECONDS));
    if (zone.dummy) {
      const flash = s.reduceFlashing ? 0 : flashIntensity(feedback.clock - feedback.flashStart);
      this.dummyView.update(dummy, flash, s.reduceMotion, animSeconds, groundHeight(zone, dummy.x, dummy.z));
    }
    this.encounterView.update(encounter, alpha, animSeconds, s.reduceFlashing, s.reduceMotion, x, z);
    this.abilityView.update(abilities, alpha);
    if (guardian && this.guardianView) {
      this.guardianView.update(guardian, alpha, animSeconds, s.reduceFlashing);
      if (guardian.phase === 'dying' && animSeconds > 0) {
        const count = Math.floor((s.reduceMotion ? 40 : 90) * animSeconds + Math.random());
        this.encounterView.mist(guardian.x, guardian.z, count, 1.4, 3.2);
      }
    }
  }
}
