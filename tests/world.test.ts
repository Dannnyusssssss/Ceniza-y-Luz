import { describe, expect, it } from 'vitest';
import type { BlockData } from '../src/data/arena';
import { PLAYER_BALANCE } from '../src/data/balance';
import { ABILITY_BALANCE } from '../src/data/items';
import { PUZZLES } from '../src/data/puzzles';
import { STORY_ZONES, ZONES, type ZoneData, type ZoneId } from '../src/data/zones';
import { planDash } from '../src/game/abilities';
import { createAdventure, refreshBlocks } from '../src/game/adventure';
import { createProgress } from '../src/game/progress';
import { cellCenter } from '../src/game/puzzles';
import { resolveCircle } from '../src/world/collision';
import { groundHeight } from '../src/world/terrain';
import { boundsOf, buildLayout, exitAt, gateBlock } from '../src/world/zones';

const CELL = 0.5;

/** Relleno por inundación con el círculo del jugador: qué puntos se pueden alcanzar a pie. */
function reachable(
  zone: ZoneData,
  blocks: readonly BlockData[],
  startX: number,
  startZ: number,
): Set<string> {
  const key = (ix: number, iz: number): string => `${ix},${iz}`;
  const free = (ix: number, iz: number): boolean => {
    const p = { x: ix * CELL, z: iz * CELL };
    return !resolveCircle(p, PLAYER_BALANCE.radius, blocks);
  };
  const start: [number, number] = [Math.round(startX / CELL), Math.round(startZ / CELL)];
  const seen = new Set([key(start[0], start[1])]);
  const queue = [start];
  while (queue.length > 0) {
    const [ix, iz] = queue.pop() as [number, number];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (Math.abs(nx * CELL) > zone.halfX + 1 || Math.abs(nz * CELL) > zone.halfZ + 1) continue;
      if (seen.has(key(nx, nz)) || !free(nx, nz)) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  return seen;
}

/** True si se puede llegar a menos de `reach` de un punto. */
function canReach(seen: Set<string>, x: number, z: number, reach: number): boolean {
  const r = Math.ceil(reach / CELL);
  const cx = Math.round(x / CELL);
  const cz = Math.round(z / CELL);
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      if (Math.hypot(ix * CELL - x, iz * CELL - z) <= reach && seen.has(`${ix},${iz}`)) return true;
    }
  }
  return false;
}

