import { hasFlag, type Progress } from './progress';

/** Qué le toca hacer al jugador; la interfaz lo muestra siempre, así nadie se queda sin saber adónde ir. */
export type ObjectiveId = 'blade' | 'forest' | 'blocks' | 'key' | 'clearing' | 'mist';

export function currentObjective(progress: Progress): ObjectiveId {
  if (!hasFlag(progress, 'bladeTaken')) return 'blade';
  if (progress.place.zone === 'lumbre' && !progress.puzzles.includes('bosque-bloque')) return 'forest';
  if (!progress.puzzles.includes('bosque-bloque')) return 'blocks';
  if (!progress.chests.includes('bosque-llave')) return 'key';
  if (!progress.gates.includes('bosque-claro')) return 'clearing';
  return 'mist';
}
