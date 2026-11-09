import { describe, expect, it } from 'vitest';
import { REGENT, type RegentAttack } from '../src/data/regent';
import { ZONES, type BossData } from '../src/data/zones';
import {
  createRegent,
  hitRegent,
  isRegentActive,
  isRegentHittable,
  lightBrazier,
  pendingBraziers,
  regentWindupProgress,
  resetRegent,
  updateRegent,
  type RegentEvent,
  type RegentOutput,
  type RegentState,
} from '../src/game/regent';

const DT = 1 / 60;
const ROOM = ZONES.fortaleza.boss as BossData;
const NEAR = { x: ROOM.x, z: ROOM.z - 2 };

function run(r: RegentState, seconds: number, p = NEAR, alive = true): RegentOutput[] {
  const out: RegentOutput[] = [];
  for (let t = 0; t < seconds; t += DT) out.push(updateRegent(r, DT, p.x, p.z, alive));
  return out;
}

function events(list: readonly RegentOutput[]): RegentEvent[] {
  return list.flatMap((o) => o.events);
}

function untilWindup(r: RegentState, p = NEAR): RegentAttack {
  for (let t = 0; t < 40; t += DT) {
    const e = updateRegent(r, DT, p.x, p.z, true).events.find((k) => k.type === 'regentWindup');
    if (e?.type === 'regentWindup') return e.attack;
  }
  throw new Error('No llegó ningún ataque');
}

/** Termina el ataque en curso con el jugador lejos del golpe. */
function finishAttack(r: RegentState): void {
  const away = { x: ROOM.minX + 0.5, z: ROOM.minZ + 0.5 };
  while (r.phase !== 'stalk') updateRegent(r, DT, away.x, away.z, true);
}

function awake(): RegentState {
  const r = createRegent(ROOM, false);
  run(r, REGENT.awaken + 0.1);
  expect(r.phase).toBe('stalk');
  return r;
}

function toStage(r: RegentState, stage: 2 | 3): void {
  r.phase = 'stalk';
  r.health = REGENT.maxHealth * REGENT.stageAt[stage] + 1;
  r.stage = stage === 2 ? 1 : 2;
  r.veiled = false;
  r.lastHit = -1;
  const e = hitRegent(r, 2, 1000 + stage);
  expect(e.some((k) => k.type === 'regentStage' && k.stage === stage)).toBe(true);
  run(r, REGENT.transition + 0.05);
  expect(r.phase).toBe('stalk');
}

function breakVeil(r: RegentState): RegentEvent[] {
  return REGENT.braziers.flatMap((_, i) => lightBrazier(r, i));
}

describe('el Regente del Eclipse: arranque', () => {
  it('duerme hasta que el jugador entra en la sala', () => {
    const r = createRegent(ROOM, false);
    expect(events(run(r, 1, { x: 0, z: ROOM.minZ - 5 }))).toEqual([]);
    expect(r.phase).toBe('dormant');
    expect(isRegentActive(r)).toBe(false);
    expect(events(run(r, DT))).toContainEqual({ type: 'regentAwake' });
    expect(isRegentActive(r)).toBe(true);
    expect(isRegentHittable(r)).toBe(false);
  });

  it('ya vencido no hace nada y no se puede golpear', () => {
    const r = createRegent(ROOM, true);
    expect(r.phase).toBe('defeated');
    expect(events(run(r, 2))).toEqual([]);
    expect(hitRegent(r, 50, 1)).toEqual([]);
  });

  it('un jugador caído no recibe ataques', () => {
    const r = awake();
    const out = run(r, 15, NEAR, false);
    expect(out.every((o) => o.strike === null)).toBe(true);
    expect(events(out).some((e) => e.type === 'regentWindup')).toBe(false);
  });
});

