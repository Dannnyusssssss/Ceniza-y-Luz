import type { GameMode } from './session';

/** Lee el modo de la URL. Solo `?modo=arena` cambia algo; cualquier otro valor deja la aventura. */
export function readGameMode(search: string): GameMode {
  return new URLSearchParams(search).get('modo') === 'arena' ? 'arena' : 'story';
}
