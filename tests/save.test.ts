import { describe, expect, it } from 'vitest';
import { HEALTH_BALANCE } from '../src/data/balance';
import { ITEM_BALANCE } from '../src/data/items';
import { createProgress, maxQuarters, type Progress } from '../src/game/progress';
import {
  migrateSave,
  parseSave,
  SAVE_MIGRATIONS,
  SAVE_VERSION,
  serializeSave,
  validateSave,
  type SaveMigrations,
} from '../src/game/save';

function fullProgress(): Progress {
  return {
    ...createProgress('ciro'),
    place: { zone: 'bosque', entry: 'claro' },
    respawn: { zone: 'bosque', entry: 'entrada' },
    quarters: 7,
    sparks: 321,
    temple: 3,
    fragments: 5,
    potions: 2,
    keys: ['llave-claro'],
    specials: ['talisman'],
    abilities: ['pulso'],
    chests: ['lumbre-huerto', 'bosque-raiz'],
    puzzles: ['bosque-bloque'],
    gates: ['lumbre-portal', 'bosque-puerta'],
    flags: ['introSeen', 'bladeTaken'],
  };
}

describe('guardar y cargar', () => {
  it('lo guardado se carga igual', () => {
    const progress = fullProgress();
    expect(parseSave(serializeSave(progress))).toEqual(progress);
  });

  it('el texto lleva la versión y ningún dato ajeno al juego', () => {
    const data = JSON.parse(serializeSave(createProgress('alba'))) as Record<string, unknown>;
    expect(data['version']).toBe(SAVE_VERSION);
    expect(Object.keys(data).sort()).toEqual(
      [
        'abilities',
        'bosses',
        'character',
        'chests',
        'flags',
        'fragments',
        'gates',
        'keys',
        'place',
        'potions',
        'puzzles',
        'quarters',
        'respawn',
        'sparks',
        'specials',
        'temple',
        'version',
      ].sort(),
    );
  });
});

describe('guardado corrupto', () => {
  it('lo que no se puede leer devuelve null, sin lanzar', () => {
    for (const text of [
      null,
      '',
      '{',
      'null',
      '[]',
      '123',
      '"hola"',
      '{}',
      '{"version":1}',
      'x'.repeat(70000),
    ]) {
      expect(parseSave(text)).toBeNull();
    }
  });

  it('sin personaje válido no hay partida', () => {
    expect(parseSave(JSON.stringify({ version: 1, character: 'otro' }))).toBeNull();
  });

  it('los números fuera de rango se corrigen', () => {
    const p = parseSave(
      JSON.stringify({
        version: 1,
        character: 'alba',
        sparks: 1e12,
        temple: 99,
        potions: -3,
        fragments: 'muchos',
        quarters: 9999,
      }),
    );
    expect(p?.sparks).toBe(ITEM_BALANCE.maxSparks);
    expect(p?.temple).toBe(ITEM_BALANCE.temple.maxLevel);
    expect(p?.potions).toBe(0);
    expect(p?.fragments).toBe(0);
    expect(p?.quarters).toBe(HEALTH_BALANCE.startHearts * HEALTH_BALANCE.quartersPerHeart);
  });

  it('no se carga con vida cero: se volvería a caer', () => {
    const p = parseSave(JSON.stringify({ version: 1, character: 'alba', quarters: 0 }));
    expect(p?.quarters).toBe(1);
  });

  it('valores que no son números (NaN, Infinity, texto) toman el valor inicial', () => {
    const p = validateSave({
      character: 'alba',
      sparks: Number.NaN,
      temple: Number.POSITIVE_INFINITY,
      potions: '3',
    });
    expect(p?.sparks).toBe(0);
    expect(p?.temple).toBe(ITEM_BALANCE.temple.minLevel);
    expect(p?.potions).toBe(0);
  });

  it('los identificadores que no existen en los datos se descartan, y los repetidos se quitan', () => {
    const p = parseSave(
      JSON.stringify({
        version: 1,
        character: 'alba',
        chests: ['lumbre-huerto', 'lumbre-huerto', 'inventado', 7, null],
        puzzles: ['<script>', 'bosque-bloque'],
        gates: 'no-es-lista',
        keys: ['otra', 'llave-claro'],
        specials: [{}],
        abilities: ['volar'],
        flags: ['bladeTaken', 'hackeado'],
      }),
    );
    expect(p?.chests).toEqual(['lumbre-huerto']);
    expect(p?.puzzles).toEqual(['bosque-bloque']);
    expect(p?.gates).toEqual([]);
    expect(p?.keys).toEqual(['llave-claro']);
    expect(p?.specials).toEqual([]);
    expect(p?.abilities).toEqual([]);
    expect(p?.flags).toEqual(['bladeTaken']);
  });

  it('un lugar que no existe vuelve al inicio; la arena de prueba no se puede guardar', () => {
    const start = createProgress('alba');
    for (const place of [
      { zone: 'marte', entry: 'start' },
      { zone: 'bosque', entry: 'nada' },
      { zone: 'arena', entry: 'start' },
      { zone: 'bosque', entry: 'constructor' },
      { zone: 'constructor', entry: 'start' },
      'lumbre',
      null,
    ]) {
      const p = parseSave(JSON.stringify({ version: 1, character: 'alba', place, respawn: place }));
      expect(p?.place, JSON.stringify(place)).toEqual(start.place);
      expect(p?.respawn, JSON.stringify(place)).toEqual(start.respawn);
    }
  });

  it('la vida máxima se recalcula con los fragmentos del propio guardado', () => {
    const p = parseSave(JSON.stringify({ version: 1, character: 'alba', fragments: 8, quarters: 999 }));
    expect(p?.quarters).toBe(maxQuarters({ fragments: 8 }));
  });

  it('los campos desconocidos no pasan al progreso', () => {
    const p = parseSave(JSON.stringify({ version: 1, character: 'alba', trampa: 1, __proto__x: 2 }));
    expect(p && 'trampa' in p).toBe(false);
  });
});

