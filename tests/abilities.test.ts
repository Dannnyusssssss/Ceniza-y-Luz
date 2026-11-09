import { describe, expect, it } from 'vitest';
import type { BlockData } from '../src/data/arena';
import { ABILITY_BALANCE } from '../src/data/items';
import { PUZZLES } from '../src/data/puzzles';
import { ZONES } from '../src/data/zones';
import {
  aimYaw,
  createAbilities,
  dashCrosses,
  dashProgress,
  firePulse,
  movePulses,
  planDash,
  prunePulses,
  pulseTouches,
  resetAbilities,
  startDash,
  updateCooldowns,
  updateDash,
  withoutCracks,
} from '../src/game/abilities';
import {
  createAdventure,
  defeatBoss,
  interact,
  isGateOpen,
  lightPiece,
  listInteractables,
  pulseTargets,
  shatterGates,
} from '../src/game/adventure';
import { createProgress } from '../src/game/progress';

const R = 0.42;
const wall = (x: number, z: number, halfX: number, halfZ: number): BlockData => ({
  x,
  z,
  halfX,
  halfZ,
  height: 2,
  kind: 'wall',
});
const crack = (x: number, z: number, halfX: number, halfZ: number): BlockData => ({
  x,
  z,
  halfX,
  halfZ,
  height: 0,
  kind: 'crack',
});

describe('Pulso de Luz', () => {
  it('no se puede lanzar mientras dura la espera', () => {
    const s = createAbilities();
    expect(firePulse(s, 0, 0, 0)).not.toBeNull();
    expect(firePulse(s, 0, 0, 0)).toBeNull();
    updateCooldowns(s, ABILITY_BALANCE.pulso.cooldown - 0.01);
    expect(firePulse(s, 0, 0, 0)).toBeNull();
    updateCooldowns(s, 0.02);
    expect(firePulse(s, 0, 0, 0)).not.toBeNull();
    expect(s.pulses).toHaveLength(2);
  });

  it('avanza en línea recta y se apaga al agotar su alcance', () => {
    const s = createAbilities();
    firePulse(s, 0, 0, 0);
    const steps = Math.ceil(ABILITY_BALANCE.pulso.range / ABILITY_BALANCE.pulso.speed / (1 / 60));
    for (let i = 0; i < steps - 2; i++) movePulses(s, 1 / 60, []);
    expect(s.pulses[0]?.alive).toBe(true);
    expect(s.pulses[0]?.x).toBeCloseTo(0);
    for (let i = 0; i < 4; i++) movePulses(s, 1 / 60, []);
    expect(s.pulses[0]?.alive).toBe(false);
    expect(prunePulses(s)).toHaveLength(1);
    expect(s.pulses).toHaveLength(0);
  });

  it('se detiene en un muro, pero vuela sobre las grietas', () => {
    const s = createAbilities();
    firePulse(s, 0, 0, 0);
    const list = [crack(0, 3, 5, 1), wall(0, 8, 5, 0.5)];
    let stoppedAt = Number.NaN;
    for (let i = 0; i < 120 && Number.isNaN(stoppedAt); i++) {
      movePulses(s, 1 / 60, withoutCracks(list));
      const p = s.pulses[0];
      if (p && !p.alive) stoppedAt = p.z;
    }
    expect(stoppedAt).toBeGreaterThan(7);
    expect(stoppedAt).toBeLessThan(8);
  });

  it('un disparo rápido no atraviesa un objetivo pequeño entre dos pasos', () => {
    const s = createAbilities();
    const p = firePulse(s, 0, 0, 0);
    if (!p) throw new Error('sin disparo');
    movePulses(s, 0.5, []);
    expect(pulseTouches(p, 0, 5.5, 0.1)).toBe(true);
    expect(pulseTouches(p, 3, 5.5, 0.1)).toBe(false);
  });

  it('el ajuste de puntería busca el objetivo más alineado y dentro de alcance', () => {
    const near = { x: 1, z: 10 };
    const center = { x: 0, z: 12 };
    const yaw = aimYaw(0, 0, 0, [near, center]);
    expect(yaw).toBeCloseTo(0);
    expect(aimYaw(0, 0, 0, [near])).toBeCloseTo(Math.atan2(1, 10));
  });

  it('sin objetivo a tiro, sale exactamente donde se apunta', () => {
    expect(aimYaw(0, 0, 1, [{ x: 0, z: 10 }])).toBe(1);
    expect(aimYaw(0, 0, 0, [{ x: 0, z: 1000 }])).toBe(0);
    expect(aimYaw(0, 0, 0, [])).toBe(0);
    expect(aimYaw(0, 0, 0, [{ x: 0, z: 0 }])).toBe(0);
  });
});