describe('datos de las zonas', () => {
  it('los identificadores de cofres, puertas y faros no se repiten', () => {
    for (const pick of [
      (z: ZoneData) => z.chests.map((c) => c.id),
      (z: ZoneData) => z.gates.map((g) => g.id),
      (z: ZoneData) => z.beacons.map((b) => b.id),
    ]) {
      const ids = STORY_ZONES.flatMap((z) => pick(ZONES[z]));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('las salidas llevan a zonas construidas y a puntos de llegada que existen', () => {
    for (const id of STORY_ZONES) {
      for (const exit of ZONES[id].exits) {
        expect(STORY_ZONES).toContain(exit.to);
        expect(ZONES[exit.to].entries[exit.entry]).toBeDefined();
      }
    }
  });

  it('cada faro tiene su punto de llegada y las llegadas no caen dentro de una salida', () => {
    for (const id of STORY_ZONES) {
      const zone = ZONES[id];
      for (const b of zone.beacons) expect(zone.entries[b.entry]).toBeDefined();
      for (const entry of Object.values(zone.entries)) {
        expect(exitAt(zone.exits, entry.x, entry.z)).toBeNull();
      }
    }
  });

  it('las puertas que piden un puzzle apuntan a uno de su misma zona', () => {
    for (const id of STORY_ZONES) {
      for (const gate of ZONES[id].gates) {
        if (gate.opens.kind !== 'puzzle') continue;
        const { puzzle } = gate.opens;
        expect(PUZZLES.find((p) => p.id === puzzle)?.zone).toBe(id);
      }
    }
  });
});

describe('colocación de la decoración', () => {
  it('siempre sale igual para una misma zona', () => {
    expect(buildLayout(ZONES.bosque)).toEqual(buildLayout(ZONES.bosque));
  });

  it('coloca los árboles pedidos y no los pone encima de un camino', () => {
    const layout = buildLayout(ZONES.bosque);
    expect(layout.innerTrees.length).toBeGreaterThan(40);
    for (const t of layout.innerTrees) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(ZONES.bosque.halfX);
      expect(Math.abs(t.z)).toBeLessThanOrEqual(ZONES.bosque.halfZ);
    }
  });
});

describe('alturas del suelo', () => {
  it('es plano fuera de las elevaciones y sube suavemente en ellas', () => {
    const zone = ZONES.lumbre;
    expect(groundHeight(zone, 0, 0)).toBe(0);
    const bump = zone.bumps[0];
    if (!bump) throw new Error('falta una elevación');
    expect(groundHeight(zone, bump.x, bump.z)).toBeCloseTo(bump.height);
    expect(groundHeight(zone, bump.x + bump.radius + 0.1, bump.z)).toBe(0);
  });

  it('dentro de la zona no hay escalones: entre dos pasos el suelo cambia poco', () => {
    for (const id of STORY_ZONES) {
      const zone = ZONES[id];
      for (let x = -zone.halfX; x < zone.halfX; x += 1) {
        for (let z = -zone.halfZ; z < zone.halfZ; z += 1) {
          expect(Math.abs(groundHeight(zone, x + 0.5, z) - groundHeight(zone, x, z))).toBeLessThan(0.3);
        }
      }
    }
  });

  it('nunca es negativo y fuera de los límites crecen colinas', () => {
    const zone = ZONES.bosque;
    expect(groundHeight(zone, zone.halfX + 30, 0)).toBeGreaterThan(0);
    for (let x = -80; x < 80; x += 7) expect(groundHeight(zone, x, 70)).toBeGreaterThanOrEqual(0);
  });
});

describe('límites y salidas', () => {
  it('los límites encierran la zona', () => {
    const zone = ZONES.lumbre;
    const p = { x: 0, z: 0 };
    for (const dir of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      p.x = dir[0] * (zone.halfX + 0.2);
      p.z = dir[1] * (zone.halfZ + 0.2);
      resolveCircle(p, 0.4, boundsOf(zone));
      expect(Math.abs(p.x)).toBeLessThanOrEqual(zone.halfX);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(zone.halfZ);
    }
  });

  it('una puerta cerrada ocupa su hueco en el eje que toca', () => {
    const gate = ZONES.lumbre.gates[0];
    if (!gate) throw new Error('falta la puerta');
    const block = gateBlock(gate);
    expect(block.halfX).toBeCloseTo(gate.width / 2);
    expect(block.halfZ).toBeLessThan(1);
  });

  it('exitAt solo responde dentro del rectángulo', () => {
    const exit = ZONES.lumbre.exits[0];
    if (!exit) throw new Error('falta la salida');
    expect(exitAt(ZONES.lumbre.exits, exit.x, exit.z)).toBe(exit);
    expect(exitAt(ZONES.lumbre.exits, exit.x + exit.halfX + 1, exit.z)).toBeNull();
  });
});

describe('se puede recorrer el mundo', () => {
  const start = (id: ZoneId, entry: string): { x: number; z: number } => {
    const place = ZONES[id].entries[entry];
    if (!place) throw new Error(`Falta ${entry}`);
    return place;
  };

  it('en Lumbre se llega a todo, y con la Hoja también a la salida', () => {
    const progress = createProgress('alba');
    const adventure = createAdventure(progress, 'lumbre');
    const from = start('lumbre', 'start');
    let seen = reachable(ZONES.lumbre, adventure.blocks, from.x, from.z);
    const zone = ZONES.lumbre;
    const exit = zone.exits[0];
    if (!exit) throw new Error('falta la salida');
    // Con el portal cerrado no se sale.
    expect(canReach(seen, exit.x, exit.z, 0.4)).toBe(false);
    for (const p of [...zone.chests, ...zone.beacons, ...zone.npcs, ...zone.signs]) {
      expect(canReach(seen, p.x, p.z, 1.6), `${p.x},${p.z}`).toBe(true);
    }
    if (zone.altar) expect(canReach(seen, zone.altar.x, zone.altar.z, 2)).toBe(true);
    progress.gates.push('lumbre-portal');
    refreshBlocks(adventure);
    seen = reachable(ZONES.lumbre, adventure.blocks, from.x, from.z);
    expect(canReach(seen, exit.x, exit.z, 0.4)).toBe(true);
  });

  it('en el Bosque cada puerta da paso a lo que guarda, y sin ella no se llega', () => {
    const progress = createProgress('ciro');
    const adventure = createAdventure(progress, 'bosque');
    const zone = ZONES.bosque;
    const from = start('bosque', 'fromLumbre');
    const seenAt = (): Set<string> => {
      refreshBlocks(adventure);
      return reachable(zone, adventure.blocks, from.x, from.z);
    };
    const chest = (id: string): { x: number; z: number } => {
      const c = zone.chests.find((k) => k.id === id);
      if (!c) throw new Error(`Falta el cofre ${id}`);
      return c;
    };
    const near = (seen: Set<string>, p: { x: number; z: number }): boolean => canReach(seen, p.x, p.z, 1.8);

    // Sin abrir nada: la mitad sur, los símbolos y los bloques, pero ni la alcoba ni el norte.
    let seen = seenAt();
    expect(near(seen, chest('bosque-raiz'))).toBe(true);
    expect(near(seen, chest('bosque-loma'))).toBe(true);
    expect(near(seen, chest('bosque-alcoba'))).toBe(false);
    expect(near(seen, chest('bosque-llave'))).toBe(false);
    for (const puzzle of PUZZLES) {
      if (puzzle.zone !== 'bosque') continue;
      if (puzzle.kind === 'sequence') {
        for (const s of puzzle.switches) expect(canReach(seen, s.x, s.z, 1.5), s.id).toBe(true);
      } else {
        for (const b of puzzle.blocks) {
          const c = cellCenter(puzzle, b);
          expect(canReach(seen, c.x, c.z, 2)).toBe(true);
        }
        expect(canReach(seen, puzzle.reset.x, puzzle.reset.z, 1.5)).toBe(true);
      }
    }
    const exit = zone.exits[0];
    if (!exit) throw new Error('falta la salida');
    expect(canReach(seen, exit.x, exit.z, 0.4)).toBe(true);

    // La alcoba se abre con los símbolos.
    progress.gates.push('bosque-alcoba');
    seen = seenAt();
    expect(near(seen, chest('bosque-alcoba'))).toBe(true);
    expect(near(seen, chest('bosque-llave'))).toBe(false);

    // El norte, con la puerta de los bloques.
    progress.gates.push('bosque-puerta');
    seen = seenAt();
    expect(near(seen, chest('bosque-llave'))).toBe(true);
    expect(near(seen, chest('bosque-musgo'))).toBe(true);
    expect(near(seen, chest('bosque-claro'))).toBe(false);
    for (const b of zone.beacons) expect(canReach(seen, b.x, b.z, 1.6), b.id).toBe(true);
    for (const s of zone.signs) expect(canReach(seen, s.x, s.z, 1.6), s.id).toBe(true);

    // El claro, con la llave.
    progress.gates.push('bosque-claro');
    seen = seenAt();
    expect(near(seen, chest('bosque-claro'))).toBe(true);
  });

  it('en la Ciénaga cada puerta da paso a lo que guarda', () => {
    const zone = ZONES.cienaga;
    const progress = createProgress('alba');
    const adventure = createAdventure(progress, 'cienaga');
    const from = start('cienaga', 'fromBosque');
    const seenAt = (): Set<string> => {
      refreshBlocks(adventure);
      return reachable(zone, adventure.blocks, from.x, from.z);
    };
    let seen = seenAt();
    const shrine = zone.shrines[0];
    if (!shrine) throw new Error('falta el altar');
    const north = zone.exits.find((e) => e.to === 'cueva');
    if (!north) throw new Error('falta la salida');
    // De entrada: los bloques y el mural, pero ni el altar ni el norte.
    const blocks = PUZZLES.find((p) => p.id === 'cienaga-bloques');
    if (blocks?.kind !== 'blocks') throw new Error('faltan los bloques');
    for (const b of blocks.blocks) {
      const c = cellCenter(blocks, b);
      expect(canReach(seen, c.x, c.z, 2)).toBe(true);
    }
    expect(canReach(seen, blocks.reset.x, blocks.reset.z, 1.5)).toBe(true);
    expect(canReach(seen, shrine.x, shrine.z, 2)).toBe(false);
    expect(canReach(seen, north.x, north.z, 0.4)).toBe(false);
    // Con los bloques, el altar.
    progress.gates.push('cienaga-alcoba');
    seen = seenAt();
    expect(canReach(seen, shrine.x, shrine.z, 2)).toBe(true);
    expect(canReach(seen, north.x, north.z, 0.4)).toBe(false);
    // Con las antorchas, todo el resto.
    progress.gates.push('cienaga-puerta');
    seen = seenAt();
    expect(canReach(seen, north.x, north.z, 0.4)).toBe(true);
    for (const c of zone.chests) expect(canReach(seen, c.x, c.z, 1.8), c.id).toBe(true);
    for (const b of zone.beacons) expect(canReach(seen, b.x, b.z, 1.6), b.id).toBe(true);
    for (const s of zone.signs) expect(canReach(seen, s.x, s.z, 1.6), s.id).toBe(true);
  });

  it('las antorchas y los prismas están a pie de orilla: nunca se llega a tocarlos, pero sí se ven de cerca', () => {
    for (const id of ['cienaga-antorchas', 'cueva-prismas']) {
      const data = PUZZLES.find((p) => p.id === id);
      if (data?.kind !== 'sequence') throw new Error(`Falta ${id}`);
      const zone = ZONES[data.zone];
      const adventure = createAdventure(createProgress('alba'), data.zone);
      const from = Object.values(zone.entries)[0];
      if (!from) throw new Error('falta la llegada');
      const seen = reachable(zone, adventure.blocks, from.x, from.z);
      // Desde algún punto pisable hay línea de tiro dentro del alcance del Pulso.
      for (const s of data.switches)
        expect(canReach(seen, s.x, s.z, ABILITY_BALANCE.pulso.range * 0.6), s.id).toBe(true);
    }
  });

  it('en la Cueva la grieta solo se cruza con el Impulso y cada barrera guarda lo suyo', () => {
    const zone = ZONES.cueva;
    const progress = createProgress('ciro');
    const adventure = createAdventure(progress, 'cueva');
    const south = start('cueva', 'fromCienaga');
    const middle = start('cueva', 'medio');
    const shrine = zone.shrines[0];
    if (!shrine) throw new Error('falta el altar');
    const chest = (id: string): { x: number; z: number } => {
      const c = zone.chests.find((k) => k.id === id);
      if (!c) throw new Error(`Falta el cofre ${id}`);
      return c;
    };
    const southSeen = (): Set<string> => {
      refreshBlocks(adventure);
      return reachable(zone, adventure.blocks, south.x, south.z);
    };
    const middleSeen = (): Set<string> => {
      refreshBlocks(adventure);
      return reachable(zone, adventure.blocks, middle.x, middle.z);
    };
    let seen = southSeen();
    // A pie no se pasa de la grieta.
    expect(canReach(seen, middle.x, middle.z, 1)).toBe(false);
    expect(canReach(seen, shrine.x, shrine.z, 2)).toBe(false);
    progress.gates.push('cueva-sala');
    seen = southSeen();
    expect(canReach(seen, shrine.x, shrine.z, 2)).toBe(true);
    expect(canReach(seen, chest('cueva-sala').x, chest('cueva-sala').z, 1.8)).toBe(true);
    // Del otro lado: el faro, pero la barrera detiene el paso hacia el jefe y el tesoro.
    seen = middleSeen();
    const boss = zone.boss;
    if (!boss) throw new Error('falta el jefe');
    expect(canReach(seen, boss.x, boss.z, 1)).toBe(false);
    expect(canReach(seen, chest('cueva-tesoro').x, chest('cueva-tesoro').z, 1.8)).toBe(false);
    progress.gates.push('cueva-tesoro');
    seen = middleSeen();
    expect(canReach(seen, chest('cueva-tesoro').x, chest('cueva-tesoro').z, 1.8)).toBe(true);
    progress.gates.push('cueva-cristal');
    seen = middleSeen();
    expect(canReach(seen, boss.x, boss.z, 1)).toBe(true);
    const reward = chest('cueva-guardian');
    expect(canReach(seen, reward.x, reward.z, 1.8)).toBe(false);
    progress.gates.push('cueva-fortaleza');
    seen = middleSeen();
    expect(canReach(seen, reward.x, reward.z, 1.8)).toBe(true);
    for (const s of zone.signs) {
      if (s.id !== 'cueva-cartel-prismas' && s.id !== 'cueva-cartel-grieta') {
        expect(canReach(seen, s.x, s.z, 1.6), s.id).toBe(true);
      }
    }
  });

  it('el Impulso cruza la gran grieta desde el borde, en los dos sentidos', () => {
    const blocks = createAdventure(createProgress('alba'), 'cueva').blocks;
    const r = PLAYER_BALANCE.radius;
    const north = planDash(0, 0 - 0.1 + -0.5, 0, 1, r, blocks);
    expect(north.z).toBeGreaterThan(3.7 + r - 0.01);
    const back = planDash(0, 4.6, 0, -1, r, blocks);
    expect(back.z).toBeLessThan(0.3 - r + 0.01);
  });

  it('ningún punto de llegada cae dentro de un bloque', () => {
    for (const id of STORY_ZONES) {
      const adventure = createAdventure(createProgress('alba'), id);
      for (const [name, entry] of Object.entries(ZONES[id].entries)) {
        const p = { x: entry.x, z: entry.z };
        expect(resolveCircle(p, PLAYER_BALANCE.radius, adventure.blocks), `${id}/${name}`).toBe(false);
      }
    }
  });
});
