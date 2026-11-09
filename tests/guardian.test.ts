import { describe, expect, it } from 'vitest';
import { GUARDIAN, type GuardianAttack } from '../src/data/guardian';
import type { BossData } from '../src/data/zones';
import { ZONES } from '../src/data/zones';
import {
  createGuardian,
  dashAgainstGuardian,
  guardianWindupProgress,
  hitGuardian,
  isGuardianActive,
  isGuardianHittable,
  resetGuardian,
  spikePoints,
  updateGuardian,
  type GuardianEvent,
  type GuardianOutput,
  type GuardianState,
} from '../src/game/guardian';

const DT = 1 / 60;
const ROOM = ZONES.cueva.boss as BossData;
const { x: BX, z: BZ } = ROOM;
/** El jugador, justo delante del jefe y dentro de la sala. */
const NEAR = { x: BX, z: BZ - 2 };

function run(g: GuardianState, seconds: number, p = NEAR, alive = true): GuardianOutput[] {
  const out: GuardianOutput[] = [];
  for (let t = 0; t < seconds; t += DT) out.push(updateGuardian(g, DT, p.x, p.z, alive));
  return out;
}

function events(list: readonly GuardianOutput[]): GuardianEvent[] {
  return list.flatMap((o) => o.events);
}

/** Avanza hasta que empieza un ataque y devuelve cuál fue. */
function untilWindup(g: GuardianState, p = NEAR): GuardianAttack {
  for (let t = 0; t < 30; t += DT) {
    const e = updateGuardian(g, DT, p.x, p.z, true).events.find((k) => k.type === 'guardianWindup');
    if (e?.type === 'guardianWindup') return e.attack;
  }
  throw new Error('No llegó ningún ataque');
}

function awake(): GuardianState {
  const g = createGuardian(ROOM, false);
  run(g, GUARDIAN.awaken + 0.1);
  expect(g.phase).toBe('stalk');
  return g;
}

/** Lo lleva a la segunda fase. */
function secondStage(): GuardianState {
  const g = awake();
  hitGuardian(g, Math.ceil(GUARDIAN.maxHealth * (1 - GUARDIAN.secondStageAt)), 1);
  expect(g.stage).toBe(2);
  run(g, GUARDIAN.shielding + 0.1);
  return g;
}

describe('despertar', () => {
  it('duerme hasta que el jugador entra en la sala', () => {
    const g = createGuardian(ROOM, false);
    expect(events(run(g, 1, { x: 0, z: ROOM.minZ - 3 }))).toEqual([]);
    expect(g.phase).toBe('dormant');
    expect(isGuardianActive(g)).toBe(false);
    expect(events(run(g, 0.1))).toEqual([{ type: 'guardianAwake' }]);
    expect(g.phase).toBe('awakening');
  });

  it('no se le puede golpear dormido ni despertando', () => {
    const g = createGuardian(ROOM, false);
    expect(hitGuardian(g, 10, 1)).toEqual([]);
    run(g, 0.1);
    expect(hitGuardian(g, 10, 2)).toEqual([]);
    expect(g.health).toBe(GUARDIAN.maxHealth);
  });

  it('vencido antes, no vuelve', () => {
    const g = createGuardian(ROOM, true);
    expect(g.phase).toBe('defeated');
    expect(events(run(g, 2))).toEqual([]);
    resetGuardian(g);
    expect(g.phase).toBe('defeated');
  });

  it('si el jugador sale de la sala vuelve a su sitio con toda la vida', () => {
    const g = awake();
    hitGuardian(g, 50, 1);
    const out = run(g, 0.05, { x: 0, z: ROOM.minZ - 2 });
    expect(events(out)).toEqual([{ type: 'guardianReset' }]);
    expect(g).toMatchObject({ phase: 'dormant', health: GUARDIAN.maxHealth, stage: 1, x: BX, z: BZ });
  });
});

