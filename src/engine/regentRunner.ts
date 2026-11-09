import { REGENT } from '../data/regent';
import { currentStep, inHitWindow, isInArc } from '../game/combat';
import { strikeEnemy, type EncounterEvent } from '../game/encounter';
import { createEnemy, isAlive } from '../game/enemies';
import { hurtPlayer, isDead } from '../game/health';
import { templeFactor } from '../game/progress';
import { createProjectile } from '../game/projectiles';
import { hitRegent, isRegentHittable, updateRegent, type RegentEvent } from '../game/regent';
import { spawnSparks } from '../game/sparks';
import type { PowersContext } from './powers';

/** Lo que este combate avisa a la partida. */
export interface RegentHooks {
  onEncounterEvents(events: readonly EncounterEvent[]): void;
  onRegentEvents(events: readonly RegentEvent[]): void;
  onBladeImpact(): void;
}

/** El combate contra el Regente: la Hoja, sus ataques, sus proyectiles y las Brumillas que invoca. */
export class RegentRunner {
  /** Identificadores de las Brumillas invocadas: nunca hay más de las permitidas a la vez. */
  private minions: number[] = [];

  constructor(private readonly hooks: RegentHooks) {}

  /** Un paso del combate. No hace nada fuera de la sala del Regente. */
  step(ctx: PowersContext, dt: number): void {
    const { regent, player: p, encounter, combo } = ctx;
    if (!regent) return;
    const health = encounter.health;
    const out = updateRegent(regent, dt, p.x, p.z, !isDead(health));
    const step = currentStep(combo);
    if (!isDead(health) && step && inHitWindow(combo) && isRegentHittable(regent)) {
      const reach = isInArc(p.x, p.z, p.yaw, regent.x, regent.z, REGENT.radius, step.range, step.halfArc);
      if (reach) {
        const damage = Math.round(step.damage * templeFactor(ctx.adventure.progress.temple));
        const hit = hitRegent(regent, damage, combo.swingId);
        if (hit.some((e) => e.type === 'regentHit')) this.hooks.onBladeImpact();
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
      this.hooks.onEncounterEvents([{ type: 'projectileFired', x: regent.x, z: regent.z }]);
    }
    this.summon(ctx, out.summons);
    if (out.events.some((e) => e.type === 'regentDying')) this.finish(ctx);
    if (out.events.length > 0) this.hooks.onRegentEvents(out.events);
  }

  private aliveMinions(ctx: PowersContext): number[] {
    const alive = ctx.encounter.enemies.filter((e) => this.minions.includes(e.id) && isAlive(e));
    return alive.map((e) => e.id);
  }

  private summon(ctx: PowersContext, points: readonly { x: number; z: number }[]): void {
    if (points.length === 0) return;
    this.minions = this.aliveMinions(ctx);
    const { encounter, regent } = ctx;
    for (const point of points) {
      if (this.minions.length >= REGENT.minions || !regent) break;
      const id = encounter.nextId++;
      this.minions.push(id);
      encounter.enemies.push(createEnemy(id, 'brumilla', point.x, point.z, regent.yaw));
    }
  }

  /** Al caer el Regente, sus Brumillas se deshacen con él y deja sus chispas. */
  private finish(ctx: PowersContext): void {
    const { encounter, regent } = ctx;
    if (!regent) return;
    const events: EncounterEvent[] = [];
    for (const enemy of encounter.enemies) {
      if (!this.minions.includes(enemy.id) || !isAlive(enemy)) continue;
      strikeEnemy(encounter, enemy, enemy.health, encounter.nextId++, regent.x, regent.z, events);
    }
    this.minions = [];
    encounter.projectiles.length = 0;
    const [min, max] = REGENT.sparks;
    spawnSparks(encounter.sparks, regent.x, regent.z, encounter.rng.int(min, max), encounter.rng);
    if (events.length > 0) this.hooks.onEncounterEvents(events);
  }
}
