import type { BlockData } from '../data/arena';
import { ABILITY_BALANCE } from '../data/items';
import { GUARDIAN } from '../data/guardian';
import { REGENT } from '../data/regent';
import { PLAYER_BALANCE } from '../data/balance';
import type { Sfx } from '../audio/sfx';
import {
  aimYaw,
  createAbilities,
  firePulse,
  movePulses,
  prunePulses,
  pulseTouches,
  resetAbilities,
  startDash,
  updateCooldowns,
  updateDash,
  withoutCracks,
  type AbilityState,
} from '../game/abilities';
import {
  lightPiece,
  pulseTargets,
  shatterGates,
  type AdventureEvent,
  type AdventureState,
} from '../game/adventure';
import { cancelCombo, currentStep, inHitWindow, isInArc, type ComboState } from '../game/combat';
import { hitDummy, type DummyState } from '../game/dummy';
import { strikeEnemy, type EncounterEvent, type EncounterState } from '../game/encounter';
import { isAlive, isHittable } from '../game/enemies';
import {
  dashAgainstGuardian,
  hitGuardian,
  isGuardianHittable,
  updateGuardian,
  type GuardianEvent,
  type GuardianState,
} from '../game/guardian';
import {
  hitRegent,
  isRegentHittable,
  lightBrazier,
  pendingBraziers,
  type RegentEvent,
  type RegentState,
} from '../game/regent';
import { hurtPlayer, isDead } from '../game/health';
import { cameraRelativeDirection, type PlayerState } from '../game/player';
import { createProjectile } from '../game/projectiles';
import { spawnSparks } from '../game/sparks';
import { templeFactor } from '../game/progress';
import type { DamageTaken } from '../data/settings';

/** Lo que el runner necesita de la partida en cada paso. */
export interface PowersContext {
  readonly adventure: AdventureState;
  readonly player: PlayerState;
  readonly encounter: EncounterState;
  readonly combo: ComboState;
  readonly dummy: DummyState;
  readonly guardian: GuardianState | null;
  readonly regent: RegentState | null;
  readonly cameraYaw: number;
  readonly damageSetting: DamageTaken;
  readonly invulnerable: boolean;
}

/** Lo que el runner avisa a la partida. */
export interface PowersHooks {
  onEncounterEvents(events: readonly EncounterEvent[]): void;
  onAdventureEvents(events: readonly AdventureEvent[]): void;
  onGuardianEvents(events: readonly GuardianEvent[]): void;
  onRegentEvents(events: readonly RegentEvent[]): void;
  onBurst(x: number, z: number): void;
  onDummyHit(dummy: DummyState): void;
  /** El golpe de la Hoja conectó con el jefe: pausa de impacto. */
  onBladeImpact(): void;
}

/** Las dos habilidades y el combate contra el jefe: el enlace entre la lógica pura y la partida. */
export class PowersRunner {
  readonly state = createAbilities();

  constructor(
    private readonly sfx: Sfx,
    private readonly hooks: PowersHooks,
  ) {}

  reset(): void {
    resetAbilities(this.state);
  }

  get dashing(): boolean {
    return this.state.dash !== null;
  }

  /** Lanza el Pulso hacia donde mira la cámara, con un ajuste suave hacia lo que tenga cerca de esa línea. */
  private tryPulse(ctx: PowersContext): boolean {
    const { player: p, adventure, encounter, guardian, regent } = ctx;
    const targets: { x: number; z: number }[] = [
      ...pulseTargets(adventure),
      ...encounter.enemies.filter(isAlive),
    ];
    if (guardian && isGuardianHittable(guardian)) targets.push(guardian);
    if (regent) {
      // Con el velo puesto, lo que importa son los braseros: no el Regente.
      targets.push(...pendingBraziers(regent));
      if (isRegentHittable(regent) && !regent.veiled) targets.push(regent);
    }
    const yaw = aimYaw(p.x, p.z, ctx.cameraYaw, targets);
    if (!firePulse(this.state, p.x, p.z, yaw)) return false;
    p.yaw = p.prevYaw = yaw;
    p.vx = p.vz = 0;
    this.sfx.play('pulse');
    return true;
  }