describe('patrones', () => {
  it('la primera fase repite su patrón, en orden', () => {
    const g = awake();
    const seen: GuardianAttack[] = [];
    for (let i = 0; i < 6; i++) seen.push(untilWindup(g));
    const p = GUARDIAN.patterns[1];
    expect(seen).toEqual([...p, ...p]);
  });

  it('la segunda fase empieza su patrón desde el principio', () => {
    const g = secondStage();
    const p = GUARDIAN.patterns[2];
    const seen: GuardianAttack[] = [];
    for (let i = 0; i < p.length; i++) {
      // La coraza no interrumpe los ataques: el patrón se puede aprender igual.
      seen.push(untilWindup(g));
    }
    expect(seen).toEqual([...p]);
  });

  it('el aviso dura lo fijado y no hace daño hasta terminar', () => {
    const g = awake();
    expect(untilWindup(g)).toBe('sweep');
    const { windup } = GUARDIAN.attacks.sweep;
    const early = run(g, windup - 0.05);
    expect(early.some((o) => o.strike)).toBe(false);
    expect(guardianWindupProgress(g)).toBeGreaterThan(0.9);
    const late = run(g, 0.2);
    expect(events(late)).toContainEqual({ type: 'guardianStrike', attack: 'sweep' });
    expect(guardianWindupProgress(g)).toBe(0);
  });

  it('el barrido alcanza una sola vez, solo por delante y a su alcance', () => {
    const g = awake();
    untilWindup(g);
    const hits = run(g, GUARDIAN.attacks.sweep.windup + GUARDIAN.attacks.sweep.active + 0.2).filter(
      (o) => o.strike,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.strike?.damage).toBe(GUARDIAN.attacks.sweep.damage);

    const far = awake();
    untilWindup(far, { x: BX, z: BZ - GUARDIAN.attacks.sweep.reach + 1 });
    const away = { x: BX, z: BZ + GUARDIAN.attacks.sweep.reach + 2 };
    const missed = run(far, GUARDIAN.attacks.sweep.windup + 0.3, away);
    expect(missed.some((o) => o.strike)).toBe(false);
  });

  it('las púas salen donde se anunciaron: moverse a tiempo las evita', () => {
    const g = awake();
    let attack = untilWindup(g);
    while (attack !== 'spikes') attack = untilWindup(g);
    const point = g.spikes[0];
    if (!point) throw new Error('sin púas');
    expect(g.spikes).toHaveLength(GUARDIAN.attacks.spikes.count);
    const safe = { x: BX + 13, z: ROOM.maxZ - 1 };
    const out = run(g, GUARDIAN.attacks.spikes.windup + GUARDIAN.attacks.spikes.active + 0.1, safe);
    expect(out.some((o) => o.strike)).toBe(false);
  });

  it('quedarse en un círculo de las púas hace daño', () => {
    const g = awake();
    let attack = untilWindup(g);
    while (attack !== 'spikes') attack = untilWindup(g);
    const out = run(g, GUARDIAN.attacks.spikes.windup + GUARDIAN.attacks.spikes.active + 0.1);
    const hits = out.filter((o) => o.strike);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.strike?.damage).toBe(GUARDIAN.attacks.spikes.damage);
  });

  it('los fragmentos salen una sola vez, en abanico hacia el jugador', () => {
    const g = secondStage();
    expect(untilWindup(g)).toBe('shards');
    const out = run(g, GUARDIAN.attacks.shards.windup + GUARDIAN.attacks.shards.active + 0.1);
    const shots = out.flatMap((o) => o.projectiles);
    expect(shots).toHaveLength(GUARDIAN.attacks.shards.count);
    expect(new Set(shots.map((s) => s.dirX.toFixed(3))).size).toBe(GUARDIAN.attacks.shards.count);
  });

  it('con el jugador caído no ataca', () => {
    const g = awake();
    const out = run(g, 8, NEAR, false);
    expect(out.some((o) => o.strike || o.projectiles.length > 0)).toBe(false);
    expect(events(out).some((e) => e.type === 'guardianWindup')).toBe(false);
  });
});

