import { createRng } from '../core/rng';
import type { BlockData, Point2 } from '../data/arena';
import type { ExitData, GateData, ZoneData } from '../data/zones';
import { PUZZLES, type PuzzleData } from '../data/puzzles';
import { groundHeight } from './terrain';

/** Medio lado de la colisión de un árbol dentro de la zona. */
const TREE_HALF = 0.32;
/** Grosor de los límites invisibles. */
const BOUND = 1;
/** Margen de la decoración respecto a los límites. */
const MARGIN = 1.2;
const BOUND_HEIGHT = 8;

/** Un árbol, roca o adorno ya colocado. `s` es la escala. */
export interface ScatterItem extends Point2 {
  readonly s: number;
  readonly yaw: number;
}

export interface ZoneLayout {
  /** Árboles con colisión, dentro de la zona. */
  readonly innerTrees: readonly ScatterItem[];
  readonly outerTrees: readonly ScatterItem[];
  readonly rocks: readonly ScatterItem[];
  readonly flowers: readonly ScatterItem[];
  readonly mushrooms: readonly ScatterItem[];
  /** Todos los bloques fijos, con la altura medida desde y = 0. */
  readonly blocks: readonly BlockData[];
  /** Los que detienen la cámara. */
  readonly cameraBlocks: readonly BlockData[];
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len = dx * dx + dz * dz;
  const t = len > 0 ? Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / len, 0), 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function puzzlesOf(zone: ZoneData): readonly PuzzleData[] {
  return PUZZLES.filter((p) => p.zone === zone.id);
}

/** Puntos de la zona donde no debe caer decoración: objetos, caminos, puzzles y zonas despejadas. */
function isOccupied(zone: ZoneData, x: number, z: number, margin: number): boolean {
  for (const a of zone.scatter.clear) if (Math.hypot(x - a.x, z - a.z) < a.radius + margin) return true;
  for (const p of zone.paths) {
    if (distanceToSegment(x, z, p.ax, p.az, p.bx, p.bz) < p.width / 2 + margin) return true;
  }
  for (const b of zone.blocks) {
    if (Math.abs(x - b.x) < b.halfX + margin && Math.abs(z - b.z) < b.halfZ + margin) return true;
  }
  for (const g of zone.gates) {
    if (Math.hypot(x - g.x, z - g.z) < g.width / 2 + margin + 2) return true;
  }
  const points: readonly Point2[] = [
    ...zone.chests,
    ...zone.beacons,
    ...zone.npcs,
    ...zone.signs,
    ...zone.structures,
    ...zone.exits,
    ...zone.crystals,
    ...zone.enemies,
  ];
  for (const p of points) if (Math.hypot(x - p.x, z - p.z) < 2 + margin) return true;
  for (const puzzle of puzzlesOf(zone)) {
    if (puzzle.kind === 'sequence') {
      for (const s of puzzle.switches) if (Math.hypot(x - s.x, z - s.z) < 2.6 + margin) return true;
    } else {
      const half = puzzle.cellSize / 2;
      const minX = puzzle.origin.x - half;
      const minZ = puzzle.origin.z - half;
      const pad = margin + 1;
      const insideX = x > minX - pad && x < minX + puzzle.cols * puzzle.cellSize + pad;
      const insideZ = z > minZ - pad && z < minZ + puzzle.rows * puzzle.cellSize + pad;
      if (insideX && insideZ) return true;
    }
  }
  return false;
}

/** Reparte la decoración siempre igual para cada zona (usa la semilla de sus datos). */
export function buildLayout(zone: ZoneData): ZoneLayout {
  const rng = createRng(zone.scatter.seed);
  const place = (count: number, margin: number, min: number, max: number): ScatterItem[] => {
    const items: ScatterItem[] = [];
    for (let tries = 0; items.length < count && tries < count * 40; tries++) {
      const x = rng.range(-zone.halfX + MARGIN, zone.halfX - MARGIN);
      const z = rng.range(-zone.halfZ + MARGIN, zone.halfZ - MARGIN);
      if (isOccupied(zone, x, z, margin)) continue;
      if (items.some((o) => Math.hypot(o.x - x, o.z - z) < margin * 1.6)) continue;
      items.push({ x, z, s: rng.range(min, max), yaw: rng.range(0, Math.PI * 2) });
    }
    return items;
  };
  const outside = (count: number, min: number, max: number): ScatterItem[] => {
    const items: ScatterItem[] = [];
    const reach = Math.max(zone.halfX, zone.halfZ) + 30;
    for (let i = 0; i < count; i++) {
      for (;;) {
        const x = rng.range(-reach, reach);
        const z = rng.range(-reach, reach);
        if (Math.abs(x) <= zone.halfX + 1.5 && Math.abs(z) <= zone.halfZ + 1.5) continue;
        items.push({ x, z, s: rng.range(min, max), yaw: rng.range(0, Math.PI * 2) });
        break;
      }
    }
    return items;
  };

  const innerTrees = place(zone.scatter.innerTrees, 1.5, 0.85, 1.5);
  const outerTrees = outside(zone.scatter.outerTrees, 0.9, 1.7);
  const innerRocks = Math.ceil(zone.scatter.rocks / 3);
  const rocks = [...place(innerRocks, 1.2, 0.5, 1), ...outside(zone.scatter.rocks - innerRocks, 0.6, 2.2)];
  const flowers = place(zone.scatter.flowers, 0.5, 0.7, 1.2);
  const mushrooms = place(zone.scatter.mushrooms, 0.7, 0.7, 1.4);

  const treeBlocks: BlockData[] = innerTrees.map((t) => ({
    x: t.x,
    z: t.z,
    halfX: TREE_HALF * t.s,
    halfZ: TREE_HALF * t.s,
    height: 3,
    kind: 'tree',
  }));
  const raised: BlockData[] = zone.blocks.map((b) => ({
    ...b,
    height: b.height + groundHeight(zone, b.x, b.z),
  }));
  return {
    innerTrees,
    outerTrees,
    rocks,
    flowers,
    mushrooms,
    blocks: [...raised, ...treeBlocks, ...boundsOf(zone)],
    cameraBlocks: raised.filter((b) => b.kind !== 'bound' && b.kind !== 'crack'),
  };
}

/** Límites invisibles alrededor de la zona. */
export function boundsOf(zone: ZoneData): BlockData[] {
  const { halfX: hx, halfZ: hz } = zone;
  const make = (x: number, z: number, halfX: number, halfZ: number): BlockData => ({
    x,
    z,
    halfX,
    halfZ,
    height: BOUND_HEIGHT,
    kind: 'bound',
  });
  return [
    make(0, hz + BOUND, hx + BOUND * 2, BOUND),
    make(0, -hz - BOUND, hx + BOUND * 2, BOUND),
    make(hx + BOUND, 0, BOUND, hz + BOUND * 2),
    make(-hx - BOUND, 0, BOUND, hz + BOUND * 2),
  ];
}

/** Bloque sólido de una puerta cerrada. */
export function gateBlock(gate: GateData, ground = 0): BlockData {
  const half = gate.width / 2;
  return {
    x: gate.x,
    z: gate.z,
    halfX: gate.alongX ? half : 0.45,
    halfZ: gate.alongX ? 0.45 : half,
    height: 3 + ground,
    kind: 'wall',
  };
}

/** La salida en la que está el punto, si hay alguna. */
export function exitAt(exits: readonly ExitData[], x: number, z: number): ExitData | null {
  for (const e of exits) if (Math.abs(x - e.x) <= e.halfX && Math.abs(z - e.z) <= e.halfZ) return e;
  return null;
}
