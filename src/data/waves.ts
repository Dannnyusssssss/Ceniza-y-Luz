import type { EnemyKind } from './enemies';
import type { Point2 } from './arena';

/** Un grupo de enemigos de una oleada. */
export interface WaveGroup {
  readonly kind: EnemyKind;
  readonly count: number;
}

export interface WaveData {
  readonly groups: readonly WaveGroup[];
}

/** Oleadas de la arena de práctica: cada vez más difíciles, mezclando los 4 tipos. */
export const WAVES: readonly WaveData[] = [
  { groups: [{ kind: 'brumilla', count: 3 }] },
  {
    groups: [
      { kind: 'brumilla', count: 2 },
      { kind: 'tirador', count: 1 },
    ],
  },
  {
    groups: [
      { kind: 'acechador', count: 2 },
      { kind: 'brumilla', count: 2 },
    ],
  },
  {
    groups: [
      { kind: 'coloso', count: 1 },
      { kind: 'brumilla', count: 2 },
    ],
  },
  {
    groups: [
      { kind: 'acechador', count: 2 },
      { kind: 'tirador', count: 2 },
    ],
  },
  {
    groups: [
      { kind: 'coloso', count: 1 },
      { kind: 'acechador', count: 1 },
      { kind: 'tirador', count: 1 },
      { kind: 'brumilla', count: 3 },
    ],
  },
];

export const WAVE_RULES = {
  /** Pausa entre oleadas (s). */
  intermission: 4,
  /** Pausa antes de la primera oleada (s). */
  firstDelay: 2.5,
  /** Al repetir todas las oleadas, la vida de los enemigos sube este factor por vuelta. */
  loopHealthFactor: 1.3,
  /** Los enemigos no aparecen a menos de esta distancia del jugador. */
  minSpawnDistance: 7,
} as const;

/** Puntos donde pueden surgir los enemigos (dentro de la arena, lejos de los muros). */
export const SPAWN_POINTS: readonly Point2[] = [
  { x: -13, z: 13 },
  { x: 0, z: 14 },
  { x: 13, z: 13 },
  { x: 14, z: 0 },
  { x: 13, z: -13 },
  { x: 0, z: -14 },
  { x: 4, z: -12 },
  { x: -14, z: 4 },
  { x: -3, z: 4 },
  { x: 4, z: 3 },
];
