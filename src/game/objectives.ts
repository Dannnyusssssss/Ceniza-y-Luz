import { hasFlag, type Progress } from './progress';

/** Qué le toca hacer al jugador; la interfaz lo muestra siempre, así nadie se queda sin saber adónde ir. */
export type ObjectiveId =
  | 'blade'
  | 'forest'
  | 'blocks'
  | 'key'
  | 'clearing'
  | 'seal'
  | 'mist'
  | 'marshBlocks'
  | 'pulse'
  | 'torches'
  | 'cave'
  | 'prisms'
  | 'impulse'
  | 'crack'
  | 'guardian'
  | 'fortress';

export function currentObjective(progress: Progress): ObjectiveId {
  const { puzzles, chests, gates, abilities, bosses } = progress;
  if (!hasFlag(progress, 'bladeTaken')) return 'blade';
  if (progress.place.zone === 'lumbre' && !puzzles.includes('bosque-bloque')) return 'forest';
  if (!puzzles.includes('bosque-bloque')) return 'blocks';
  if (!chests.includes('bosque-llave')) return 'key';
  if (!gates.includes('bosque-claro')) return 'clearing';
  if (!chests.includes('bosque-sello')) return 'seal';
  if (!gates.includes('bosque-bruma')) return 'mist';
  if (!puzzles.includes('cienaga-bloques')) return 'marshBlocks';
  if (!abilities.includes('pulso')) return 'pulse';
  if (!puzzles.includes('cienaga-antorchas')) return 'torches';
  if (progress.place.zone !== 'cueva' && !puzzles.includes('cueva-prismas')) return 'cave';
  if (!puzzles.includes('cueva-prismas')) return 'prisms';
  if (!abilities.includes('impulso')) return 'impulse';
  if (!gates.includes('cueva-cristal')) return 'crack';
  if (!bosses.includes('guardian')) return 'guardian';
  return 'fortress';
}
