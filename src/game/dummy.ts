import { DUMMY_BALANCE } from '../data/balance';

export type DummyBalance = typeof DUMMY_BALANCE;

/** Muñeco de práctica: recibe golpes, se desvanece al llegar a cero y vuelve tras un momento. */
export interface DummyState {
  x: number;
  z: number;
  health: number;
  readonly maxHealth: number;
  /** Último golpe recibido (para no contar dos veces el mismo). */
  lastSwingId: number;
  /** Tiempo desde el último golpe (para la animación de sacudida). */
  sinceHit: number;
  /** Tiempo restante hasta reaparecer (> 0 mientras está desvanecido). */
  respawn: number;
}

export function createDummy(x: number, z: number, balance: DummyBalance = DUMMY_BALANCE): DummyState {
  return {
    x,
    z,
    health: balance.maxHealth,
    maxHealth: balance.maxHealth,
    lastSwingId: -1,
    sinceHit: Number.POSITIVE_INFINITY,
    respawn: 0,
  };
}

export function isDefeated(dummy: DummyState): boolean {
  return dummy.respawn > 0;
}

/**
 * Aplica el daño de un golpe una sola vez por `swingId`. Devuelve el daño hecho (0 si no cuenta).
 * Si la vida llega a cero, el muñeco se desvanece y empieza la cuenta para reaparecer.
 */
export function hitDummy(
  dummy: DummyState,
  damage: number,
  swingId: number,
  balance: DummyBalance = DUMMY_BALANCE,
): number {
  if (isDefeated(dummy) || swingId === dummy.lastSwingId || !(damage > 0)) return 0;
  dummy.lastSwingId = swingId;
  const dealt = Math.min(dummy.health, damage);
  dummy.health -= dealt;
  dummy.sinceHit = 0;
  if (dummy.health <= 0) dummy.respawn = balance.resetDelay;
  return dealt;
}

export function updateDummy(dummy: DummyState, dt: number): void {
  dummy.sinceHit += dt;
  if (dummy.respawn > 0) {
    dummy.respawn = Math.max(0, dummy.respawn - dt);
    if (dummy.respawn === 0) dummy.health = dummy.maxHealth;
  }
}
