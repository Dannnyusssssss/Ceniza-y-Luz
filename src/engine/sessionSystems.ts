import type { BrowserInput } from '../core/input';
import type { SettingsStore } from '../core/settingsStore';
import { SYSTEM_ORDER, type SystemRegistry } from '../core/systems';
import type { BlockData } from '../data/arena';
import { DUMMY_BALANCE, FEEDBACK_BALANCE, PLAYER_BALANCE } from '../data/balance';
import type { ExitData } from '../data/zones';
import type { Sfx } from '../audio/sfx';
import {
  currentExit,
  interact,
  nearestInteractable,
  type AdventureEvent,
  type Interactable,
} from '../game/adventure';
import { cancelCombo, comboModifiers, currentStep, inHitWindow, isInArc, updateCombo } from '../game/combat';
import { isInvulnerable } from '../game/dodge';
import { hitDummy, updateDummy, type DummyState } from '../game/dummy';
import { updateEncounter } from '../game/encounter';
import { isDead } from '../game/health';
import { updatePlayer } from '../game/player';
import { dodgeCooldownFactor, hasFlag, templeFactor, type Progress } from '../game/progress';
import type { CameraRig } from '../world/cameraRig';
import type { CombatFeedback } from './combatFeedback';
import type { PowersContext, PowersRunner } from './powers';
import type { RegentRunner } from './regentRunner';
import { buildHudSnapshot, type HudSnapshot } from './sessionHud';
import type { SessionView, ViewState } from './sessionView';

/** Cada cuántos pasos de lógica se busca qué hay al alcance (6 = 10 veces por segundo). */
const PROMPT_EVERY_STEPS = 6;

/** Lo que los sistemas necesitan de la partida. */
export interface SystemsHost extends ViewState {
  readonly input: BrowserInput;
  readonly settings: SettingsStore;
  readonly sfx: Sfx;
  readonly feedback: CombatFeedback;
  readonly view: SessionView;
  readonly powers: PowersRunner;
  readonly regentRunner: RegentRunner;
  readonly cameraRig: CameraRig;
  readonly mode: 'story' | 'arena';
  readonly progress: Progress;
  hitStop: number;
  /** Lo que se puede usar ahora con E. */
  prompt: Interactable | null;
  powersContext(): PowersContext;
  blocksNow(): readonly BlockData[];
  handleAdventure(events: readonly AdventureEvent[]): void;
  onDummyChanged(dummy: DummyState): void;
  onHud(hud: HudSnapshot): void;
  onExit(exit: ExitData): void;
}

/** Busca qué hay al alcance (unas veces por segundo), lo usa si se pulsó E y comprueba las salidas. */
function updateInteraction(host: SystemsHost, pressed: boolean, step: number): void {
  const { player: p, adventure } = host;
  if (step % PROMPT_EVERY_STEPS === 0 || pressed) host.prompt = nearestInteractable(adventure, p.x, p.z);
  if (pressed && host.prompt) {
    const item = host.prompt;
    host.prompt = null;
    host.handleAdventure(interact(adventure, item, p.x, p.z));
    return;
  }
  const exit = currentExit(adventure, p.x, p.z);
  if (exit) host.onExit(exit);
}

/** Comprueba si el golpe actual alcanza al muñeco. */
function resolveDummyHit(host: SystemsHost): boolean {
  const { adventure, combo, player: p, dummy, feedback } = host;
  if (!adventure.zone.dummy) return false;
  const step = currentStep(combo);
  if (!step || !inHitWindow(combo)) return false;
  const reach = isInArc(p.x, p.z, p.yaw, dummy.x, dummy.z, DUMMY_BALANCE.radius, step.range, step.halfArc);
  const damage = Math.round(step.damage * templeFactor(host.progress.temple));
  if (!reach || hitDummy(dummy, damage, combo.swingId) <= 0) return false;
  host.onDummyChanged(dummy);
  if (feedback.tryFlash()) feedback.flashStart = feedback.clock;
  return true;
}