describe('daño y fases', () => {
  it('un mismo golpe no cuenta dos veces', () => {
    const g = awake();
    expect(hitGuardian(g, 10, 7)).toEqual([{ type: 'guardianHit', damage: 10 }]);
    expect(hitGuardian(g, 10, 7)).toEqual([]);
    expect(g.health).toBe(GUARDIAN.maxHealth - 10);
  });

  it('al llegar a la mitad de la vida pasa a la segunda fase, con coraza y sin atacar', () => {
    const g = awake();
    const e = hitGuardian(g, Math.ceil(GUARDIAN.maxHealth * GUARDIAN.secondStageAt), 1);
    expect(e.map((k) => k.type)).toEqual(['guardianHit', 'guardianStage']);
    expect(g).toMatchObject({ stage: 2, armored: true, phase: 'shielding', patternIndex: 0 });
    expect(isGuardianHittable(g)).toBe(false);
    expect(run(g, GUARDIAN.shielding - 0.1).some((o) => o.strike)).toBe(false);
  });

  it('con coraza la Hoja y el Pulso no hacen daño, pero avisan de qué hacer', () => {
    const g = secondStage();
    const before = g.health;
    expect(hitGuardian(g, 100, 11)).toEqual([{ type: 'guardianBlocked' }]);
    expect(g.health).toBe(before);
  });

  it('el Impulso rompe la coraza solo si pasa cerca, y lo aturde', () => {
    const g = secondStage();
    expect(dashAgainstGuardian(g, g.x + 10, g.z)).toEqual([]);
    expect(g.armored).toBe(true);
    expect(dashAgainstGuardian(g, g.x + 1, g.z)).toEqual([{ type: 'guardianArmorBroken' }]);
    expect(g).toMatchObject({ armored: false, phase: 'stagger' });
    expect(dashAgainstGuardian(g, g.x + 1, g.z)).toEqual([]);
  });

  it('sin coraza el Impulso no hace nada', () => {
    const g = awake();
    expect(dashAgainstGuardian(g, g.x, g.z)).toEqual([]);
    expect(g.phase).toBe('stalk');
  });

  it('aturdido recibe más daño', () => {
    const g = secondStage();
    dashAgainstGuardian(g, g.x, g.z);
    const e = hitGuardian(g, 10, 20);
    expect(e).toEqual([{ type: 'guardianHit', damage: Math.round(10 * GUARDIAN.staggerDamageFactor) }]);
  });

  it('la coraza vuelve con el tiempo, y no durante el aturdimiento', () => {
    const g = secondStage();
    dashAgainstGuardian(g, g.x, g.z);
    run(g, GUARDIAN.stagger - 0.1);
    expect(g.armored).toBe(false);
    const out = run(g, GUARDIAN.armorDownTime + 0.5);
    expect(events(out)).toContainEqual({ type: 'guardianArmorBack' });
    expect(g.armored).toBe(true);
  });

  it('sin vida se deshace y al terminar queda vencido, con un solo aviso de cada', () => {
    const g = awake();
    hitGuardian(g, GUARDIAN.maxHealth * GUARDIAN.secondStageAt, 1);
    run(g, GUARDIAN.shielding + 0.1);
    dashAgainstGuardian(g, g.x, g.z);
    const e = hitGuardian(g, 10000, 2);
    expect(e.map((k) => k.type)).toEqual(['guardianHit', 'guardianDying']);
    expect(g.phase).toBe('dying');
    expect(hitGuardian(g, 10, 3)).toEqual([]);
    const out = run(g, GUARDIAN.dissolve + 0.2);
    expect(events(out)).toEqual([{ type: 'guardianDefeated' }]);
    expect(g.phase).toBe('defeated');
    expect(events(run(g, 1))).toEqual([]);
  });
});

describe('datos del Guardián', () => {
  it('los puntos de las púas no se salen de la sala', () => {
    const points = spikePoints(ROOM, ROOM.maxX - 0.2, ROOM.maxZ - 0.2, 6, 5);
    expect(points).toHaveLength(6);
    for (const p of points.slice(1)) {
      expect(p.x).toBeLessThanOrEqual(ROOM.maxX);
      expect(p.z).toBeLessThanOrEqual(ROOM.maxZ);
    }
  });

  it('todos los avisos duran lo bastante para reaccionar, y dan tiempo a contraatacar', () => {
    for (const attack of Object.values(GUARDIAN.attacks)) {
      expect(attack.windup).toBeGreaterThanOrEqual(0.9);
      expect(attack.recover).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('el jefe empieza dentro de su sala', () => {
    expect(BX).toBeGreaterThan(ROOM.minX);
    expect(BX).toBeLessThan(ROOM.maxX);
    expect(BZ).toBeGreaterThan(ROOM.minZ);
    expect(BZ).toBeLessThan(ROOM.maxZ);
  });
});
