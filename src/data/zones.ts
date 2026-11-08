import { ARENA, type BlockData, type Point2 } from './arena';
import type { EnemyKind } from './enemies';
import type { AbilityId, ChestContents, KeyId } from './items';
import { BOSQUE_PALETTE, LUMBRE_PALETTE, type ZonePalette } from './palettes';

/** Las zonas construidas; la Ciénaga, la Cueva y la Fortaleza se añaden en sus hitos. */
export type ZoneId = 'lumbre' | 'bosque' | 'arena';

/** Marcas de historia que se guardan. */
export type StoryFlag = 'introSeen' | 'bladeTaken' | 'metIlse';
export const STORY_FLAGS: readonly StoryFlag[] = ['introSeen', 'bladeTaken', 'metIlse'];

export interface Placement extends Point2 {
  readonly yaw: number;
}

/** Elevación suave del terreno. */
export interface TerrainBump extends Point2 {
  readonly radius: number;
  readonly height: number;
}

export interface PathSegment {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly width: number;
}

export interface ClearArea extends Point2 {
  readonly radius: number;
}

/** Decoración repartida con semilla, así siempre sale igual. */
export interface ZoneScatter {
  readonly seed: number;
  /** Árboles dentro de la zona (con colisión) y fuera de ella (solo paisaje). */
  readonly innerTrees: number;
  readonly outerTrees: number;
  readonly rocks: number;
  readonly flowers: number;
  /** Setas que brillan y luciérnagas (el bosque). */
  readonly mushrooms: number;
  readonly fireflies: number;
  /** Zonas donde no se pone nada. */
  readonly clear: readonly ClearArea[];
}

export type StructureKind = 'house' | 'stall' | 'sanctuary' | 'well' | 'lantern' | 'barrier' | 'stones';

/** Construcción hecha por código. `w` y `d` son el ancho (x) y el fondo (z); los bloques sólidos van aparte. */
export interface StructureData extends Placement {
  readonly kind: StructureKind;
  readonly w: number;
  readonly d: number;
  /** Elige el color de los tejados y paredes. */
  readonly variant?: number;
}

export interface EnemyGroup extends Point2 {
  readonly kinds: readonly EnemyKind[];
  readonly spread: number;
}

export interface ChestData extends Placement {
  readonly id: string;
  readonly contents: ChestContents;
}

export interface BeaconData extends Point2 {
  readonly id: string;
  /** Punto de llegada al reaparecer aquí. */
  readonly entry: string;
}

export type NpcId = 'ilse' | 'oren' | 'teo';

export interface NpcData extends Placement {
  readonly id: NpcId;
}

/** Qué abre una puerta. */
export type GateKey =
  | { readonly kind: 'key'; readonly key: KeyId }
  | { readonly kind: 'puzzle'; readonly puzzle: string }
  | { readonly kind: 'flag'; readonly flag: StoryFlag }
  | { readonly kind: 'ability'; readonly ability: AbilityId };

/** Puerta: un bloque que deja de ser sólido al abrirse. `alongX` indica si cierra de este a oeste. */
export interface GateData extends Point2 {
  readonly id: string;
  readonly width: number;
  readonly alongX: boolean;
  readonly opens: GateKey;
}

export type SignTextId = 'portal' | 'bloques' | 'simbolos' | 'bruma' | 'bosqueEntrada' | 'claro' | 'muneco';

/** Cartel que se puede leer. `text` es la clave en `TEXTS.signs`. */
export interface SignData extends Point2 {
  readonly id: string;
  readonly text: SignTextId;
}

/** Salida: al entrar en el rectángulo se pasa a otra zona. */
export interface ExitData extends Point2 {
  readonly halfX: number;
  readonly halfZ: number;
  readonly to: ZoneId;
  readonly entry: string;
}

