import { FORTALEZA_PALETTE } from './palettes';
import { REGENT } from './regent';
import { crack, prop, ruin } from './zoneBlocks';
import type { ZoneData } from './zones';

/** Muros que cortan la zona de este a oeste, con un hueco de 6 m para la puerta. */
const GALLERY_WALL_Z = -12;
const THRONE_WALL_Z = 15;
const THRONE_NORTH_Z = 43.2;
const ROOM_HALF_X = 16.6;

/**
 * Fortaleza del Eclipse: patio con el puzzle de bloques, galería partida por una grieta con el puzzle de los braseros,
 * y al norte la sala del trono, donde espera el Regente.
 */
export const FORTALEZA: ZoneData = {
  id: 'fortaleza',
  palette: FORTALEZA_PALETTE,
  halfX: 30,
  halfZ: 46,
  entries: {
    fromCueva: { x: 0, z: -41.5, yaw: 0 },
    patio: { x: 6, z: -35.5, yaw: 0 },
    galeria: { x: -5, z: 10.5, yaw: 0 },
  },
  bumps: [
    { x: 22, z: -28, radius: 8, height: 0.7 },
    { x: -24, z: -6, radius: 6, height: 0.5 },
  ],
  paths: [
    { ax: 0, az: -46, bx: 0, bz: 42, width: 3.4 },
    { ax: 0, az: -38, bx: -13, bz: -38, width: 2.6 },
    { ax: -8, az: 30, bx: 8, bz: 30, width: 8 },
  ],
  blocks: [
    // Muro del patio, con la puerta de la galería en el centro.
    ruin(-16.5, GALLERY_WALL_Z, 13.5, 0.6, 3.2),
    ruin(16.5, GALLERY_WALL_Z, 13.5, 0.6, 3.2),
    // La grieta de la galería: solo se cruza con el Impulso.
    crack(0, -2, 31, 1.7),
    // Bolsas de la grieta con los braseros en medio: se encienden desde la orilla.
    crack(-15, 6, 6, 3),
    crack(15, 6, 6, 3),
    // Mural de los braseros.
    prop(-4.5, 3, 0.3, 1.2, 2.2),
    // Muro de la sala del trono.
    ruin(-16.5, THRONE_WALL_Z, 13.5, 0.6, 3.6),
    ruin(16.5, THRONE_WALL_Z, 13.5, 0.6, 3.6),
    // Paredes de la sala y trono.
    ruin(-ROOM_HALF_X, 29.2, 0.6, 14, 3.6),
    ruin(ROOM_HALF_X, 29.2, 0.6, 14, 3.6),
    ruin(0, THRONE_NORTH_Z, 17.2, 0.6, 4.4),
    prop(0, 41.9, 1.4, 0.7, 3),
    // Braseros de la sala: los enciende el Pulso para romper el velo del Regente.
    ...REGENT.braziers.map((b) => prop(b.x, b.z, 0.5, 0.5, 1.4)),
  ],
  structures: [
    { kind: 'lantern', x: -2.8, z: -40, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: 2.8, z: -15, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: 2.8, z: -9, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'lantern', x: -2.8, z: 12.5, yaw: 0, w: 0.3, d: 0.3 },
    { kind: 'stones', x: 21, z: 24, yaw: 0, w: 7, d: 7 },
    { kind: 'stones', x: -22, z: 26, yaw: 0, w: 7, d: 7 },
  ],
  scatter: {
    seed: 20261113,
    innerTrees: 16,
    outerTrees: 80,
    rocks: 42,
    flowers: 0,
    mushrooms: 0,
    fireflies: 46,
    clear: [
      { x: 0, z: -40, radius: 7 },
      { x: 6, z: -37, radius: 5 },
      { x: -20, z: -31, radius: 11 },
      { x: 24, z: -40, radius: 4 },
      { x: 10, z: -28, radius: 5 },
      { x: -7, z: -21, radius: 5 },
      { x: 13, z: -20, radius: 5 },
      { x: 0, z: -7, radius: 8 },
      { x: 0, z: 8, radius: 9 },
      { x: 25, z: 11, radius: 4 },
      { x: 0, z: 29, radius: 24 },
    ],
  },
  enemies: [
    { x: 10, z: -28, spread: 2, kinds: ['brumilla', 'brumilla', 'tirador'] },
    { x: -7, z: -21, spread: 1.8, kinds: ['acechador', 'tirador'] },
    { x: 13, z: -20, spread: 1, kinds: ['coloso'] },
    { x: -14, z: -7, spread: 1, kinds: ['coloso'] },
    { x: 14, z: -7, spread: 1.8, kinds: ['acechador', 'acechador'] },
    { x: 9, z: 4, spread: 1.8, kinds: ['acechador', 'tirador', 'brumilla'] },
  ],
  chests: [
    { id: 'fortaleza-patio', x: 25, z: -40, yaw: -Math.PI / 2, contents: { kind: 'potion', amount: 2 } },
    { id: 'fortaleza-galeria', x: 26, z: 11, yaw: -Math.PI / 2, contents: { kind: 'sparks', amount: 90 } },
  ],
  beacons: [
    { id: 'fortaleza-patio', x: 6, z: -38, entry: 'patio' },
    { id: 'fortaleza-galeria', x: -5, z: 8, entry: 'galeria' },
  ],
  npcs: [],
  gates: [
    {
      id: 'fortaleza-galeria',
      x: 0,
      z: GALLERY_WALL_Z,
      width: 6,
      alongX: true,
      opens: { kind: 'puzzle', puzzle: 'fortaleza-bloques' },
    },
    {
      id: 'fortaleza-trono',
      x: 0,
      z: THRONE_WALL_Z,
      width: 6,
      alongX: true,
      opens: { kind: 'puzzle', puzzle: 'fortaleza-braseros' },
    },
  ],
  signs: [
    { id: 'fortaleza-cartel-bloques', x: -11.5, z: -34.5, text: 'fortalezaBloques' },
    { id: 'fortaleza-cartel-grieta', x: 3.6, z: -7, text: 'fortalezaGrieta' },
    { id: 'fortaleza-cartel-braseros', x: 3.6, z: 3, text: 'fortalezaBraseros' },
    { id: 'fortaleza-cartel-trono', x: 3.6, z: 12.5, text: 'fortalezaTrono' },
  ],
  exits: [{ x: 0, z: -45.4, halfX: 3.6, halfZ: 0.6, to: 'cueva', entry: 'fromFortaleza' }],
  crystals: [
    { x: -27, z: -18 },
    { x: 27, z: -14 },
    { x: -24, z: 11 },
    { x: 14, z: -36 },
    { x: -13, z: 18 },
    { x: 13, z: 18 },
    { x: -13, z: 40 },
    { x: 13, z: 40 },
  ],
  dummy: null,
  altar: null,
  shadowExtent: 26,
  shrines: [],
  boss: {
    id: 'regente',
    x: 0,
    z: 30,
    minX: -ROOM_HALF_X + 0.6,
    maxX: ROOM_HALF_X - 0.6,
    minZ: THRONE_WALL_Z + 0.6,
    maxZ: THRONE_NORTH_Z - 0.6,
  },
  // Haces de luz lejos de los caminos: con la cámara dentro de uno, la imagen se parte en dos.
  shafts: [
    { x: -14, z: -24 },
    { x: 14, z: -32 },
    { x: -12.5, z: 39 },
    { x: 12.5, z: 39 },
  ],
  rescue: { x: 0, z: 39.4 },
};