describe('Impulso', () => {
  it('recorre su distancia en suelo libre', () => {
    const to = planDash(0, 0, 0, 1, R, []);
    expect(to.z).toBeGreaterThan(ABILITY_BALANCE.impulso.distance - 0.3);
    expect(to.x).toBeCloseTo(0);
  });

  it('cruza una grieta y aterriza al otro lado', () => {
    const list = [crack(0, 3, 10, 1.7)];
    const to = planDash(0, 0.8, 0, 1, R, list);
    expect(to.z).toBeGreaterThanOrEqual(4.7 + R - 1e-6);
  });

  it('nunca termina sobre la grieta: si no llega, se queda en el borde', () => {
    const list = [crack(0, 8, 10, 3)];
    const to = planDash(0, 0, 0, 1, R, list);
    expect(to.z).toBeLessThanOrEqual(5 - R + 1e-6);
  });

  it('se detiene ante un muro', () => {
    const to = planDash(0, 0, 0, 1, R, [wall(0, 3, 5, 0.5)]);
    expect(to.z).toBeLessThanOrEqual(2.5 - R + 1e-6);
  });

  it('un muro al otro lado de la grieta impide cruzar: se queda en el borde de salida', () => {
    const list = [crack(0, 3, 10, 1.5), wall(0, 5, 10, 0.5)];
    const to = planDash(0, 0.5, 0, 1, R, list);
    expect(to.z).toBeLessThanOrEqual(1.5 - R + 1e-6);
  });

  it('pegado a un muro no gasta la espera', () => {
    const s = createAbilities();
    expect(startDash(s, 0, 2 - R - 0.01, 0, 1, R, [wall(0, 2.5, 5, 0.5)])).toBe(false);
    expect(s.dashCooldown).toBe(0);
  });

  it('avanza hasta el destino en el tiempo fijado y luego termina', () => {
    const s = createAbilities();
    expect(startDash(s, 0, 0, 0, 1, R, [])).toBe(true);
    expect(startDash(s, 0, 0, 0, 1, R, [])).toBe(false);
    const pos = { x: 0, z: 0 };
    updateDash(s, pos, ABILITY_BALANCE.impulso.duration / 2);
    expect(pos.z).toBeGreaterThan(2);
    expect(dashProgress(s)).toBeCloseTo(0.5);
    updateDash(s, pos, ABILITY_BALANCE.impulso.duration);
    expect(s.dash).toBeNull();
    expect(dashProgress(s)).toBeNull();
    expect(updateDash(s, pos, 0.1)).toBe(false);
    expect(s.dashCooldown).toBe(ABILITY_BALANCE.impulso.cooldown);
  });

  it('dashCrosses detecta lo que cruza el recorrido', () => {
    const block = wall(0, 4, 2, 0.4);
    expect(dashCrosses(0, 0, 0, 1, R, block)).toBe(true);
    expect(dashCrosses(0, 0, 0, -1, R, block)).toBe(false);
    expect(dashCrosses(10, 0, 0, 1, R, block)).toBe(false);
  });

  it('resetAbilities lo deja todo en reposo', () => {
    const s = createAbilities();
    firePulse(s, 0, 0, 0);
    startDash(s, 0, 0, 0, 1, R, []);
    resetAbilities(s);
    expect(s).toMatchObject({ pulseCooldown: 0, dashCooldown: 0, dash: null, pulses: [] });
  });
});

