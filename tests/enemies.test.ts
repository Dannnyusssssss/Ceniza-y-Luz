import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { ENEMIES, ENEMY_KINDS, ENEMY_RULES, type EnemyKind } from '../src/data/enemies';
import type { BlockData } from '../src/data/arena';
import {
  createEnemy,
  hitEnemy,
  isAlive,
  markStrikeLanded,
  separate,
  updateEnemy,
  windupProgress,
  type EnemyContext,
  type EnemyOutput,
  type EnemyState,
} from '../src/game/enemies';

const DT = 1 / 60;

function context(player = { x: 0, z: 0 }, blocks: readonly BlockData[] = [], seed = 1): EnemyContext {
  return { player, playerRadius: 0.4, playerAlive: true, blocks, rng: createRng(seed) };
}

/** Avanza hasta que se cumpla la condición (o se agote el tiempo). Devuelve los segundos simulados. */
function runUntil(
  e: EnemyState,
  ctx: EnemyContext,
  done: (out: EnemyOutput) => boolean,
  maxSeconds = 10,
): number {
  for (let t = 0; t < maxSeconds; t += DT) {
    const out = updateEnemy(e, DT, ctx);
    if (done(out)) return t;
  }
  return Number.POSITIVE_INFINITY;
}

function spawned(kind: EnemyKind, x: number, z: number): EnemyState {
  const e = createEnemy(1, kind, x, z, 0);
  e.phase = 'chase';
  return e;
}

describe('enemigos: comunes', () => {
  it('aparecen surgiendo de la bruma y no se les puede golpear mientras tanto', () => {
    const e = createEnemy(1, 'brumilla', 0, 5, 0);
    expect(e.phase).toBe('spawning');
    expect(hitEnemy(e, 10, 1, 0, 0)).toBe(0);
    runUntil(e, context(), () => e.phase !== 'spawning');
    expect(e.phase).toBe('chase');
  });

  it('un golpe cuenta una sola vez por swing y a cero se desvanece', () => {
    const e = spawned('brumilla', 0, 3);
    expect(hitEnemy(e, 8, 1, 0, 0)).toBe(8);
    expect(hitEnemy(e, 8, 1, 0, 0)).toBe(0);
    expect(hitEnemy(e, 50, 2, 0, 0)).toBe(12);
    expect(e.phase).toBe('dying');
    expect(isAlive(e)).toBe(false);
    runUntil(e, context(), () => e.removed);
    expect(e.removed).toBe(true);
  });

  it('los pequeños se aturden al recibir un golpe; el Coloso no', () => {
    const b = spawned('brumilla', 0, 3);
    hitEnemy(b, 1, 1, 0, 0);
    expect(b.phase).toBe('stagger');
    const c = spawned('coloso', 0, 3);
    hitEnemy(c, 1, 1, 0, 0);
    expect(c.phase).toBe('chase');
    // Y el Coloso no se mueve con los golpes.
    expect(c.knockVx).toBe(0);
    expect(c.knockVz).toBe(0);
  });

  it('la vida escala con el factor de la oleada', () => {
    expect(createEnemy(1, 'coloso', 0, 0, 0, 1.3).maxHealth).toBe(Math.round(ENEMIES.coloso.maxHealth * 1.3));
  });

  it('no atraviesan muros al perseguir', () => {
    const wall: BlockData = { x: 0, z: 2.5, halfX: 3, halfZ: 0.3, height: 2, kind: 'wall' };
    const e = spawned('brumilla', 0, 5);
    const ctx = context({ x: 0, z: 0 }, [wall]);
    for (let i = 0; i < 300; i++) updateEnemy(e, DT, ctx);
    expect(e.z).toBeGreaterThanOrEqual(wall.z + wall.halfZ + e.stats.radius - 1e-6);
  });

  it('separate: no se solapan entre ellos ni con el jugador', () => {
    const a = spawned('brumilla', 0, 0.1);
    const b = spawned('brumilla', 0.1, 0.1);
    const player = { x: 0, z: 0 };
    separate([a, b], player, 0.4, []);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.5);
    expect(player).toEqual({ x: 0, z: 0 });
    for (let i = 0; i < 4; i++) separate([a, b], player, 0.4, []);
    expect(Math.hypot(a.x, a.z)).toBeGreaterThanOrEqual(0.85 - 1e-6);
  });

  it('con el jugador caído no atacan', () => {
    const e = spawned('brumilla', 0, 1);
    const ctx = { ...context(), playerAlive: false };
    const t = runUntil(e, ctx, (o) => o.strike !== null, 3);
    expect(t).toBe(Number.POSITIVE_INFINITY);
  });

  it('todos los tipos tienen datos coherentes', () => {
    for (const kind of ENEMY_KINDS) {
      const s = ENEMIES[kind];
      expect(s.windup).toBeGreaterThanOrEqual(0.4); // se ve venir
      expect(s.recover).toBeGreaterThan(0);
      expect(s.maxHealth).toBeGreaterThan(0);
      expect(s.sparks[0]).toBeLessThanOrEqual(s.sparks[1]);
    }
  });
});

