import type { Settings } from '../data/settings';
import { defaultSettings, parseSettings, serializeSettings, validateSettings } from './settings';
import type { SafeStorage } from './storage';

export const SETTINGS_KEY = 'settings';

/** Ajustes vivos del juego: los carga, los valida al cambiar y los guarda. */
export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();
  /** false si el último guardado falló (para avisar en la interfaz). */
  lastSaveOk = true;

  constructor(
    private readonly storage: SafeStorage,
    private readonly prefersReducedMotion: boolean,
  ) {
    this.current = parseSettings(storage.read(SETTINGS_KEY), prefersReducedMotion);
  }

  get value(): Settings {
    return this.current;
  }

  /** Aplica cambios parciales; los valores inválidos se corrigen al validar. */
  update(patch: Partial<Omit<Settings, 'version'>>): void {
    this.current = validateSettings({ ...this.current, ...patch }, this.prefersReducedMotion);
    this.lastSaveOk = this.storage.write(SETTINGS_KEY, serializeSettings(this.current));
    for (const listener of [...this.listeners]) listener(this.current);
  }

  /** Borra los ajustes guardados y vuelve a los valores iniciales. */
  reset(): void {
    this.storage.remove(SETTINGS_KEY);
    this.current = defaultSettings(this.prefersReducedMotion);
    this.lastSaveOk = true;
    for (const listener of [...this.listeners]) listener(this.current);
  }

  onChange(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
