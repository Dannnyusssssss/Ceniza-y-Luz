import { isCharacterId } from '../data/characters';
import { ABILITY_IDS, ITEM_BALANCE, KEY_IDS, SPECIAL_IDS } from '../data/items';
import { PUZZLES } from '../data/puzzles';
import {
  BOSS_IDS,
  FIRST_ENTRY,
  FIRST_ZONE,
  STORY_FLAGS,
  STORY_ZONES,
  ZONES,
  type ZoneId,
} from '../data/zones';
import { createProgress, maxQuarters, type Place, type Progress } from './progress';

/** Versión actual del formato guardado. Cambiarlo exige una migración. */
export const SAVE_VERSION = 2;
/** Un guardado más largo que esto no es nuestro: no se intenta leer. */
const MAX_SAVE_LENGTH = 64 * 1024;

type RawSave = Record<string, unknown>;

/** Migraciones: cada una pasa de la versión `n` a la `n + 1`. */
export type SaveMigrations = Readonly<Record<number, (save: RawSave) => RawSave>>;
export const SAVE_MIGRATIONS: SaveMigrations = {
  // La versión 2 añade la Ciénaga, la Cueva, las habilidades y los jefes: una partida antigua no tiene ninguno.
  1: (save) => ({ ...save, abilities: [], bosses: [] }),
};

export function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), min), max);
}

/** Lista de identificadores: solo los que existen en los datos del juego, sin repetir. */
function idList<T extends string>(value: unknown, valid: readonly T[]): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    if (typeof item === 'string' && (valid as readonly string[]).includes(item) && !out.includes(item as T)) {
      out.push(item as T);
    }
  }
  return out;
}

function allChestIds(): string[] {
  return STORY_ZONES.flatMap((z) => ZONES[z].chests.map((c) => c.id));
}

function allGateIds(): string[] {
  return STORY_ZONES.flatMap((z) => ZONES[z].gates.map((g) => g.id));
}

/** Un lugar solo es válido si la zona es de la aventura y el punto de llegada existe. */
function parsePlace(value: unknown): Place | null {
  if (!isRecord(value)) return null;
  const { zone, entry } = value;
  if (typeof zone !== 'string' || !(STORY_ZONES as readonly string[]).includes(zone)) return null;
  if (typeof entry !== 'string' || !Object.hasOwn(ZONES[zone as ZoneId].entries, entry)) return null;
  return { zone: zone as ZoneId, entry };
}

/** Valida campo por campo: lo que falta o no sirve toma su valor inicial. */
export function validateSave(raw: RawSave): Progress | null {
  // Sin personaje no se sabe a quién se juega: la partida no se puede continuar.
  if (!isCharacterId(raw['character'])) return null;
  const base = createProgress(raw['character']);
  const temple = ITEM_BALANCE.temple;
  const fragments = intInRange(raw['fragments'], 0, 99, 0);
  const max = maxQuarters({ fragments });
  const place = parsePlace(raw['place']) ?? { zone: FIRST_ZONE, entry: FIRST_ENTRY };
  return {
    ...base,
    place,
    respawn: parsePlace(raw['respawn']) ?? base.respawn,
    fragments,
    // Con vida cero se volvería a caer al cargar: mínimo un cuarto.
    quarters: intInRange(raw['quarters'], 1, max, max),
    sparks: intInRange(raw['sparks'], 0, ITEM_BALANCE.maxSparks, 0),
    temple: intInRange(raw['temple'], temple.minLevel, temple.maxLevel, temple.minLevel),
    potions: intInRange(raw['potions'], 0, ITEM_BALANCE.potion.maxCarried, 0),
    keys: idList(raw['keys'], KEY_IDS),
    specials: idList(raw['specials'], SPECIAL_IDS),
    abilities: idList(raw['abilities'], ABILITY_IDS),
    chests: idList(raw['chests'], allChestIds()),
    puzzles: idList(
      raw['puzzles'],
      PUZZLES.map((p) => p.id),
    ),
    gates: idList(raw['gates'], allGateIds()),
    bosses: idList(raw['bosses'], BOSS_IDS),
    flags: idList(raw['flags'], STORY_FLAGS),
  };
}

/** Pasa un guardado viejo a la versión actual. Devuelve null si no hay camino (guardado más nuevo o roto). */
export function migrateSave(
  raw: RawSave,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
  oldestVersion = 1,
): RawSave | null {
  let save = raw;
  let version = save['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < oldestVersion) return null;
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) return null;
    save = step(save);
    version += 1;
    save = { ...save, version };
  }
  return version === SAVE_VERSION ? save : null;
}

/** Lee un guardado. Cualquier cosa corrupta o desconocida devuelve null: el juego sigue sin partida. */
export function parseSave(
  text: string | null,
  migrations: SaveMigrations = SAVE_MIGRATIONS,
): Progress | null {
  if (text === null || text.length > MAX_SAVE_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const migrated = migrateSave(parsed, migrations);
  return migrated ? validateSave(migrated) : null;
}

/** Convierte el progreso a texto, sin datos personales. */
export function serializeSave(progress: Progress): string {
  return JSON.stringify({ version: SAVE_VERSION, ...progress });
}