describe('habilidades en el mundo', () => {
  it('el altar enseña la habilidad una sola vez', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'cienaga');
    const item = listInteractables(a).find((i) => i.kind === 'shrine');
    if (!item) throw new Error('falta el altar');
    expect(interact(a, item, item.x, item.z)).toEqual([{ type: 'abilityLearned', ability: 'pulso' }]);
    expect(progress.abilities).toEqual(['pulso']);
    expect(listInteractables(a).some((i) => i.kind === 'shrine')).toBe(false);
    expect(interact(a, item, item.x, item.z)).toEqual([]);
    expect(progress.abilities).toEqual(['pulso']);
  });

  it('las antorchas no se usan con E: responden al Pulso en el orden del mural', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'cienaga');
    expect(listInteractables(a).some((i) => i.kind === 'switch')).toBe(false);
    const data = PUZZLES.find((p) => p.id === 'cienaga-antorchas');
    if (data?.kind !== 'sequence') throw new Error('faltan las antorchas');
    const targets = pulseTargets(a);
    expect(targets).toHaveLength(data.switches.length);
    const by = (id: string): (typeof targets)[number] => {
      const t = targets.find((k) => k.id === id);
      if (!t) throw new Error(`Falta ${id}`);
      return t;
    };
    const [first, second, third] = data.order as [string, string, string];
    expect(lightPiece(a, by(second))[0]).toEqual({ type: 'switchPressed', result: 'wrong' });
    expect(lightPiece(a, by(first))[0]).toEqual({ type: 'switchPressed', result: 'advance' });
    expect(lightPiece(a, by(second))[0]).toEqual({ type: 'switchPressed', result: 'advance' });
    const end = lightPiece(a, by(third)).map((e) => e.type);
    expect(end).toEqual(['switchPressed', 'puzzleSolved', 'gateOpened']);
    expect(progress.gates).toContain('cienaga-puerta');
    expect(pulseTargets(a)).toHaveLength(0);
  });

  it('el Sello de Luz abre la barrera de Bruma y se gasta', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'bosque');
    const gate = ZONES.bosque.gates.find((g) => g.style === 'mist');
    if (!gate) throw new Error('falta la barrera');
    const item = { kind: 'gate', id: gate.id, x: gate.x, z: gate.z } as const;
    expect(interact(a, item, 0, 37)[0]?.type).toBe('gateLocked');
    progress.keys.push('sello-bruma');
    expect(interact(a, item, 0, 37)[0]?.type).toBe('gateOpened');
    expect(isGateOpen(a, gate)).toBe(true);
    expect(progress.keys).toEqual([]);
  });

  it('una barrera de cristal solo cede a la carrera que la cruza', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'cueva');
    const gate = ZONES.cueva.gates.find((g) => g.id === 'cueva-cristal');
    if (!gate) throw new Error('falta la barrera');
    const item = { kind: 'gate', id: gate.id, x: gate.x, z: gate.z } as const;
    expect(interact(a, item, 0, 12)[0]).toMatchObject({ type: 'gateLocked', opens: { kind: 'shatter' } });
    expect(shatterGates(a, 0, 5, 0, -1, R)).toEqual([]);
    expect(shatterGates(a, 0, 12, 0, 1, R).map((e) => e.type)).toEqual(['gateShattered']);
    expect(isGateOpen(a, gate)).toBe(true);
    expect(shatterGates(a, 0, 12, 0, 1, R)).toEqual([]);
  });

  it('vencer al Guardián abre su puerta, una sola vez', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'cueva');
    expect(progress.gates).not.toContain('cueva-fortaleza');
    expect(defeatBoss(a, 'guardian')).toEqual([
      { type: 'gateOpened', id: 'cueva-fortaleza', byKey: false },
      { type: 'gateOpened', id: 'fortaleza-puerta', byKey: false },
    ]);
    expect(progress.bosses).toEqual(['guardian']);
    expect(defeatBoss(a, 'guardian')).toEqual([]);
  });

  it('una partida antigua con el Guardián vencido encuentra abierto el camino a la Fortaleza', () => {
    const progress = createProgress('alba');
    progress.bosses.push('guardian');
    const a = createAdventure(progress, 'cueva');
    expect(progress.gates).toContain('cueva-fortaleza');
    expect(progress.gates).toContain('fortaleza-puerta');
    expect(a.zone.exits.some((e) => e.to === 'fortaleza')).toBe(true);
  });

  it('el gemelo solo se puede liberar con el Regente vencido, y una sola vez', () => {
    const progress = createProgress('ciro');
    progress.respawn = { zone: 'fortaleza', entry: 'galeria' };
    progress.place = { zone: 'fortaleza', entry: 'fromCueva' };
    const a = createAdventure(progress, 'fortaleza');
    const rescueOf = () => listInteractables(a).find((i) => i.kind === 'rescue');
    expect(rescueOf()).toBeUndefined();
    progress.bosses.push('regente');
    const item = rescueOf();
    if (!item) throw new Error('falta el rescate');
    expect(interact(a, item, item.x, item.z)).toEqual([{ type: 'rescue' }]);
    expect(progress.flags).toContain('gameCompleted');
    // Al continuar se vuelve al último faro, no a donde acabó la escena.
    expect(progress.place).toEqual({ zone: 'fortaleza', entry: 'galeria' });
    expect(rescueOf()).toBeUndefined();
    expect(interact(a, item, item.x, item.z)).toEqual([]);
  });
});