export interface ZoneData {
  readonly id: ZoneId;
  readonly palette: ZonePalette;
  readonly halfX: number;
  readonly halfZ: number;
  /** Puntos de llegada, por nombre. */
  readonly entries: Readonly<Record<string, Placement>>;
  readonly bumps: readonly TerrainBump[];
  readonly paths: readonly PathSegment[];
  readonly blocks: readonly BlockData[];
  readonly structures: readonly StructureData[];
  readonly scatter: ZoneScatter;
  readonly enemies: readonly EnemyGroup[];
  readonly chests: readonly ChestData[];
  readonly beacons: readonly BeaconData[];
  readonly npcs: readonly NpcData[];
  readonly gates: readonly GateData[];
  readonly signs: readonly SignData[];
  readonly exits: readonly ExitData[];
  /** Puntos con cristales de luz. */
  readonly crystals: readonly Point2[];
  /** Muñeco de práctica. */
  readonly dummy: Point2 | null;
  /** Altar con la Hoja de Luz. */
  readonly altar: Point2 | null;
  /** Medio lado del área con sombras alrededor del jugador. */
  readonly shadowExtent: number;
}

function ruin(x: number, z: number, halfX: number, halfZ: number, height = 1.8): BlockData {
  return { x, z, halfX, halfZ, height, kind: 'ruin' };
}

function prop(x: number, z: number, halfX: number, halfZ: number, height = 2): BlockData {
  return { x, z, halfX, halfZ, height, kind: 'prop' };
}

const LUMBRE: ZoneData = {
  id: 'lumbre',
  palette: LUMBRE_PALETTE,
  halfX: 28,
  halfZ: 26,
  entries: {
    start: { x: 0, z: -16, yaw: 0 },
    fromBosque: { x: 0, z: 21.5, yaw: Math.PI },
    plaza: { x: 0, z: -4.5, yaw: 0 },
  },
  bumps: [
    { x: -23, z: 19, radius: 7, height: 0.8 },
    { x: 20, z: -18, radius: 9, height: 0.9 },
    { x: -22, z: -18, radius: 8, height: 0.6 },
  ],
  paths: [
    { ax: 0, az: -24, bx: 0, bz: 26, width: 3.4 },
    { ax: 0, az: 3, bx: -14, bz: 9, width: 2.8 },
    { ax: 0, az: -1, bx: 13, bz: 5, width: 2.8 },
    { ax: -7, az: 0, bx: 7, bz: 0, width: 6 },
  ],
  blocks: [
    // Empalizada norte con el portal en el centro.
    { x: -15.2, z: 25, halfX: 12.8, halfZ: 0.4, height: 1.8, kind: 'wall' },
    { x: 15.2, z: 25, halfX: 12.8, halfZ: 0.4, height: 1.8, kind: 'wall' },
    // Casas.
    prop(-17, -12, 4, 3, 3),
    prop(17, -13, 4, 3, 3),
    prop(-20, 0, 3, 4, 3),
    prop(21, 11, 3, 4, 3),
    prop(-11, -23, 4, 2.5, 3),
    // Puesto del mercader.
    prop(13, 8.4, 2.4, 0.8, 1.4),
    // Pilares y altar del santuario.
    prop(-18.5, 11, 0.4, 0.4, 3.6),
    prop(-9.5, 11, 0.4, 0.4, 3.6),
    prop(-18.5, 20, 0.4, 0.4, 3.6),
    prop(-9.5, 20, 0.4, 0.4, 3.6),
    prop(-14, 16, 1, 1, 1.1),
    // Pozo.
    prop(7, -7, 0.9, 0.9, 1.1),
  ],
  structures: [
    { kind: 'house', x: -17, z: -12, yaw: 0, w: 8, d: 6, variant: 0 },
    { kind: 'house', x: 17, z: -13, yaw: 0, w: 8, d: 6, variant: 1 },
    { kind: 'house', x: -20, z: 0, yaw: 0, w: 6, d: 8, variant: 2 },
    { kind: 'house', x: 21, z: 11, yaw: 0, w: 6, d: 8, variant: 0 },
    { kind: 'house', x: -11, z: -23, yaw: 0, w: 8, d: 5, variant: 1 },
    { kind: 'stall', x: 13, z: 8.4, yaw: 0, w: 4.8, d: 1.6 },
    { kind: 'sanctuary', x: -14, z: 15.5, yaw: 0, w: 10, d: 10 },
    { kind: 'well', x: 7, z: -7, yaw: 0, w: 1.8, d: 1.8 },
    { kind: 'lantern', x: -3, z: 12, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: 3, z: 12, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: -3, z: -13, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: 3, z: -13, yaw: 0, w: 0.3, d: 0.3 },
  ],
  scatter: {
    seed: 20261108,
    innerTrees: 10,
    outerTrees: 90,
    rocks: 26,
    flowers: 90,
    mushrooms: 0,
    fireflies: 0,
    clear: [
      { x: -14, z: 15.5, radius: 9 },
      { x: 0, z: 0, radius: 9 },
      { x: 13, z: 6, radius: 5 },
      { x: -3, z: 14, radius: 5 },
      { x: 24, z: -21, radius: 3 },
      { x: 0, z: -16, radius: 5 },
    ],
  },
  enemies: [],
  chests: [
    { id: 'lumbre-huerto', x: 24, z: -21, yaw: -Math.PI / 2, contents: { kind: 'sparks', amount: 25 } },
  ],
  beacons: [{ id: 'lumbre-plaza', x: 0, z: -1, entry: 'plaza' }],
  npcs: [
    { id: 'ilse', x: -9.5, z: 7, yaw: -2.2 },
    { id: 'teo', x: -4, z: -11, yaw: 0.8 },
    { id: 'oren', x: 13, z: 6.6, yaw: Math.PI },
  ],
  gates: [
    {
      id: 'lumbre-portal',
      x: 0,
      z: 25,
      width: 4.8,
      alongX: true,
      opens: { kind: 'flag', flag: 'bladeTaken' },
    },
  ],
  signs: [
    { id: 'lumbre-cartel-portal', x: 3.6, z: 23, text: 'portal' },
    { id: 'lumbre-cartel-muneco', x: -5.5, z: 11.5, text: 'muneco' },
  ],
  exits: [{ x: 0, z: 25.6, halfX: 2.4, halfZ: 0.5, to: 'bosque', entry: 'fromLumbre' }],
  crystals: [
    { x: -19.5, z: 21 },
    { x: -8.5, z: 21 },
  ],
  dummy: { x: -3, z: 14 },
  altar: { x: -14, z: 16 },
  shadowExtent: 26,
};

