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
];

const BY_ID = new Map(PUZZLES.map((p) => [p.id, p]));

export function puzzleById(id: string): PuzzleData | undefined {
  return BY_ID.get(id);
}