  /** Lanza el Impulso hacia donde se pulsa o, sin dirección, hacia donde mira el personaje. */
  private tryDash(ctx: PowersContext, moveX: number, moveZ: number, blocks: readonly BlockData[]): boolean {
    const { player: p, adventure } = ctx;
    if (this.state.dashCooldown > 0 || this.state.dash) return false;
    const input = cameraRelativeDirection(moveX, moveZ, ctx.cameraYaw);
    const hasInput = input.x !== 0 || input.z !== 0;
    const dirX = hasInput ? input.x : Math.sin(p.yaw);
    const dirZ = hasInput ? input.z : Math.cos(p.yaw);
    // Las barreras de cristal se rompen antes de calcular hasta dónde llega: no la detienen.
    const shattered = shatterGates(adventure, p.x, p.z, dirX, dirZ, PLAYER_BALANCE.radius);
    if (shattered.length > 0) this.hooks.onAdventureEvents(shattered);
    const list = shattered.length > 0 ? adventure.blocks : blocks;
    if (!startDash(this.state, p.x, p.z, dirX, dirZ, PLAYER_BALANCE.radius, list)) return false;
    p.yaw = p.prevYaw = Math.atan2(dirX, dirZ);
    p.vx = p.vz = 0;
    this.sfx.play('dash');
    this.hooks.onBurst(p.x, p.z);
    return true;
  }

  /** Atiende las teclas de las habilidades y avanza la carrera. Devuelve true si la carrera manda en este paso. */
  handleInput(
    ctx: PowersContext,
    dt: number,
    input: {
      readonly stunned: boolean;
      readonly dodging: boolean;
      readonly pulse: boolean;
      readonly dash: boolean;
      readonly moveX: number;
      readonly moveZ: number;
      readonly blocks: readonly BlockData[];
    },
  ): boolean {
    const moved = this.stepMovement(ctx, dt, input.stunned);
    const free = !input.stunned && !input.dodging && !moved;
    const known = ctx.adventure.progress.abilities;
    if (input.pulse && free && known.includes('pulso') && this.tryPulse(ctx)) cancelCombo(ctx.combo);
    if (input.dash && free && known.includes('impulso')) {
      if (this.tryDash(ctx, input.moveX, input.moveZ, input.blocks)) cancelCombo(ctx.combo);
    }
    return moved || this.dashing;
  }

  /** Avanza las esperas y la carrera. Devuelve true si la carrera movió al jugador en este paso. */
  private stepMovement(ctx: PowersContext, dt: number, stunned: boolean): boolean {
    updateCooldowns(this.state, dt);
    if (stunned) this.state.dash = null;
    if (!this.state.dash) return false;
    const p = ctx.player;
    p.prevX = p.x;
    p.prevZ = p.z;
    p.prevYaw = p.yaw;
    updateDash(this.state, p, dt);
    p.speed = Math.hypot(p.x - p.prevX, p.z - p.prevZ) / dt;
    if (ctx.guardian) this.hooks.onGuardianEvents(dashAgainstGuardian(ctx.guardian, p.x, p.z));
    return true;
  }

