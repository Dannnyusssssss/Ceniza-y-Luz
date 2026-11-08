import type { SafeStorage } from '../core/storage';
import { parseSave, serializeSave } from '../game/save';
import type { Progress } from '../game/progress';

const SAVE_KEY = 'save';

/** La partida guardada en este navegador. Cualquier fallo se trata como "no hay partida" o "no se pudo guardar". */
export class SaveSlot {
  constructor(private readonly storage: SafeStorage) {}

  load(): Progress | null {
    return parseSave(this.storage.read(SAVE_KEY));
  }

  /** Devuelve false si no se pudo guardar (cuota llena o almacenamiento bloqueado). */
  save(progress: Progress): boolean {
    return this.storage.write(SAVE_KEY, serializeSave(progress));
  }

  clear(): void {
    this.storage.remove(SAVE_KEY);
  }
}
