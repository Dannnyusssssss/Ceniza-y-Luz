import type { CharacterId } from '../data/characters';
import type { Dialogue, DialogueLine, LineText } from '../data/texts';
import { DIALOGUES } from '../data/texts';
import type { NpcId } from '../data/zones';
import { hasFlag, type Progress } from './progress';

/** Una conversación en curso. Solo avanza cuando el jugador lo pide; nunca por tiempo. */
export interface DialogueCursor {
  readonly lines: Dialogue;
  index: number;
}

export function startDialogue(lines: Dialogue): DialogueCursor {
  return { lines, index: 0 };
}

export function currentLine(cursor: DialogueCursor): DialogueLine | null {
  return cursor.lines[cursor.index] ?? null;
}

/** Pasa a la siguiente línea. Devuelve false cuando ya no quedan. */
export function advanceDialogue(cursor: DialogueCursor): boolean {
  if (cursor.index < cursor.lines.length) cursor.index++;
  return cursor.index < cursor.lines.length;
}

/** El texto de una línea para el personaje elegido. */
export function lineTextFor(text: LineText, character: CharacterId): string {
  return typeof text === 'string' ? text : text[character];
}

/** Lo que dice un aldeano según cómo va la aventura. */
export function pickDialogue(npc: NpcId, progress: Progress): Dialogue {
  const set = DIALOGUES[npc];
  if (hasFlag(progress, 'gameCompleted')) return set.finished;
  return hasFlag(progress, 'bladeTaken') ? set.after : set.before;
}