  /** Mueve los disparos y resuelve lo que alcanzan. */
  stepPulses(ctx: PowersContext, dt: number, blocks: readonly BlockData[]): void {
    const { encounter, guardian, regent, adventure, dummy } = ctx;
    if (this.state.pulses.length === 0) return;
    movePulses(this.state, dt, withoutCracks(blocks));
    const damage = Math.round(ABILITY_BALANCE.pulso.damage * templeFactor(adventure.progress.temple));
    const events: EncounterEvent[] = [];
    for (const pulse of this.state.pulses) {
      // Identificador negativo: no se confunde con el de un tajo de la Hoja.
      const hitId = -pulse.id;
      for (const enemy of encounter.enemies) {
        if (!isHittable(enemy) || !pulseTouches(pulse, enemy.x, enemy.z, enemy.stats.radius)) continue;
        strikeEnemy(encounter, enemy, damage, hitId, pulse.prevX, pulse.prevZ, events);
        pulse.alive = false;
        break;
      }
      for (const shot of encounter.projectiles) {
        if (shot.state !== 'flying' || !pulseTouches(pulse, shot.x, shot.z, shot.radius)) continue;
        shot.state = 'cut';
        events.push({ type: 'projectileEnded', x: shot.x, z: shot.z, how: 'cut' });
      }
      if (
        guardian &&
        isGuardianHittable(guardian) &&
        pulseTouches(pulse, guardian.x, guardian.z, GUARDIAN.radius)
      ) {
        this.hooks.onGuardianEvents(hitGuardian(guardian, damage, hitId));
        pulse.alive = false;
      }
      if (regent) this.pulseAgainstRegent(pulse, regent, damage, hitId);
      for (const target of pulseTargets(adventure)) {
        if (!pulseTouches(pulse, target.x, target.z, 0.7)) continue;
        this.hooks.onAdventureEvents(lightPiece(adventure, target));
        pulse.alive = false;
        break;
      }
      if (adventure.zone.dummy && dummy.respawn <= 0 && pulseTouches(pulse, dummy.x, dummy.z, 0.5)) {
        if (hitDummy(dummy, damage, hitId) > 0) this.hooks.onDummyHit(dummy);
        pulse.alive = false;
      }
    }
    for (let i = encounter.projectiles.length - 1; i >= 0; i--) {
      if (encounter.projectiles[i]?.state === 'cut') encounter.projectiles.splice(i, 1);
    }
    for (const end of prunePulses(this.state)) this.hooks.onBurst(end.x, end.z);
    if (events.length > 0) this.hooks.onEncounterEvents(events);
  }

  /** Un disparo en la sala del Regente: enciende un brasero o, si no, le alcanza a él. */
  private pulseAgainstRegent(
    pulse: AbilityState['pulses'][number],
    regent: RegentState,
    damage: number,
    hitId: number,
  ): void {
    for (const brazier of pendingBraziers(regent)) {
      if (!pulseTouches(pulse, brazier.x, brazier.z, 0.8)) continue;
      this.hooks.onRegentEvents(lightBrazier(regent, brazier.index));
      pulse.alive = false;
      return;
    }
    if (isRegentHittable(regent) && pulseTouches(pulse, regent.x, regent.z, REGENT.radius)) {
      this.hooks.onRegentEvents(hitRegent(regent, damage, hitId));
      pulse.alive = false;
    }
  }

  /** Un paso del combate contra el jefe: la Hoja, sus ataques y sus fragmentos. */
  stepGuardian(ctx: PowersContext, dt: number): void {
    const { guardian, player: p, encounter, combo } = ctx;
    if (!guardian) return;
    const health = encounter.health;
    const out = updateGuardian(guardian, dt, p.x, p.z, !isDead(health));
    const step = currentStep(combo);
    if (!isDead(health) && step && inHitWindow(combo) && isGuardianHittable(guardian)) {
      const reach = isInArc(
        p.x,
        p.z,
        p.yaw,
        guardian.x,
        guardian.z,
        GUARDIAN.radius,
        step.range,
        step.halfArc,
      );
      if (reach) {
        const damage = Math.round(step.damage * templeFactor(ctx.adventure.progress.temple));
        const hit = hitGuardian(guardian, damage, combo.swingId);
        if (hit.some((e) => e.type === 'guardianHit')) this.hooks.onBladeImpact();
        out.events.push(...hit);
      }
    }
    if (out.strike) {
      const dealt = hurtPlayer(health, p, out.strike.damage, out.strike, {
        dodging: ctx.invulnerable,
        setting: ctx.damageSetting,
      });
      if (dealt > 0) {
        const events: EncounterEvent[] = [
          { type: 'playerHit', damage: dealt, fromX: out.strike.fromX, fromZ: out.strike.fromZ },
        ];
        if (isDead(health)) events.push({ type: 'playerDown' });
        this.hooks.onEncounterEvents(events);
      }
    }
    if (out.projectiles.length > 0) {
      for (const spawn of out.projectiles) {
        encounter.projectiles.push(createProjectile(encounter.nextId++, spawn));
      }
      this.hooks.onEncounterEvents([{ type: 'projectileFired', x: guardian.x, z: guardian.z }]);
    }
    if (out.events.some((e) => e.type === 'guardianDying')) {
      const [min, max] = GUARDIAN.sparks;
      spawnSparks(encounter.sparks, guardian.x, guardian.z, encounter.rng.int(min, max), encounter.rng);
    }
    if (out.events.length > 0) this.hooks.onGuardianEvents(out.events);
  }
}
