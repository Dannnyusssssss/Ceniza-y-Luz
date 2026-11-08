import type { BlocksPuzzle, Cell, PuzzleData, SequencePuzzle } from '../data/puzzles';

/** Estado de un puzzle en la zona actual. Solo "resuelto" se guarda; el resto se reinicia al volver. */
export interface PuzzleState {
  solved: boolean;
  /** Secuencia: cuántos interruptores llevan el orden correcto. */
  pressed: number;
  /** Bloques: celda actual de cada uno. */
  blocks: [number, number][];
}

export type SwitchResult = 'advance' | 'wrong' | 'solved' | 'ignored';

export function createPuzzleState(data: PuzzleData, solved: boolean): PuzzleState {
  if (data.kind === 'sequence') return { solved, pressed: solved ? data.order.length : 0, blocks: [] };
  // Resuelto: los bloques se quedan sobre las plataformas.
  const cells = solved ? data.plates : data.blocks;
  return { solved, pressed: 0, blocks: cells.map(([c, r]) => [c, r]) };
}

/** Pulsar un interruptor: si no toca, el orden vuelve a empezar (sin penalización ni tiempo). */
export function pressSwitch(state: PuzzleState, data: SequencePuzzle, switchId: string): SwitchResult {
  if (state.solved || !data.switches.some((s) => s.id === switchId)) return 'ignored';
  if (data.order[state.pressed] !== switchId) {
    // El que se acaba de pulsar puede ser el primero de un intento nuevo.
    state.pressed = data.order[0] === switchId ? 1 : 0;
    return 'wrong';
  }
  state.pressed++;
  if (state.pressed >= data.order.length) {
    state.solved = true;
    return 'solved';
  }
  return 'advance';
}

/** Centro en el mundo de una celda de la cuadrícula. */
export function cellCenter(data: BlocksPuzzle, cell: Cell): { x: number; z: number } {
  return { x: data.origin.x + cell[0] * data.cellSize, z: data.origin.z + cell[1] * data.cellSize };
}

function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** True si un bloque podría entrar en esa celda: dentro de la cuadrícula, sin rocas ni otros bloques. */
export function isCellFree(data: BlocksPuzzle, blocks: readonly Cell[], cell: Cell): boolean {
  if (cell[0] < 0 || cell[1] < 0 || cell[0] >= data.cols || cell[1] >= data.rows) return false;
  if (data.solids.some((s) => sameCell(s, cell))) return false;
  return !blocks.some((b) => sameCell(b, cell));
}

/** True si todas las plataformas tienen un bloque encima. */
export function platesCovered(data: BlocksPuzzle, blocks: readonly Cell[]): boolean {
  return data.plates.every((p) => blocks.some((b) => sameCell(b, p)));
}

/**
 * Empuja el bloque `index` una celda en la dirección (dc, dr). Devuelve true si se movió.
 * Una vez resuelto, los bloques ya no se mueven.
 */
export function pushBlock(
  state: PuzzleState,
  data: BlocksPuzzle,
  index: number,
  dc: number,
  dr: number,
): boolean {
  if (state.solved) return false;
  if (Math.abs(dc) + Math.abs(dr) !== 1) return false;
  const block = state.blocks[index];
  if (!block) return false;
  const target: Cell = [block[0] + dc, block[1] + dr];
  if (!isCellFree(data, state.blocks, target)) return false;
  block[0] = target[0];
  block[1] = target[1];
  if (platesCovered(data, state.blocks)) state.solved = true;
  return true;
}

/** Dirección del empujón según dónde está el jugador: de él hacia el bloque, por el eje dominante. */
export function pushDirection(
  playerX: number,
  playerZ: number,
  blockX: number,
  blockZ: number,
): readonly [number, number] {
  const dx = blockX - playerX;
  const dz = blockZ - playerZ;
  if (Math.abs(dx) >= Math.abs(dz)) return [Math.sign(dx) || 1, 0];
  return [0, Math.sign(dz) || 1];
}

/** Devuelve los bloques a su sitio. No hace nada si el puzzle ya está resuelto. */
export function resetPuzzle(state: PuzzleState, data: PuzzleData): void {
  if (state.solved) return;
  if (data.kind === 'sequence') state.pressed = 0;
  else state.blocks = data.blocks.map(([c, r]) => [c, r]);
}

/** Celdas de un estado, como texto, para buscar soluciones. */
function stateKey(blocks: readonly Cell[]): string {
  return blocks.map((b) => `${b[0]},${b[1]}`).join(';');
}

/**
 * Busca la solución más corta de un puzzle de bloques, respetando que el jugador debe poder ponerse detrás
 * del bloque para empujarlo. Devuelve el número de empujones o null si no tiene solución.
 */
export function shortestSolution(data: BlocksPuzzle): number | null {
  const start = data.blocks.map(([c, r]) => [c, r] as Cell);
  const seen = new Set([stateKey(start)]);
  let frontier: Cell[][] = [start];
  for (let pushes = 0; frontier.length > 0; pushes++) {
    const next: Cell[][] = [];
    for (const blocks of frontier) {
      if (platesCovered(data, blocks)) return pushes;
      blocks.forEach((block, i) => {
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const target: Cell = [block[0] + dc, block[1] + dr];
          const behind: Cell = [block[0] - dc, block[1] - dr];
          if (!isCellFree(data, blocks, target)) continue;
          // Fuera de la cuadrícula hay suelo libre; dentro, no puede haber roca ni otro bloque.
          const behindOutside =
            behind[0] < 0 || behind[1] < 0 || behind[0] >= data.cols || behind[1] >= data.rows;
          if (!behindOutside && !isCellFree(data, blocks, behind)) continue;
          const moved = blocks.map((b, k) => (k === i ? target : b));
          const key = stateKey(moved);
          if (seen.has(key)) continue;
          seen.add(key);
          next.push(moved);
        }
      });
    }
    frontier = next;
  }
  return null;
}
