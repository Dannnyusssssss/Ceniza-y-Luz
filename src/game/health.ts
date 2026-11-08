import { HEALTH_BALANCE } from '../data/balance';
import type { DamageTaken } from '../data/settings';
import type { BlockData } from '../data/arena';
import { moveCircle, type Position2 } from '../world/collision';

export type HealthBalance = typeof HEALTH_BALANCE;

/** Vida del jugador, en cuartos de corazón. */
export interface HealthState {
  quarters: number;
  maxQuarters: number;
  /** Tiempo que queda de invulnerabilidad tras un golpe. */
  invulnerable: number;
  /** Empuje en curso (dirección unitaria y tiempo restante). */
  knockX: number;
  knockZ: number;
  knockTime: number;
  /** Tiempo desde que cayó (−1 = vivo). */
  deadFor: number;
  /** Tiempo desde el último golpe recibido (para el destello y el sonido). */
  sinceHit: number;
}

export function createHealth(
  hearts: number = HEALTH_BALANCE.startHearts,
  balance: HealthBalance = HEALTH_BALANCE,
): HealthState {
  const max = Math.max(1, Math.round(hearts)) * balance.quartersPerHeart;
  return {
    quarters: max,
    maxQuarters: max,
    invulnerable: 0,
    knockX: 0,
    knockZ: 0,
    knockTime: 0,
    deadFor: -1,
    sinceHit: Number.POSITIVE_INFINITY,
  };
}

export function isDead(health: HealthState): boolean {
  return health.deadFor >= 0;
}

/** Daño final según el ajuste "Daño recibido": reducido = la mitad, redondeado hacia arriba, mínimo 1. */
export function scaledDamage(
  amount: number,
  setting: DamageTaken,
  balance: HealthBalance = HEALTH_BALANCE,
): number {
  if (!(amount > 0)) return 0;
  const base = Math.round(amount);
  if (setting === 'normal') return base;
  return Math.max(1, Math.ceil(base * balance.reducedDamageFactor));
}

/** Contexto del golpe: de dónde viene y si el jugador puede esquivarlo ahora. */
export interface HitSource {
  /** Punto desde el que llega el golpe (para empujar en dirección contraria). */
  readonly fromX: number;
  readonly fromZ: number;
}

/**
 * Aplica un golpe al jugador. No hace nada si está muerto, en invulnerabilidad tras otro golpe o
 * esquivando (`dodging` = dentro de la ventana de invulnerabilidad de la esquiva).
 * Devuelve el daño hecho (0 si no cuenta).
 */
export function hurtPlayer(
  health: HealthState,
  player: Position2,
  amount: number,
  source: HitSource,
  options: { readonly dodging: boolean; readonly setting: DamageTaken },
  balance: HealthBalance = HEALTH_BALANCE,
): number {
  if (isDead(health) || health.invulnerable > 0 || options.dodging) return 0;
  const dealt = Math.min(health.quarters, scaledDamage(amount, options.setting, balance));
  if (dealt <= 0) return 0;
  health.quarters -= dealt;
  health.invulnerable = balance.invulnerableAfterHit;
  health.sinceHit = 0;
  // Empuje en dirección contraria al golpe (si llega desde el mismo punto, hacia atrás en z).
  const dx = player.x - source.fromX;
  const dz = player.z - source.fromZ;
  const len = Math.sqrt(dx * dx + dz * dz);
  health.knockX = len > 1e-6 ? dx / len : 0;
  health.knockZ = len > 1e-6 ? dz / len : -1;
  health.knockTime = balance.knockbackTime;
  if (health.quarters <= 0) {
    health.quarters = 0;
    health.deadFor = 0;
  }
  return dealt;
}

/** Avanza los tiempos de la vida. */
export function updateHealth(health: HealthState, dt: number): void {
  health.invulnerable = Math.max(0, health.invulnerable - dt);
  health.sinceHit += dt;
  if (health.deadFor >= 0) health.deadFor += dt;
}

/** Mueve al jugador con el empuje del último golpe (se frena hasta parar). */
export function applyKnockback(
  health: HealthState,
  player: Position2,
  radius: number,
  dt: number,
  blocks: readonly BlockData[],
  balance: HealthBalance = HEALTH_BALANCE,
): void {
  if (health.knockTime <= 0) return;
  const t = health.knockTime / balance.knockbackTime;
  const speed = balance.knockbackSpeed * t;
  moveCircle(player, health.knockX * speed * dt, health.knockZ * speed * dt, radius, blocks);
  health.knockTime = Math.max(0, health.knockTime - dt);
}

/** Cura (sin pasar del máximo). Devuelve lo curado. */
export function heal(health: HealthState, quarters: number): number {
  if (isDead(health) || !(quarters > 0)) return 0;
  const before = health.quarters;
  health.quarters = Math.min(health.maxQuarters, health.quarters + Math.round(quarters));
  return health.quarters - before;
}

/** Deja la vida como al empezar (al reintentar). */
export function resetHealth(health: HealthState): void {
  health.quarters = health.maxQuarters;
  health.invulnerable = 0;
  health.knockTime = 0;
  health.deadFor = -1;
  health.sinceHit = Number.POSITIVE_INFINITY;
}

/** True cuando ya se puede mostrar la pantalla de "Reintentar". */
export function canRetry(health: HealthState, balance: HealthBalance = HEALTH_BALANCE): boolean {
  return health.deadFor >= balance.deathScreenDelay;
}
