import type { ZoneId } from './zones';

/** Símbolos de los interruptores: se distinguen por la forma y por el nombre, no solo por el color. */
export type SwitchSymbol = 'sol' | 'luna' | 'estrella';

export interface SwitchData {
  readonly id: string;
  readonly symbol: SwitchSymbol;
  readonly x: number;
  readonly z: number;
}

/** Activar los interruptores en el orden que muestra el mural. Fallar solo reinicia el orden. */
export interface SequencePuzzle {
  readonly kind: 'sequence';
  readonly id: string;
  readonly zone: ZoneId;
  readonly switches: readonly SwitchData[];
  /** Identificadores en el orden correcto. */
  readonly order: readonly string[];
  /** Mural con los símbolos en orden: la pista siempre visible. */
  readonly mural: { readonly x: number; readonly z: number; readonly yaw: number };
  /** Qué pieza es: piedra que se toca con E (por defecto), antorcha o prisma que se encienden con el Pulso. */
  readonly piece?: 'stone' | 'torch' | 'prism';
}

/** Celda de la cuadrícula: [columna, fila]. */
export type Cell = readonly [number, number];

/** Empujar bloques sobre plataformas de presión. La piedra de reinicio los devuelve a su sitio. */
export interface BlocksPuzzle {
  readonly kind: 'blocks';
  readonly id: string;
  readonly zone: ZoneId;
  /** Centro de la celda [0, 0]. */
  readonly origin: { readonly x: number; readonly z: number };
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  /** Celdas ocupadas por rocas fijas. */
  readonly solids: readonly Cell[];
  /** Dónde empieza cada bloque. */
  readonly blocks: readonly Cell[];
  /** Plataformas: todas deben tener un bloque encima. */
  readonly plates: readonly Cell[];
  readonly reset: { readonly x: number; readonly z: number };
}

export type PuzzleData = SequencePuzzle | BlocksPuzzle;

export const PUZZLES: readonly PuzzleData[] = [
  {
    kind: 'sequence',
    id: 'bosque-simbolos',
    zone: 'bosque',
    switches: [
      { id: 'piedra-luna', symbol: 'luna', x: -18, z: -21 },
      { id: 'piedra-sol', symbol: 'sol', x: -14, z: -14 },
      { id: 'piedra-estrella', symbol: 'estrella', x: -18, z: -7 },
    ],
    order: ['piedra-sol', 'piedra-estrella', 'piedra-luna'],
    mural: { x: -21.5, z: -9.6, yaw: Math.PI / 2 },
  },
  {
    kind: 'blocks',
    id: 'bosque-bloque',
    zone: 'bosque',
    origin: { x: 7, z: -6 },
    cellSize: 2,
    cols: 6,
    rows: 6,
    solids: [
      [3, 2],
      [1, 4],
    ],
    blocks: [[2, 1]],
    plates: [[4, 4]],
    reset: { x: 5, z: -8.5 },
  },
  {
    kind: 'blocks',
    id: 'cienaga-bloques',
    zone: 'cienaga',
    origin: { x: -28, z: -30 },
    cellSize: 2,
    cols: 6,
    rows: 6,
    solids: [
      [3, 3],
      [0, 3],
    ],
    blocks: [
      [1, 1],
      [4, 2],
    ],
    plates: [
      [2, 4],
      [4, 4],
    ],
    reset: { x: -15, z: -27.5 },
  },
  {
    kind: 'sequence',
    id: 'cienaga-antorchas',
    zone: 'cienaga',
    piece: 'torch',
    switches: [
      { id: 'antorcha-luna', symbol: 'luna', x: -9, z: -7 },
      { id: 'antorcha-sol', symbol: 'sol', x: -16, z: -3 },
      { id: 'antorcha-estrella', symbol: 'estrella', x: 13, z: -5 },
    ],
    order: ['antorcha-estrella', 'antorcha-sol', 'antorcha-luna'],
    mural: { x: -4.5, z: -13, yaw: Math.PI / 2 },
  },
  {
    kind: 'sequence',
    id: 'cueva-prismas',
    zone: 'cueva',
    piece: 'prism',
    switches: [
      { id: 'prisma-luna', symbol: 'luna', x: -14, z: -12 },
      { id: 'prisma-sol', symbol: 'sol', x: 14, z: -12 },
      { id: 'prisma-estrella', symbol: 'estrella', x: 0, z: -5 },
    ],
    order: ['prisma-luna', 'prisma-sol', 'prisma-estrella'],
    mural: { x: -4.5, z: -22, yaw: Math.PI / 2 },
  },
];

const BY_ID = new Map(PUZZLES.map((p) => [p.id, p]));

export function puzzleById(id: string): PuzzleData | undefined {
  return BY_ID.get(id);
}
