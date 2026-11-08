import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { ARENA, type BlockData } from '../src/data/arena';
import { SPAWN_POINTS, WAVE_RULES, WAVES } from '../src/data/waves';
import { createProjectile, slashProjectiles, updateProjectiles } from '../src/game/projectiles';
import { pruneSparks, spawnSparks, updateSparks, type Spark } from '../src/game/sparks';
import { createWaves, planSpawns, retryWave, updateWaves, waveNumber } from '../src/game/waves';

const DT = 1 / 60;

describe('proyectiles', () => {
  const spawn = { x: 0, z: 0, dirX: 0, dirZ: 1, speed: 5, radius: 0.3, lifetime: 2, damage: 3 };

  it('avanzan y tocan al jugador', () => {
    const p = createProjectile(1, spawn);
    let contacts = 0;
    for (let i = 0; i < 60 && contacts === 0; i++)
      contacts = updateProjectiles([p], DT, [], { x: 0, z: 3 }, 0.4).length;
    expect(contacts).toBe(1);
    expect(p.z).toBeGreaterThan(2);
  });

  it('chocan con los muros', () => {
    const wall: BlockData = { x: 0, z: 1.5, halfX: 2, halfZ: 0.2, height: 1, kind: 'wall' };
    const p = createProjectile(1, spawn);
    for (let i = 0; i < 60; i++) updateProjectiles([p], DT, [wall], { x: 0, z: 5 }, 0.4);
    expect(p.state).toBe('blocked');
  });

  it('caducan', () => {
    const p = createProjectile(1, spawn);
    for (let i = 0; i < 200; i++) updateProjectiles([p], DT, [], { x: 50, z: 0 }, 0.4);
    expect(p.state).toBe('expired');
  });

  it('se pueden cortar con la Hoja si están en el arco del golpe', () => {
    const p = createProjectile(1, { ...spawn, z: 1.2 });
    expect(slashProjectiles([p], 0, 0, 0, 1.9, 1.1)).toBe(1);
    expect(p.state).toBe('cut');
    const behind = createProjectile(2, { ...spawn, z: -1.2 });
    expect(slashProjectiles([behind], 0, 0, 0, 1.9, 1.1)).toBe(0);
  });
});

describe('chispas', () => {
  it('saltan, esperan un momento y vuelan hacia el jugador cercano', () => {
    const list: Spark[] = [];
    spawnSparks(list, 0, 0, 4, createRng(1));
    expect(list).toHaveLength(4);
    let total = 0;
    for (let i = 0; i < 240; i++) total += updateSparks(list, DT, { x: 0.5, z: 0.5 });
    expect(total).toBe(4);
    pruneSparks(list);
    expect(list).toHaveLength(0);
  });

  it('no se recogen si el jugador está lejos, y caducan', () => {
    const list: Spark[] = [];
    spawnSparks(list, 0, 0, 2, createRng(2));
    let total = 0;
    for (let i = 0; i < 60 * 30; i++) total += updateSparks(list, DT, { x: 20, z: 20 });
    expect(total).toBe(0);
    expect(list.every((s) => s.expired)).toBe(true);
  });
});

describe('oleadas', () => {
  it('empiezan tras una pausa y crean los enemigos de la primera oleada', () => {
    const w = createWaves();
    const rng = createRng(4);
    expect(updateWaves(w, 1, 0, { x: 0, z: -9 }, rng)).toEqual([]);
    const spawns = updateWaves(w, WAVE_RULES.firstDelay, 0, { x: 0, z: -9 }, rng);
    const expected = WAVES[0]?.groups.reduce((n, g) => n + g.count, 0);
    expect(spawns).toHaveLength(expected ?? 0);
    expect(w.phase).toBe('fighting');
  });

  it('al vencer una oleada, pausa y pasa a la siguiente; tras la última vuelve a la primera más fuerte', () => {
    const w = createWaves();
    const rng = createRng(4);
    const player = { x: 0, z: -9 };
    for (let i = 0; i < WAVES.length; i++) {
      updateWaves(w, 99, 0, player, rng); // empieza la oleada
      updateWaves(w, DT, 0, player, rng); // todos vencidos
    }
    expect(w.loop).toBe(1);
    expect(w.index).toBe(0);
    expect(waveNumber(w)).toBe(WAVES.length + 1);
    const spawns = updateWaves(w, 99, 0, player, rng);
    expect(spawns[0]?.healthFactor).toBeCloseTo(WAVE_RULES.loopHealthFactor);
  });

  it('mientras queden enemigos no avanza', () => {
    const w = createWaves();
    const rng = createRng(4);
    updateWaves(w, 99, 0, { x: 0, z: 0 }, rng);
    updateWaves(w, 99, 2, { x: 0, z: 0 }, rng);
    expect(w.phase).toBe('fighting');
    expect(w.index).toBe(0);
  });

  it('los enemigos aparecen lejos del jugador y en puntos libres de muros', () => {
    for (const wave of WAVES) {
      const spawns = planSpawns(wave, { x: 0, z: -9 }, createRng(9));
      for (const s of spawns) {
        expect(Math.hypot(s.x, s.z + 9)).toBeGreaterThanOrEqual(WAVE_RULES.minSpawnDistance - 1.6);
      }
    }
    for (const p of SPAWN_POINTS) {
      for (const b of ARENA.blocks) {
        const inside = Math.abs(p.x - b.x) < b.halfX + 1 && Math.abs(p.z - b.z) < b.halfZ + 1;
        expect(inside).toBe(false);
      }
    }
  });

  it('reintentar repite la oleada actual tras una pausa', () => {
    const w = createWaves();
    const rng = createRng(4);
    updateWaves(w, 99, 0, { x: 0, z: 0 }, rng);
    updateWaves(w, DT, 0, { x: 0, z: 0 }, rng);
    updateWaves(w, 99, 0, { x: 0, z: 0 }, rng);
    expect(w.index).toBe(1);
    retryWave(w);
    expect(w.phase).toBe('waiting');
    expect(w.index).toBe(1);
  });
});