describe('patrones y tiempos', () => {
  it('cada fase repite su patrón en orden, así se aprende', () => {
    const r = awake();
    const stage1 = [...REGENT.patterns[1], ...REGENT.patterns[1]];
    for (const expected of stage1) {
      expect(untilWindup(r)).toBe(expected);
      finishAttack(r);
    }
    toStage(r, 2);
    expect(untilWindup(r)).toBe(REGENT.patterns[2][0]);
    finishAttack(r);
    toStage(r, 3);
    expect(untilWindup(r)).toBe(REGENT.patterns[3][0]);
  });

  it('cada ataque tarda exactamente su aviso en caer y el aviso progresa de 0 a 1', () => {
    const r = awake();
    const attack = untilWindup(r);
    expect(attack).toBe('sweep');
    expect(regentWindupProgress(r)).toBeLessThan(0.05);
    const { windup } = REGENT.attacks.sweep;
    run(r, windup / 2);
    expect(regentWindupProgress(r)).toBeCloseTo(0.5, 1);
    run(r, windup / 2 - 3 * DT);
    expect(r.phase).toBe('windup');
    expect(events(run(r, 5 * DT))).toContainEqual({ type: 'regentStrike', attack: 'sweep' });
  });

  it('todos los avisos dan tiempo de reaccionar (más de 0,9 s)', () => {
    for (const a of Object.values(REGENT.attacks)) expect(a.windup).toBeGreaterThan(0.9);
  });

  it('el tajo golpea una sola vez y solo dentro del sector anunciado', () => {
    const r = awake();
    untilWindup(r);
    const hits = run(r, REGENT.attacks.sweep.windup + REGENT.attacks.sweep.active).filter((o) => o.strike);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.strike?.damage).toBe(REGENT.attacks.sweep.damage);

    const other = awake();
    untilWindup(other);
    const behind = { x: other.x - Math.sin(other.yaw) * 2, z: other.z - Math.cos(other.yaw) * 2 };
    // El jugador rodea al jefe en el último momento, cuando ya no se orienta.
    run(other, REGENT.attacks.sweep.windup * 0.7);
    const out = run(other, REGENT.attacks.sweep.windup * 0.3 + REGENT.attacks.sweep.active, behind);
    expect(out.every((o) => o.strike === null)).toBe(true);
  });

  it('la estocada avanza recto, sin salirse de la sala, y golpea en su línea', () => {
    const r = awake();
    untilWindup(r);
    finishAttack(r);
    const attack = untilWindup(r);
    expect(attack).toBe('lunge');
    const start = { x: r.x, z: r.z };
    // A partir del 60 % del aviso ya no se orienta: esa línea es la que se anunció.
    run(r, REGENT.attacks.lunge.windup * 0.7);
    const yaw = r.yaw;
    const ahead = { x: start.x + Math.sin(yaw) * 3, z: start.z + Math.cos(yaw) * 3 };
    const out = run(r, REGENT.attacks.lunge.windup * 0.3 + REGENT.attacks.lunge.active, ahead);
    expect(out.filter((o) => o.strike)).toHaveLength(1);
    expect(r.yaw).toBeCloseTo(yaw);
    expect(r.x).toBeGreaterThanOrEqual(ROOM.minX);
    expect(r.x).toBeLessThanOrEqual(ROOM.maxX);
    expect(r.z).toBeGreaterThanOrEqual(ROOM.minZ);
    expect(r.z).toBeLessThanOrEqual(ROOM.maxZ);
  });

  it('la andanada lanza sus proyectiles una sola vez', () => {
    const r = awake();
    for (let i = 0; i < 3; i++) {
      untilWindup(r);
      finishAttack(r);
    }
    expect(untilWindup(r)).toBe('volley');
    const out = run(r, REGENT.attacks.volley.windup + REGENT.attacks.volley.active + 0.1);
    expect(out.flatMap((o) => o.projectiles)).toHaveLength(REGENT.attacks.volley.count);
  });
});

describe('segunda fase: el velo', () => {
  it('al bajar de dos tercios se cubre y deja de recibir daño', () => {
    const r = awake();
    r.health = REGENT.maxHealth * REGENT.stageAt[2] + 1;
    const e = hitRegent(r, 5, 1);
    expect(e).toContainEqual({ type: 'regentStage', stage: 2 });
    expect(r.phase).toBe('transition');
    expect(isRegentHittable(r)).toBe(false);
    run(r, REGENT.transition + 0.05);
    const before = r.health;
    expect(hitRegent(r, 50, 2)).toEqual([{ type: 'regentBlocked' }]);
    expect(r.health).toBe(before);
  });

  it('solo los tres braseros rompen el velo, en cualquier orden, y deja un aturdimiento', () => {
    const r = awake();
    toStage(r, 2);
    expect(pendingBraziers(r)).toHaveLength(3);
    expect(lightBrazier(r, 2)).toEqual([{ type: 'regentBrazierLit', index: 2, lit: 1 }]);
    expect(lightBrazier(r, 2)).toEqual([]);
    expect(lightBrazier(r, 0)).toEqual([{ type: 'regentBrazierLit', index: 0, lit: 2 }]);
    expect(r.veiled).toBe(true);
    const last = lightBrazier(r, 1);
    expect(last).toContainEqual({ type: 'regentVeilBroken' });
    expect(r.veiled).toBe(false);
    expect(r.phase).toBe('stagger');
    expect(pendingBraziers(r)).toEqual([]);
  });

  it('aturdido, el daño cuenta más', () => {
    const r = awake();
    toStage(r, 2);
    breakVeil(r);
    const before = r.health;
    expect(hitRegent(r, 10, 5)).toContainEqual({
      type: 'regentHit',
      damage: Math.round(10 * REGENT.staggerDamageFactor),
    });
    expect(r.health).toBe(before - Math.round(10 * REGENT.staggerDamageFactor));
  });

  it('el velo vuelve pasado su tiempo, con los braseros apagados', () => {
    const r = awake();
    toStage(r, 2);
    breakVeil(r);
    const out = run(r, REGENT.stagger + REGENT.veilBack + 0.2);
    expect(events(out)).toContainEqual({ type: 'regentVeilBack' });
    expect(r.veiled).toBe(true);
    expect(r.braziers.every((b) => !b)).toBe(true);
  });

  it('con el velo roto, la invocación pide 2 Brumillas', () => {
    const r = awake();
    toStage(r, 2);
    untilWindup(r);
    finishAttack(r);
    expect(untilWindup(r)).toBe('summon');
    const out = run(r, REGENT.attacks.summon.windup + REGENT.attacks.summon.active + 0.1);
    const points = out.flatMap((o) => o.summons);
    expect(points).toHaveLength(REGENT.minions);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(ROOM.minX);
      expect(p.z).toBeLessThanOrEqual(ROOM.maxZ);
    }
  });
});

