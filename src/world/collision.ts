import type { BlockData } from '../data/arena';

/** Posición mutable en el plano del suelo. */
export interface Position2 {
  x: number;
  z: number;
}

const RESOLVE_ITERATIONS = 4;
const EPSILON = 1e-6;

/**
 * Empuja un círculo fuera de los bloques que toca, por el camino más corto.
 * Varias pasadas resuelven las esquinas entre dos bloques sin dejar al jugador atrapado.
 * Devuelve true si hubo contacto.
 */
export function resolveCircle(pos: Position2, radius: number, blocks: readonly BlockData[]): boolean {
  let touched = false;
  for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
    let moved = false;
    for (const b of blocks) {
      const minX = b.x - b.halfX;
      const maxX = b.x + b.halfX;
      const minZ = b.z - b.halfZ;
      const maxZ = b.z + b.halfZ;
      const cx = Math.min(Math.max(pos.x, minX), maxX);
      const cz = Math.min(Math.max(pos.z, minZ), maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq >= radius * radius) continue;

      if (distSq > EPSILON) {
        // El centro está fuera del bloque: se empuja en la dirección del punto más cercano.
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // El centro quedó dentro: se saca por la cara más cercana.
        const toLeft = pos.x - minX;
        const toRight = maxX - pos.x;
        const toBack = pos.z - minZ;
        const toFront = maxZ - pos.z;
        const least = Math.min(toLeft, toRight, toBack, toFront);
        if (least === toLeft) pos.x = minX - radius;
        else if (least === toRight) pos.x = maxX + radius;
        else if (least === toBack) pos.z = minZ - radius;
        else pos.z = maxZ + radius;
      }
      moved = true;
      touched = true;
    }
    if (!moved) break;
  }
  return touched;
}

/**
 * Mueve un círculo `dx, dz` deslizándolo por las paredes. Divide el movimiento en sub-pasos
 * para que un desplazamiento rápido (la esquiva) no atraviese un muro delgado.
 */
export function moveCircle(
  pos: Position2,
  dx: number,
  dz: number,
  radius: number,
  blocks: readonly BlockData[],
): boolean {
  const distance = Math.sqrt(dx * dx + dz * dz);
  const maxStep = radius * 0.5;
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  let touched = false;
  for (let i = 0; i < steps; i++) {
    pos.x += dx / steps;
    pos.z += dz / steps;
    if (resolveCircle(pos, radius, blocks)) touched = true;
  }
  return touched;
}

/**
 * Distancia desde `origin` en la dirección `dir` (normalizada) hasta el primer bloque, o `maxDistance`.
 * Los bloques van del suelo (y = 0) a su altura. Se usa para que la cámara no atraviese paredes.
 */
export function raycastBlocks(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  maxDistance: number,
  blocks: readonly BlockData[],
): number {
  let nearest = maxDistance;
  for (const b of blocks) {
    const t = rayBox(origin, dir, b);
    if (t !== null && t < nearest) nearest = t;
  }
  return nearest;
}

/** Intersección rayo-caja por el método de las franjas. Devuelve la distancia de entrada o null. */
function rayBox(
  o: { x: number; y: number; z: number },
  d: { x: number; y: number; z: number },
  b: BlockData,
): number | null {
  let tMin = 0;
  let tMax = Number.POSITIVE_INFINITY;
  const axes: [number, number, number, number][] = [
    [o.x, d.x, b.x - b.halfX, b.x + b.halfX],
    [o.y, d.y, 0, b.height],
    [o.z, d.z, b.z - b.halfZ, b.z + b.halfZ],
  ];
  for (const [origin, dir, min, max] of axes) {
    if (Math.abs(dir) < EPSILON) {
      if (origin < min || origin > max) return null;
      continue;
    }
    let t1 = (min - origin) / dir;
    let t2 = (max - origin) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  return tMin;
}