describe('versiones y migración', () => {
  it('rechaza versiones futuras o inválidas', () => {
    for (const version of [SAVE_VERSION + 1, 0, -1, 1.5, '1', null, undefined]) {
      expect(parseSave(JSON.stringify({ version, character: 'alba' }))).toBeNull();
    }
  });

  it('un guardado viejo pasa por las migraciones hasta la versión actual', () => {
    // Formato hipotético anterior: se simula añadiendo una versión menor con su paso.
    const migrations: SaveMigrations = {
      ...SAVE_MIGRATIONS,
      0: (save) => ({ ...save, sparks: save['chispas'] }),
    };
    const migrated = migrateSaveFromZero({ version: 0, character: 'alba', chispas: 77 }, migrations);
    expect(migrated?.['version']).toBe(SAVE_VERSION);
    expect(migrated?.['sparks']).toBe(77);
  });

  it('una partida de la versión 1 se conserva y empieza sin habilidades ni jefes', () => {
    const old = {
      version: 1,
      character: 'ciro',
      sparks: 120,
      temple: 3,
      chests: ['bosque-raiz', 'bosque-claro'],
      gates: ['lumbre-portal', 'bosque-claro'],
      puzzles: ['bosque-bloque'],
      flags: ['introSeen', 'bladeTaken'],
      place: { zone: 'bosque', entry: 'claro' },
    };
    const p = parseSave(JSON.stringify(old));
    expect(p).toMatchObject({
      character: 'ciro',
      sparks: 120,
      temple: 3,
      chests: ['bosque-raiz', 'bosque-claro'],
      gates: ['lumbre-portal', 'bosque-claro'],
      puzzles: ['bosque-bloque'],
      place: { zone: 'bosque', entry: 'claro' },
      abilities: [],
      bosses: [],
    });
  });

  it('una partida de la versión 1 con datos que no existían los descarta', () => {
    const p = parseSave(
      JSON.stringify({ version: 1, character: 'alba', abilities: ['pulso'], bosses: ['guardian'] }),
    );
    expect(p?.abilities).toEqual([]);
    expect(p?.bosses).toEqual([]);
  });

  it('guarda y recupera las habilidades, los jefes y las zonas nuevas', () => {
    const p = createProgress('alba');
    p.abilities.push('pulso', 'impulso');
    p.bosses.push('guardian');
    p.chests.push('cueva-tesoro');
    p.gates.push('cueva-cristal');
    p.puzzles.push('cienaga-antorchas');
    p.place = { zone: 'cueva', entry: 'medio' };
    p.respawn = { zone: 'cueva', entry: 'medio' };
    expect(parseSave(serializeSave(p))).toEqual(p);
  });

  it('guarda y recupera la Fortaleza, el Regente y el final de la aventura', () => {
    const p = createProgress('ciro');
    p.bosses.push('guardian', 'regente');
    p.flags.push('gameCompleted');
    p.place = { zone: 'fortaleza', entry: 'galeria' };
    p.respawn = { zone: 'fortaleza', entry: 'galeria' };
    p.puzzles.push('fortaleza-bloques', 'fortaleza-braseros');
    p.gates.push('fortaleza-trono');
    p.chests.push('fortaleza-patio');
    expect(parseSave(serializeSave(p))).toEqual(p);
  });

  it('una partida guardada antes de existir la Fortaleza sigue siendo válida y pierde la marca retirada', () => {
    const old = serializeSave(createProgress('alba'));
    const raw = { ...(JSON.parse(old) as Record<string, unknown>), flags: ['introSeen', 'fortressOpen'] };
    expect(parseSave(JSON.stringify(raw))?.flags).toEqual(['introSeen']);
  });

  it('un guardado corrupto de la versión actual no da habilidades ni jefes inventados', () => {
    const raw = { version: SAVE_VERSION, character: 'alba', abilities: ['vuelo', 5], bosses: ['otro', null] };
    const p = parseSave(JSON.stringify(raw));
    expect(p?.abilities).toEqual([]);
    expect(p?.bosses).toEqual([]);
  });

  it('sin el paso de migración necesario devuelve null', () => {
    expect(migrateSaveFromZero({ version: 0, character: 'alba' }, {})).toBeNull();
  });

  it('el guardado de la versión actual no cambia', () => {
    const raw = { version: SAVE_VERSION, character: 'alba' };
    expect(migrateSave(raw)).toEqual(raw);
  });
});

/** La versión 0 nunca se publicó: el test usa `from` para ejercitar la cadena de migraciones. */
function migrateSaveFromZero(
  raw: Record<string, unknown>,
  migrations: SaveMigrations,
): Record<string, unknown> | null {
  return migrateSave(raw, migrations, 0);
}