describe('Brumilla (embiste)', () => {
  it('se acerca, avisa el tiempo indicado y salta hacia el jugador', () => {
    const e = spawned('brumilla', 0, 6);
    const ctx = context();
    runUntil(e, ctx, () => e.phase === 'windup');
    expect(Math.hypot(e.x, e.z)).toBeLessThanOrEqual(ENEMIES.brumilla.attackRange + 0.05);
    const windupStart = e.time;
    expect(windupStart).toBeLessThan(0.05);
    const t = runUntil(e, ctx, () => e.phase === 'attack');
    expect(t).toBeCloseTo(ENEMIES.brumilla.windup, 1);
    let strike = false;
    runUntil(e, ctx, (o) => {
      if (o.strike) strike = true;
      return e.phase === 'recover';
    });
    expect(strike).toBe(true);
  });

  it('después de alcanzar al jugador no vuelve a dañar en el mismo ataque', () => {
    const e = spawned('brumilla', 0, 1);
    const ctx = context();
    runUntil(e, ctx, (o) => o.strike !== null);
    markStrikeLanded(e);
    const again = runUntil(e, ctx, (o) => o.strike !== null || e.phase === 'recover', 2);
    expect(e.phase).toBe('recover');
    expect(again).toBeLessThan(2);
  });

  it('un golpe durante el aviso lo interrumpe', () => {
    const e = spawned('brumilla', 0, 1);
    const ctx = context();
    runUntil(e, ctx, () => e.phase === 'windup');
    hitEnemy(e, 1, 7, 0, 0);
    expect(e.phase).toBe('stagger');
    expect(windupProgress(e)).toBe(0);
  });
});

describe('Acechador (rodea)', () => {
  it('rodea al jugador a su distancia antes de lanzarse', () => {
    const e = spawned('acechador', 0, 10);
    const ctx = context({ x: 0, z: 0 }, [], 3);
    runUntil(e, ctx, () => e.phase === 'circle');
    const angles: number[] = [];
    runUntil(e, ctx, () => {
      angles.push(Math.atan2(e.x, e.z));
      return e.phase === 'windup';
    });
    // Se movió alrededor (cambió el ángulo) y quedó cerca de su radio de rodeo.
    const first = angles[0] ?? 0;
    const last = angles[angles.length - 1] ?? 0;
    expect(Math.abs(last - first)).toBeGreaterThan(0.3);
    expect(Math.hypot(e.x, e.z)).toBeLessThan(ENEMIES.acechador.attackRange + 0.2);
  });

  it('la embestida va en línea recta hacia donde estaba el jugador', () => {
    const e = spawned('acechador', 0, 4);
    const ctx = context({ x: 0, z: 0 }, [], 5);
    runUntil(e, ctx, () => e.phase === 'attack');
    const dir = { x: e.dirX, z: e.dirZ };
    const startDist = Math.hypot(e.x, e.z);
    for (let i = 0; i < 8; i++) updateEnemy(e, DT, ctx);
    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1);
    expect(Math.hypot(e.x, e.z)).toBeLessThan(startDist);
  });
});

describe('Coloso de Bruma (golpe que se ve venir)', () => {
  it('marca el punto del golpe al empezar el aviso y no lo mueve aunque el jugador se aparte', () => {
    const e = spawned('coloso', 0, 3);
    const player = { x: 0, z: 0 };
    const ctx = context(player);
    runUntil(e, ctx, () => e.phase === 'windup');
    const target = { x: e.targetX, z: e.targetZ };
    player.x = 4;
    runUntil(e, ctx, () => e.phase === 'attack');
    expect(e.targetX).toBe(target.x);
    expect(e.targetZ).toBe(target.z);
  });

  it('el aviso dura más de un segundo y alcanza a quien sigue en el círculo', () => {
    const e = spawned('coloso', 0, 3);
    const ctx = context();
    runUntil(e, ctx, () => e.phase === 'windup');
    const t = runUntil(e, ctx, () => e.phase === 'attack');
    expect(t).toBeGreaterThanOrEqual(1);
    let strike = false;
    runUntil(e, ctx, (o) => {
      if (o.strike) strike = true;
      return e.phase === 'recover';
    });
    expect(strike).toBe(true);
  });

  it('quien sale del círculo durante el aviso no recibe el golpe', () => {
    const e = spawned('coloso', 0, 3);
    const player = { x: 0, z: 0 };
    const ctx = context(player);
    runUntil(e, ctx, () => e.phase === 'windup');
    player.x = 6;
    let strike = false;
    runUntil(e, ctx, (o) => {
      if (o.strike) strike = true;
      return e.phase === 'recover';
    });
    expect(strike).toBe(false);
  });

  it('tras golpear queda vulnerable el tiempo de recuperación', () => {
    const e = spawned('coloso', 0, 3);
    const ctx = context();
    runUntil(e, ctx, () => e.phase === 'recover');
    const t = runUntil(e, ctx, () => e.phase !== 'recover');
    expect(t).toBeCloseTo(ENEMIES.coloso.recover, 1);
  });
});

describe('Tirador de Ceniza (a distancia)', () => {
  it('se aleja si el jugador se acerca demasiado', () => {
    const e = spawned('tirador', 0, 3);
    const ctx = context();
    for (let i = 0; i < 30; i++) updateEnemy(e, DT, ctx);
    expect(Math.hypot(e.x, e.z)).toBeGreaterThan(3);
  });

  it('a buena distancia avisa y dispara un proyectil lento hacia el jugador', () => {
    const e = spawned('tirador', 0, 8);
    const ctx = context();
    let shot: EnemyOutput['projectile'] = null;
    runUntil(e, ctx, (o) => {
      shot = o.projectile;
      return shot !== null;
    });
    expect(shot).not.toBeNull();
    const p = shot as unknown as { dirZ: number; speed: number };
    expect(p.dirZ).toBeCloseTo(-1);
    expect(p.speed).toBeLessThan(8);
  });
});

describe('reglas', () => {
  it('el aturdimiento y el desvanecimiento tienen duraciones razonables', () => {
    expect(ENEMY_RULES.stagger).toBeGreaterThan(0);
    expect(ENEMY_RULES.dissolveTime).toBeGreaterThan(0.3);
  });
});