/** Muro antiguo que parte el bosque en dos, con la puerta del puzzle de bloques en el centro. */
const WALL_Z = 10;
const ALCOVE = { x: -29, z: -14, halfX: 5, halfZ: 6 };
const CLEARING = { x: -28, z: 30, halfX: 6, halfZ: 6 };

const BOSQUE: ZoneData = {
  id: 'bosque',
  palette: BOSQUE_PALETTE,
  halfX: 36,
  halfZ: 40,
  entries: {
    fromLumbre: { x: 0, z: -35.5, yaw: 0 },
    entrada: { x: 5, z: -29.5, yaw: 0 },
    claro: { x: 4, z: 16.5, yaw: 0 },
  },
  bumps: [
    { x: -14, z: -30, radius: 10, height: 0.9 },
    { x: 24, z: -24, radius: 10, height: 1.1 },
    { x: -14, z: 22, radius: 9, height: 0.8 },
    { x: 22, z: 28, radius: 10, height: 1.2 },
  ],
  paths: [
    { ax: 0, az: -40, bx: 2, bz: -22, width: 3.2 },
    { ax: 2, az: -22, bx: 0, bz: 10, width: 3.2 },
    { ax: 0, az: 10, bx: 3, bz: 24, width: 3.2 },
    { ax: 3, az: 24, bx: 0, bz: 40, width: 3.2 },
    { ax: 1, az: -14, bx: -20, bz: -14, width: 2.4 },
    { ax: 2, az: 20, bx: -21, bz: 30, width: 2.4 },
    { ax: 3, az: 24, bx: 25, bz: 32, width: 2.4 },
    { ax: 2, az: -18, bx: 22, bz: -18, width: 2.4 },
  ],
  blocks: [
    // Muro antiguo con un hueco para la puerta.
    ruin(-20, WALL_Z, 16.8, 0.6),
    ruin(20, WALL_Z, 16.8, 0.6),
    // Barrera de Bruma al norte: el camino a la Ciénaga aún no se abre.
    { x: 0, z: 39, halfX: 4, halfZ: 0.6, height: 4, kind: 'bound' },
    // Alcoba de los símbolos: tres muros y una puerta al este.
    ruin(ALCOVE.x, ALCOVE.z - ALCOVE.halfZ, ALCOVE.halfX, 0.5),
    ruin(ALCOVE.x, ALCOVE.z + ALCOVE.halfZ, ALCOVE.halfX, 0.5),
    ruin(ALCOVE.x - ALCOVE.halfX, ALCOVE.z, 0.5, ALCOVE.halfZ),
    ruin(ALCOVE.x + ALCOVE.halfX, ALCOVE.z - 4, 0.5, 2.5),
    ruin(ALCOVE.x + ALCOVE.halfX, ALCOVE.z + 4, 0.5, 2.5),
    // Claro interior: se abre con la llave.
    ruin(CLEARING.x, CLEARING.z - CLEARING.halfZ, CLEARING.halfX, 0.5),
    ruin(CLEARING.x, CLEARING.z + CLEARING.halfZ, CLEARING.halfX, 0.5),
    ruin(CLEARING.x - CLEARING.halfX, CLEARING.z, 0.5, CLEARING.halfZ),
    ruin(CLEARING.x + CLEARING.halfX, CLEARING.z - 4, 0.5, 2.5),
    ruin(CLEARING.x + CLEARING.halfX, CLEARING.z + 4, 0.5, 2.5),
    // Mural de los símbolos.
    prop(-21.5, -9.6, 0.3, 1.2, 2.2),
  ],
  structures: [
    { kind: 'barrier', x: 0, z: 39, yaw: 0, w: 8, d: 1.2 },
    { kind: 'lantern', x: -2.6, z: -30, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: 3, z: 8, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'stones', x: ALCOVE.x, z: ALCOVE.z, yaw: 0, w: 6, d: 6 },
    { kind: 'stones', x: CLEARING.x, z: CLEARING.z, yaw: 0, w: 7, d: 7 },
  ],
  scatter: {
    seed: 20261109,
    innerTrees: 95,
    outerTrees: 110,
    rocks: 34,
    flowers: 70,
    mushrooms: 46,
    fireflies: 70,
    clear: [
      { x: 0, z: -34, radius: 6 },
      { x: 5, z: -32, radius: 5 },
      { x: -10, z: -32, radius: 4 },
      { x: -8, z: -20, radius: 6 },
      { x: -16, z: -14, radius: 10 },
      { x: 12, z: 0, radius: 11.5 },
      { x: 20, z: -16, radius: 7 },
      { x: -9, z: 2, radius: 7 },
      { x: 2, z: 16, radius: 6 },
      { x: -10, z: 23, radius: 6 },
      { x: 14, z: 27, radius: 6 },
      { x: 26, z: 33, radius: 4 },
      { x: -28, z: 16, radius: 4 },
      { x: 0, z: 35, radius: 6 },
    ],
  },
  enemies: [
    { x: -7, z: -19, spread: 1.6, kinds: ['brumilla', 'brumilla'] },
    { x: 20, z: -14, spread: 2, kinds: ['brumilla', 'brumilla', 'brumilla'] },
    { x: -9, z: 2, spread: 2, kinds: ['brumilla', 'brumilla', 'tirador'] },
    { x: -10, z: 23, spread: 2, kinds: ['acechador', 'brumilla', 'brumilla'] },
    { x: 14, z: 27, spread: 2.2, kinds: ['brumilla', 'brumilla', 'brumilla', 'tirador'] },
  ],
  chests: [
    { id: 'bosque-raiz', x: -10, z: -32, yaw: 0.7, contents: { kind: 'sparks', amount: 20 } },
    { id: 'bosque-alcoba', x: -30, z: -14, yaw: Math.PI / 2, contents: { kind: 'temple' } },
    { id: 'bosque-loma', x: 24, z: -19, yaw: -Math.PI / 2, contents: { kind: 'potion', amount: 2 } },
    { id: 'bosque-musgo', x: -28, z: 16, yaw: Math.PI / 2, contents: { kind: 'sparks', amount: 40 } },
    { id: 'bosque-llave', x: 26, z: 33, yaw: -2.4, contents: { kind: 'key', key: 'llave-claro' } },
    { id: 'bosque-claro', x: -30, z: 30, yaw: Math.PI / 2, contents: { kind: 'fragment' } },
  ],
  beacons: [
    { id: 'bosque-entrada', x: 5, z: -32, entry: 'entrada' },
    { id: 'bosque-claro', x: 4, z: 14, entry: 'claro' },
  ],
  npcs: [],
  gates: [
    {
      id: 'bosque-puerta',
      x: 0,
      z: WALL_Z,
      width: 6.4,
      alongX: true,
      opens: { kind: 'puzzle', puzzle: 'bosque-bloque' },
    },
    {
      id: 'bosque-alcoba',
      x: ALCOVE.x + ALCOVE.halfX,
      z: ALCOVE.z,
      width: 3,
      alongX: false,
      opens: { kind: 'puzzle', puzzle: 'bosque-simbolos' },
    },
    {
      id: 'bosque-claro',
      x: CLEARING.x + CLEARING.halfX,
      z: CLEARING.z,
      width: 3,
      alongX: false,
      opens: { kind: 'key', key: 'llave-claro' },
    },
  ],
  signs: [
    { id: 'bosque-cartel-entrada', x: -3.2, z: -33, text: 'bosqueEntrada' },
    { id: 'bosque-cartel-simbolos', x: -21.5, z: -12, text: 'simbolos' },
    { id: 'bosque-cartel-bloques', x: 4.6, z: 4.6, text: 'bloques' },
    { id: 'bosque-cartel-claro', x: -20.4, z: 27.4, text: 'claro' },
    { id: 'bosque-bruma', x: 3.6, z: 37.2, text: 'bruma' },
  ],
  exits: [{ x: 0, z: -39.4, halfX: 3.6, halfZ: 0.6, to: 'lumbre', entry: 'fromBosque' }],
  crystals: [
    { x: -30, z: -18 },
    { x: -30, z: 34 },
    { x: 30, z: 34 },
  ],
  dummy: null,
  altar: null,
  shadowExtent: 26,
};

