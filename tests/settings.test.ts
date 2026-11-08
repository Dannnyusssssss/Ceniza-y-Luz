import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  migrateSettings,
  parseSettings,
  serializeSettings,
  validateSettings,
} from '../src/core/settings';
import { SettingsStore, SETTINGS_KEY } from '../src/core/settingsStore';
import { SafeStorage, type StorageLike } from '../src/core/storage';
import { FOV_RANGE, SENSITIVITY_RANGE, SETTINGS_VERSION } from '../src/data/settings';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  failWrites = false;
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Cuota llena', 'QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('bloqueado');
  }
  setItem(): void {
    throw new Error('bloqueado');
  }
  removeItem(): void {
    throw new Error('bloqueado');
  }
}

describe('defaultSettings', () => {
  it('respeta prefers-reduced-motion', () => {
    expect(defaultSettings(true).reduceMotion).toBe(true);
    expect(defaultSettings(false).reduceMotion).toBe(false);
  });

  it('empieza en calidad Media, con sonido y la versión actual', () => {
    const s = defaultSettings(false);
    expect(s.quality).toBe('medium');
    expect(s.muted).toBe(false);
    expect(s.version).toBe(SETTINGS_VERSION);
  });
});

describe('parseSettings', () => {
  it('ida y vuelta conserva los valores', () => {
    const custom = {
      ...defaultSettings(false),
      muted: true,
      fov: 90,
      quality: 'high' as const,
      invertY: true,
    };
    expect(parseSettings(serializeSettings(custom), false)).toEqual(custom);
  });

  it('sin datos devuelve los valores por defecto', () => {
    expect(parseSettings(null, false)).toEqual(defaultSettings(false));
    expect(parseSettings('', true)).toEqual(defaultSettings(true));
  });

  it('un guardado corrupto no rompe nada', () => {
    for (const raw of ['{', 'null', '42', '"texto"', '[]', 'undefined', '{"muted":', '\u0000\u0001']) {
      expect(parseSettings(raw, false)).toEqual(defaultSettings(false));
    }
  });

  it('rechaza textos demasiado largos', () => {
    const huge = JSON.stringify({ muted: true, pad: 'x'.repeat(10000) });
    expect(parseSettings(huge, false)).toEqual(defaultSettings(false));
  });

  it('valida campo por campo: conserva lo válido y corrige lo inválido', () => {
    const raw = JSON.stringify({
      version: 1,
      muted: true,
      reduceFlashing: 'sí',
      sensitivity: 'alta',
      fov: 75,
      quality: 'ultra',
      textSize: 'large',
    });
    const s = parseSettings(raw, false);
    expect(s.muted).toBe(true);
    expect(s.reduceFlashing).toBe(false);
    expect(s.sensitivity).toBe(SENSITIVITY_RANGE.default);
    expect(s.fov).toBe(75);
    expect(s.quality).toBe('medium');
    expect(s.textSize).toBe('large');
  });

  it('recorta números fuera de rango y descarta no finitos', () => {
    expect(parseSettings(JSON.stringify({ fov: 500 }), false).fov).toBe(FOV_RANGE.max);
    expect(parseSettings(JSON.stringify({ fov: -3 }), false).fov).toBe(FOV_RANGE.min);
    expect(parseSettings(JSON.stringify({ sensitivity: 1e308 * 10 }), false).sensitivity).toBe(
      SENSITIVITY_RANGE.default,
    );
    expect(parseSettings(JSON.stringify({ sensitivity: 1.234 }), false).sensitivity).toBe(1.2);
  });

  it('descarta campos desconocidos (incluidos los peligrosos)', () => {
    const s = parseSettings('{"__proto__":{"muted":true},"hack":"<img>"}', false) as unknown as Record<
      string,
      unknown
    >;
    expect(s['hack']).toBeUndefined();
    expect(s['muted']).toBe(false);
  });
});

describe('migrateSettings', () => {
  it('migra un guardado sin versión (v0) conservando lo válido', () => {
    const migrated = migrateSettings({ mute: true, fov: 80 });
    expect(migrated['version']).toBe(SETTINGS_VERSION);
    expect(migrated['muted']).toBe(true);
    expect(validateSettings({ mute: true, fov: 80 }, false)).toMatchObject({ muted: true, fov: 80 });
  });

  it('un guardado de una versión futura se valida igual, sin romperse', () => {
    const s = validateSettings({ version: 99, muted: true, quality: 'low', extra: 1 }, false);
    expect(s).toMatchObject({ version: SETTINGS_VERSION, muted: true, quality: 'low' });
  });
});

describe('SafeStorage', () => {
  it('usa el prefijo del juego', () => {
    const mem = new MemoryStorage();
    new SafeStorage(mem).write('settings', 'x');
    expect(mem.data.get('cenizayluz:settings')).toBe('x');
  });

  it('con la cuota llena devuelve false sin lanzar', () => {
    const mem = new MemoryStorage();
    mem.failWrites = true;
    expect(new SafeStorage(mem).write('settings', 'x')).toBe(false);
  });

  it('con el almacenamiento bloqueado o ausente no lanza', () => {
    const blocked = new SafeStorage(new ThrowingStorage());
    expect(blocked.read('settings')).toBeNull();
    expect(blocked.write('settings', 'x')).toBe(false);
    expect(blocked.remove('settings')).toBe(false);
    const none = new SafeStorage(null);
    expect(none.read('settings')).toBeNull();
    expect(none.write('settings', 'x')).toBe(false);
  });
});

describe('SettingsStore', () => {
  it('carga, actualiza, valida y guarda', () => {
    const mem = new MemoryStorage();
    const store = new SettingsStore(new SafeStorage(mem), false);
    let notified = 0;
    store.onChange(() => notified++);
    store.update({ fov: 999, muted: true });
    expect(store.value.fov).toBe(FOV_RANGE.max);
    expect(store.value.muted).toBe(true);
    expect(notified).toBe(1);
    const reloaded = new SettingsStore(new SafeStorage(mem), false);
    expect(reloaded.value).toEqual(store.value);
  });

  it('arranca con un guardado corrupto y lo reemplaza al cambiar algo', () => {
    const mem = new MemoryStorage();
    mem.data.set('cenizayluz:' + SETTINGS_KEY, '{roto');
    const store = new SettingsStore(new SafeStorage(mem), true);
    expect(store.value).toEqual(defaultSettings(true));
    store.update({ invertY: true });
    expect(JSON.parse(mem.data.get('cenizayluz:' + SETTINGS_KEY) ?? '{}')).toMatchObject({ invertY: true });
  });

  it('si no puede guardar, sigue funcionando y lo indica', () => {
    const mem = new MemoryStorage();
    mem.failWrites = true;
    const store = new SettingsStore(new SafeStorage(mem), false);
    store.update({ muted: true });
    expect(store.value.muted).toBe(true);
    expect(store.lastSaveOk).toBe(false);
  });
});

describe('SettingsStore.reset', () => {
  it('borra lo guardado y vuelve a los valores iniciales', () => {
    const mem = new MemoryStorage();
    const store = new SettingsStore(new SafeStorage(mem), false);
    store.update({ muted: true, fov: 90 });
    let notified = 0;
    store.onChange(() => notified++);
    store.reset();
    expect(store.value).toEqual(defaultSettings(false));
    expect(mem.data.has('cenizayluz:' + SETTINGS_KEY)).toBe(false);
    expect(notified).toBe(1);
  });
});
