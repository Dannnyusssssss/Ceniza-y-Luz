import type { BlockData } from './arena';

/** Muro de piedra. */
export function ruin(x: number, z: number, halfX: number, halfZ: number, height = 1.8): BlockData {
  return { x, z, halfX, halfZ, height, kind: 'ruin' };
}

/** Objeto sólido (casas, pilares, murales). */
export function prop(x: number, z: number, halfX: number, halfZ: number, height = 2): BlockData {
  return { x, z, halfX, halfZ, height, kind: 'prop' };
}

/** Grieta o agua honda: no se pisa, pero la cámara, los disparos y el Impulso la ignoran. */
export function crack(x: number, z: number, halfX: number, halfZ: number): BlockData {
  return { x, z, halfX, halfZ, height: 0, kind: 'crack' };
}