/** Registra los sistemas de una partida, en su orden. Es el único lugar donde se conectan. */
export function registerSessionSystems(systems: SystemRegistry, host: SystemsHost): void {
  const state = host.input.state;
  let stepCount = 0;

  systems.register({
    name: 'player',
    order: SYSTEM_ORDER.player,
    fixedUpdate: (dt) => {
      if (!host.playing) return;
      host.feedback.clock += dt;
      if (host.hitStop > 0) {
        // Pausa de impacto: un instante congelado al conectar un golpe.
        host.hitStop = Math.max(0, host.hitStop - dt);
        return;
      }
      stepCount++;
      const { player, combo, powers, sfx } = host;
      const health = host.encounter.health;
      // Caído o empujado por un golpe: no responde a los controles.
      const stunned = isDead(health) || health.knockTime > 0;
      const dodgePressed = state.takePressed('dodge') && !stunned;
      const dodging = player.dodge.phase === 'dodging';
      const axisNow = stunned ? { x: 0, z: 0 } : state.moveAxis();
      const dashing = powers.handleInput(host.powersContext(), dt, {
        stunned,
        dodging,
        pulse: state.takePressed('pulse'),
        dash: state.takePressed('dash'),
        moveX: axisNow.x,
        moveZ: axisNow.z,
        blocks: host.blocksNow(),
      });
      if (dashing) {
        // La carrera manda: ni otros movimientos ni ataques hasta que termine.
        state.takePressed('attack');
        state.takePressed('dodge');
        updateInteraction(host, false, stepCount);
        return;
      }
      // Sin la Hoja no hay ataque.
      const hasBlade = hasFlag(host.progress, 'bladeTaken');
      const attackPressed = state.takePressed('attack') && !dodging && !stunned && hasBlade;
      if (dodgePressed && player.dodge.phase === 'ready') cancelCombo(combo);
      const wasReady = player.dodge.phase === 'ready';
      if (updateCombo(combo, attackPressed, dt) !== null) sfx.play('swing', combo.step);
      player.dodge.cooldownFactor = dodgeCooldownFactor(host.progress);
      updatePlayer(
        player,
        { moveX: axisNow.x, moveZ: axisNow.z, walk: state.isDown('walk'), dodge: dodgePressed },
        host.cameraRig.yaw,
        dt,
        host.blocksNow(),
        comboModifiers(combo),
      );
      if (wasReady && player.dodge.phase === 'dodging') sfx.play('dodge');
      updateInteraction(host, state.takePressed('interact') && !stunned, stepCount);
    },
  });

  systems.register({
    name: 'combat',
    order: SYSTEM_ORDER.combat,
    fixedUpdate: (dt) => {
      if (!host.playing || host.hitStop > 0) return;
      const { powers, player, feedback } = host;
      powers.stepGuardian(host.powersContext(), dt);
      host.regentRunner.step(host.powersContext(), dt);
      const dummyHit = resolveDummyHit(host);
      if (dummyHit) host.sfx.play('hit');
      const events = updateEncounter(host.encounter, dt, {
        player,
        playerRadius: PLAYER_BALANCE.radius,
        combo: host.combo,
        dodging: isInvulnerable(player.dodge) || powers.dashing,
        damageSetting: host.settings.value.damageTaken,
        blocks: host.blocksNow(),
        damageFactor: templeFactor(host.progress.temple),
      });
      powers.stepPulses(host.powersContext(), dt, host.blocksNow());
      const impact = feedback.handle(events) || dummyHit;
      if (impact) {
        host.hitStop = FEEDBACK_BALANCE.hitStop;
        feedback.shake();
      }
    },
  });

  systems.register({
    name: 'dummy',
    order: SYSTEM_ORDER.dummy,
    fixedUpdate: (dt) => {
      if (!host.playing || !host.adventure.zone.dummy) return;
      const wasDefeated = host.dummy.respawn > 0;
      updateDummy(host.dummy, dt);
      if (wasDefeated && host.dummy.respawn === 0) host.onDummyChanged(host.dummy);
    },
  });

  systems.register({
    name: 'camera',
    order: SYSTEM_ORDER.camera,
    frameUpdate: (frameSeconds, alpha) => {
      const mouse = state.takeMouseDelta();
      const look = host.playing
        ? {
            mouseX: mouse.x,
            mouseY: mouse.y,
            arrowX: (state.isDown('camRight') ? 1 : 0) - (state.isDown('camLeft') ? 1 : 0),
            arrowY: (state.isDown('camUp') ? 1 : 0) - (state.isDown('camDown') ? 1 : 0),
          }
        : null;
      host.view.updateCamera(host.cameraRig, host, look, host.feedback, frameSeconds, alpha);
    },
  });

  systems.register({
    name: 'render',
    order: SYSTEM_ORDER.render,
    frameUpdate: (frameSeconds, alpha) => host.view.render(host, host.feedback, frameSeconds, alpha),
  });

  systems.register({
    name: 'ui',
    order: SYSTEM_ORDER.ui,
    frameUpdate: () => {
      if (!host.playing) return;
      host.onHud(
        buildHudSnapshot({
          encounter: host.encounter,
          progress: host.progress,
          player: host.player,
          zone: host.adventure.zone,
          abilities: host.powers.state,
          guardian: host.guardian,
          regent: host.regent,
          prompt: host.prompt,
          arena: host.mode === 'arena',
        }),
      );
    },
  });
}