/** La arena de oleadas (modo de prueba de balance): mismos muros, sin mundo alrededor. */
const ARENA_ZONE: ZoneData = {
  id: 'arena',
  palette: LUMBRE_PALETTE,
  halfX: ARENA.halfSize,
  halfZ: ARENA.halfSize,
  entries: { start: { x: ARENA.playerSpawn.x, z: ARENA.playerSpawn.z, yaw: ARENA.playerSpawnYaw } },
  bumps: [],
  paths: [{ ax: -ARENA.decoration.pathRadius, az: 0, bx: ARENA.decoration.pathRadius, bz: 0, width: 12 }],
  blocks: ARENA.blocks,
  structures: [],
  scatter: {
    seed: ARENA.decoration.seed,
    innerTrees: 0,
    outerTrees: ARENA.decoration.treeRing.count,
    rocks: ARENA.decoration.rockRing.count,
    flowers: 0,
    mushrooms: 0,
    fireflies: 0,
    clear: [],
  },
  enemies: [],
  chests: [],
  beacons: [],
  npcs: [],
  gates: [],
  signs: [],
  exits: [],
  crystals: ARENA.decoration.crystals,
  dummy: ARENA.dummy,
  altar: null,
  shadowExtent: ARENA.halfSize + 4,
};

export const ZONES: Readonly<Record<ZoneId, ZoneData>> = {
  lumbre: LUMBRE,
  bosque: BOSQUE,
  arena: ARENA_ZONE,
};

/** Zonas de la aventura (las que se pueden guardar). */
export const STORY_ZONES: readonly ZoneId[] = ['lumbre', 'bosque'];

export const FIRST_ZONE: ZoneId = 'lumbre';
export const FIRST_ENTRY = 'start';
export const FIRST_BEACON = { zone: FIRST_ZONE, entry: 'plaza' } as const;
