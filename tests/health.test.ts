import { describe, expect, it } from 'vitest';
import { HEALTH_BALANCE } from '../src/data/balance';
import {
  applyKnockback,
  canRetry,
  createHealth,
  heal,
  hurtPlayer,
  isDead,
  resetHealth,
  scaledDamage,
  updateHealth,
} from '../src/game/health';

const normal = { dodging: false, setting: 'normal' as const };
const from = { fromX: 0, fromZ: 0 };

describe('vida del jugador', () => {
  it('empieza con 4 corazones (16 cuartos)', () => {
    const h = createHealth();
    expect(h.maxQuarters).toBe(HEALTH_BALANCE.startHearts * 4);
    expect(h.quarters).toBe(16);
  });

  it('un golpe resta su daño y da invulnerabilidad', () => {
    const h = createHealth();
    expect(hurtPlayer(h, { x: 0, z: 1 }, 3, from, normal)).toBe(3);
    expect(h.quarters).toBe(13);
    expect(h.invulnerable).toBe(HEALTH_BALANCE.invulnerableAfterHit);
    // Durante la invulnerabilidad otro golpe no cuenta.
    expect(hurtPlayer(h, { x: 0, z: 1 }, 3, from, normal)).toBe(0);
    updateHealth(h, HEALTH_BALANCE.invulnerableAfterHit + 0.01);
    expect(hurtPlayer(h, { x: 0, z: 1 }, 3, from, normal)).toBe(3);
  });

  it('la esquiva evita el daño', () => {
    const h = createHealth();
    expect(hurtPlayer(h, { x: 0, z: 1 }, 5, from, { dodging: true, setting: 'normal' })).toBe(0);
    expect(h.quarters).toBe(16);
  });

  it('daño reducido: la mitad, hacia arriba y nunca menos de 1', () => {
    expect(scaledDamage(6, 'reduced')).toBe(3);
    expect(scaledDamage(3, 'reduced')).toBe(2);
    expect(scaledDamage(1, 'reduced')).toBe(1);
    expect(scaledDamage(6, 'normal')).toBe(6);
    expect(scaledDamage(0, 'reduced')).toBe(0);
    expect(scaledDamage(-4, 'normal')).toBe(0);
    expect(scaledDamage(Number.NaN, 'normal')).toBe(0);
  });

  it('empuja en dirección contraria al golpe', () => {
    const h = createHealth();
    hurtPlayer(h, { x: 2, z: 0 }, 1, { fromX: 0, fromZ: 0 }, normal);
    expect(h.knockX).toBeCloseTo(1);
    const p = { x: 2, z: 0 };
    applyKnockback(h, p, 0.4, 1 / 60, []);
    expect(p.x).toBeGreaterThan(2);
  });

  it('a cero corazones cae, y "Reintentar" aparece tras la espera', () => {
    const h = createHealth(1);
    hurtPlayer(h, { x: 0, z: 1 }, 99, from, normal);
    expect(h.quarters).toBe(0);
    expect(isDead(h)).toBe(true);
    expect(canRetry(h)).toBe(false);
    updateHealth(h, HEALTH_BALANCE.deathScreenDelay);
    expect(canRetry(h)).toBe(true);
    // Muerto no recibe más daño ni se cura.
    expect(hurtPlayer(h, { x: 0, z: 1 }, 1, from, normal)).toBe(0);
    expect(heal(h, 4)).toBe(0);
    resetHealth(h);
    expect(isDead(h)).toBe(false);
    expect(h.quarters).toBe(4);
  });

  it('curar no pasa del máximo', () => {
    const h = createHealth();
    hurtPlayer(h, { x: 0, z: 1 }, 2, from, normal);
    expect(heal(h, 10)).toBe(2);
    expect(h.quarters).toBe(h.maxQuarters);
  });
});
