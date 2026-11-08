/** Arena de práctica del Hito 1: un claro con muros bajos de piedra. Unidades en metros. */

/** Bloque sólido alineado con los ejes, apoyado en el suelo. */
export interface BlockData {
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly height: number;
  readonly kind: 'wall' | 'pillar' | 'ruin';
}

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

const HALF = 18;
const WALL = 0.6;
const WALL_HEIGHT = 1.3;

export const ARENA = {
  halfSize: HALF,
  playerSpawn: { x: 0, z: -9 } as Point2,
  /** Hacia dónde mira el jugador al empezar (radianes, 0 = +z). */
  playerSpawnYaw: 0,
  /** El muñeco de práctica queda en un rincón, fuera del paso de las oleadas. */
  dummy: { x: -12, z: -10 } as Point2,
  blocks: [
    // Muros perimetrales.
    { x: 0, z: HALF, halfX: HALF + WALL, halfZ: WALL, height: WALL_HEIGHT, kind: 'wall' },
    { x: 0, z: -HALF, halfX: HALF + WALL, halfZ: WALL, height: WALL_HEIGHT, kind: 'wall' },
    { x: HALF, z: 0, halfX: WALL, halfZ: HALF + WALL, height: WALL_HEIGHT, kind: 'wall' },
    { x: -HALF, z: 0, halfX: WALL, halfZ: HALF + WALL, height: WALL_HEIGHT, kind: 'wall' },
    // Pilares y ruinas para probar colisiones y la cámara.
    { x: -8, z: 6, halfX: 0.8, halfZ: 0.8, height: 3.2, kind: 'pillar' },
    { x: 8, z: 6, halfX: 0.8, halfZ: 0.8, height: 3.2, kind: 'pillar' },
    { x: -9, z: -6, halfX: 0.8, halfZ: 0.8, height: 2.4, kind: 'pillar' },
    { x: 10, z: -4, halfX: 2.5, halfZ: 0.5, height: 1.1, kind: 'ruin' },
    { x: -4, z: 12, halfX: 0.5, halfZ: 2.5, height: 1.4, kind: 'ruin' },
    // Esquina en "L" para comprobar que el jugador no queda atrapado.
    { x: 6, z: 12, halfX: 2, halfZ: 0.5, height: 1.4, kind: 'ruin' },
    { x: 7.5, z: 10, halfX: 0.5, halfZ: 2, height: 1.4, kind: 'ruin' },
  ] as readonly BlockData[],
  decoration: {
    seed: 20261107,
    /** Árboles fuera del muro, en un anillo entre estos radios. */
    treeRing: { inner: HALF + 3, outer: HALF + 26, count: 70 },
    rockRing: { inner: HALF + 1.5, outer: HALF + 22, count: 40 },
    /** Cristales de luz dentro del claro, junto a los muros. */
    crystals: [
      { x: -15.5, z: 15.5 },
      { x: 15.5, z: 15.5 },
      { x: -15.5, z: -15.5 },
      { x: 15.5, z: -15.5 },
      { x: -8, z: 7.6 },
      { x: 8, z: 7.6 },
    ] as readonly Point2[],
    /** Radio de la zona de suelo de camino alrededor del centro. */
    pathRadius: 7,
    groundRadius: 70,
  },
} as const;
