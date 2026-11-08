import { META } from '../data/meta';

/** Lo mínimo de `localStorage` que usa el juego; permite probarlo con un sustituto. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Acceso al almacenamiento con prefijo y sin excepciones: si el navegador lo bloquea
 * o la cuota está llena, el juego sigue funcionando sin guardar.
 */
export class SafeStorage {
  constructor(private readonly backend: StorageLike | null) {}

  /** Obtiene `localStorage` si está disponible (puede lanzar en iframes o modo privado). */
  static fromBrowser(): SafeStorage {
    try {
      return new SafeStorage(globalThis.localStorage ?? null);
    } catch {
      return new SafeStorage(null);
    }
  }

  read(key: string): string | null {
    if (!this.backend) return null;
    try {
      return this.backend.getItem(META.storagePrefix + key);
    } catch {
      return null;
    }
  }

  /** Devuelve false si no se pudo guardar (cuota llena o almacenamiento bloqueado). */
  write(key: string, value: string): boolean {
    if (!this.backend) return false;
    try {
      this.backend.setItem(META.storagePrefix + key, value);
      return true;
    } catch {
      return false;
    }
  }

  remove(key: string): boolean {
    if (!this.backend) return false;
    try {
      this.backend.removeItem(META.storagePrefix + key);
      return true;
    } catch {
      return false;
    }
  }
}
