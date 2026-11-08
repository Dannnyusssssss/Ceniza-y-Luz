import {
  DAMAGE_TAKEN_LEVELS,
  FOV_RANGE,
  QUALITY_LEVELS,
  SENSITIVITY_RANGE,
  SETTINGS_MAX_RAW_LENGTH,
  SETTINGS_VERSION,
  TEXT_SIZES,
  type NumberRange,
  type Settings,
} from '../data/settings';
import { clamp } from './math';

/** Ajustes iniciales. "Reducir movimiento" empieza activado si el sistema lo pide. */
export function defaultSettings(prefersReducedMotion: boolean): Settings {
  return {
    version: SETTINGS_VERSION,
    muted: false,
    reduceFlashing: false,
    reduceMotion: prefersReducedMotion,
    sensitivity: SENSITIVITY_RANGE.default,
    invertY: false,
    fov: FOV_RANGE.default,
    quality: 'medium',
    damageTaken: 'normal',
    textSize: 'normal',
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(source: UnknownRecord, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === 'boolean' ? value : fallback;
}

/** Número dentro del rango, redondeado a su paso. Fuera de rango se recorta; no numérico usa el valor por defecto. */
function readNumber(source: UnknownRecord, key: string, range: NumberRange): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return range.default;
  const stepped = Math.round(value / range.step) * range.step;
  return Number(clamp(stepped, range.min, range.max).toFixed(4));
}

function readChoice<T extends string>(
  source: UnknownRecord,
  key: string,
  options: readonly T[],
  fallback: T,
): T {
  const value = source[key];
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Lleva datos de versiones anteriores al formato actual. La versión 0 (sin campo `version`)
 * es cualquier dato previo al esquema: se conserva lo que tenga nombre y tipo válidos.
 */
export function migrateSettings(source: UnknownRecord): UnknownRecord {
  const version = typeof source['version'] === 'number' ? source['version'] : 0;
  const migrated: UnknownRecord = { ...source };
  if (version < 1) {
    // Nombre antiguo del silencio, si existiera.
    if (typeof migrated['mute'] === 'boolean' && migrated['muted'] === undefined)
      migrated['muted'] = migrated['mute'];
  }
  migrated['version'] = SETTINGS_VERSION;
  return migrated;
}

/** Valida campo por campo. Lo ausente o inválido toma el valor por defecto; lo desconocido se descarta. */
export function validateSettings(source: unknown, prefersReducedMotion: boolean): Settings {
  const defaults = defaultSettings(prefersReducedMotion);
  if (!isRecord(source)) return defaults;
  const data = migrateSettings(source);
  return {
    version: SETTINGS_VERSION,
    muted: readBoolean(data, 'muted', defaults.muted),
    reduceFlashing: readBoolean(data, 'reduceFlashing', defaults.reduceFlashing),
    reduceMotion: readBoolean(data, 'reduceMotion', defaults.reduceMotion),
    sensitivity: readNumber(data, 'sensitivity', SENSITIVITY_RANGE),
    invertY: readBoolean(data, 'invertY', defaults.invertY),
    fov: readNumber(data, 'fov', FOV_RANGE),
    quality: readChoice(data, 'quality', QUALITY_LEVELS, defaults.quality),
    damageTaken: readChoice(data, 'damageTaken', DAMAGE_TAKEN_LEVELS, defaults.damageTaken),
    textSize: readChoice(data, 'textSize', TEXT_SIZES, defaults.textSize),
  };
}

/** Lee los ajustes desde el texto guardado. Nunca lanza: si está corrupto, devuelve los valores por defecto. */
export function parseSettings(raw: string | null, prefersReducedMotion: boolean): Settings {
  if (raw === null || raw.length === 0 || raw.length > SETTINGS_MAX_RAW_LENGTH) {
    return defaultSettings(prefersReducedMotion);
  }
  try {
    return validateSettings(JSON.parse(raw) as unknown, prefersReducedMotion);
  } catch {
    return defaultSettings(prefersReducedMotion);
  }
}

export function serializeSettings(settings: Settings): string {
  return JSON.stringify(settings);
}