describe('tercera fase: el eclipse', () => {
  it('la sala se oscurece despacio, sin saltos, y no hay velo', () => {
    const r = awake();
    toStage(r, 3);
    expect(r.veiled).toBe(false);
    let last = r.eclipse;
    const stepLimit = DT / REGENT.eclipseFade + 1e-9;
    const away = { x: ROOM.minX + 0.5, z: ROOM.minZ + 0.5 };
    for (let t = 0; t < REGENT.eclipseFade; t += DT) {
      updateRegent(r, DT, away.x, away.z, true);
      expect(r.eclipse - last).toBeLessThanOrEqual(stepLimit);
      last = r.eclipse;
    }
    expect(r.eclipse).toBeGreaterThan(0.95);
    run(r, 1, away);
    expect(r.eclipse).toBe(1);
  });

  it('los anillos crecen, golpean una vez al cruzar al jugador y acaban desapareciendo', () => {
    const r = awake();
    toStage(r, 3);
    expect(untilWindup(r)).toBe('rings');
    const near = { x: r.x + 6, z: r.z };
    const out = run(r, REGENT.attacks.rings.windup + 2.8, near);
    expect(r.ringsSpawned).toBe(REGENT.attacks.rings.count);
    expect(out.filter((o) => o.strike)).toHaveLength(REGENT.attacks.rings.count);
    run(r, 12, near);
    expect(r.rings.length).toBeLessThanOrEqual(REGENT.attacks.rings.count);
    for (const ring of r.rings) expect(ring.radius).toBeLessThanOrEqual(REGENT.attacks.rings.maxRadius);
  });
});

describe('final y reinicio', () => {
  it('al llegar a cero se deshace y queda vencido', () => {
    const r = awake();
    r.health = 5;
    const e = hitRegent(r, 50, 1);
    expect(e).toContainEqual({ type: 'regentDying' });
    expect(isRegentHittable(r)).toBe(false);
    const out = run(r, REGENT.dissolve + 0.1);
    expect(events(out)).toContainEqual({ type: 'regentDefeated' });
    expect(r.phase).toBe('defeated');
  });

  it('un mismo tajo no cuenta dos veces', () => {
    const r = awake();
    expect(hitRegent(r, 10, 7)).toHaveLength(1);
    expect(hitRegent(r, 10, 7)).toEqual([]);
    expect(r.health).toBe(REGENT.maxHealth - 10);
  });

  it('salir de la sala lo devuelve a su sitio con toda la vida', () => {
    const r = awake();
    toStage(r, 3);
    r.health = 40;
    const out = run(r, DT, { x: ROOM.x, z: ROOM.minZ - 3 });
    expect(events(out)).toContainEqual({ type: 'regentReset' });
    expect(r.health).toBe(REGENT.maxHealth);
    expect(r.phase).toBe('dormant');
    expect(r.stage).toBe(1);
    expect(r.eclipse).toBe(0);
  });

  it('reiniciar no revive a un Regente ya vencido', () => {
    const r = createRegent(ROOM, true);
    resetRegent(r);
    expect(r.phase).toBe('defeated');
    expect(r.health).toBe(0);
  });

  it('los braseros quedan dentro de la sala', () => {
    for (const b of REGENT.braziers) {
      expect(b.x).toBeGreaterThan(ROOM.minX);
      expect(b.x).toBeLessThan(ROOM.maxX);
      expect(b.z).toBeGreaterThan(ROOM.minZ);
      expect(b.z).toBeLessThan(ROOM.maxZ);
    }
  });
});
