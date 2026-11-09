/** Paletas de color por zona. Colores en hexadecimal (#rrggbb). */
export interface ZonePalette {
  readonly skyTop: string;
  readonly skyHorizon: string;
  readonly fog: string;
  readonly fogDensity: number;
  readonly sun: string;
  readonly sunIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly hemiIntensity: number;
  readonly ground: string;
  readonly groundFar: string;
  readonly path: string;
  readonly wall: string;
  readonly trunk: string;
  readonly foliage: readonly string[];
  readonly rock: string;
  readonly crystal: string;
  readonly outline: string;
  /** Color de las grietas o del agua honda. */
  readonly crack?: string;
  /** Color de las motas que flotan en el aire. */
  readonly motes?: string;
  /** Color de los muros de piedra; sin él, la piedra gris de siempre. */
  readonly stone?: string;
}

/** Lumbre: aldea cálida y segura al atardecer. */
export const LUMBRE_PALETTE: ZonePalette = {
  skyTop: '#4f7fcf',
  skyHorizon: '#f7c99b',
  fog: '#e9c7a6',
  fogDensity: 0.009,
  sun: '#fff0d4',
  sunIntensity: 1.0,
  hemiSky: '#cfe0ff',
  hemiGround: '#6e5a48',
  hemiIntensity: 0.5,
  ground: '#6fae4f',
  groundFar: '#6aa64e',
  path: '#dcbc8c',
  wall: '#bcae9a',
  trunk: '#7a4b33',
  foliage: ['#4f9e4a', '#76c25a', '#e59a48'],
  rock: '#9c968f',
  crystal: '#9fe8ff',
  outline: '#1d1626',
};

/** Lumbre la noche del ataque: luna fría, niebla de ceniza y ventanas encendidas. */
export const LUMBRE_NIGHT_PALETTE: ZonePalette = {
  skyTop: '#0b0c24',
  skyHorizon: '#3a2a4a',
  fog: '#2c2238',
  fogDensity: 0.022,
  sun: '#9fb4ff',
  sunIntensity: 0.55,
  hemiSky: '#5a5f96',
  hemiGround: '#241a2c',
  hemiIntensity: 0.42,
  ground: '#3d5a48',
  groundFar: '#34503f',
  path: '#7b6a68',
  wall: '#6f6878',
  trunk: '#3f2c2c',
  foliage: ['#28503f', '#2f5e48', '#5b4a3a'],
  rock: '#5c5a68',
  crystal: '#7fb8ff',
  outline: '#120e1c',
};

/** Bosque de Luciérnagas: verdes vivos, copas de colores y luz filtrada. */
export const BOSQUE_PALETTE: ZonePalette = {
  skyTop: '#1f6f8f',
  skyHorizon: '#bfe8b4',
  fog: '#9fd4a6',
  fogDensity: 0.014,
  sun: '#fff6c8',
  sunIntensity: 0.95,
  hemiSky: '#c8f0dc',
  hemiGround: '#35573c',
  hemiIntensity: 0.55,
  ground: '#4f9a52',
  groundFar: '#47904d',
  path: '#b89a68',
  wall: '#8f9a84',
  trunk: '#5b3d2e',
  foliage: ['#2f9e6a', '#57c26a', '#d4c84a', '#3fb2a0'],
  rock: '#7f8c80',
  crystal: '#c9ff8f',
  outline: '#14201c',
};

/** Ciénaga de Ecos: ruinas hundidas, neblina verdiazul y agua quieta. */
export const CIENAGA_PALETTE: ZonePalette = {
  skyTop: '#10282e',
  skyHorizon: '#4f8a84',
  fog: '#4d7f7a',
  fogDensity: 0.03,
  sun: '#bfe8d8',
  sunIntensity: 0.6,
  hemiSky: '#8fc8c0',
  hemiGround: '#1c3431',
  hemiIntensity: 0.6,
  ground: '#3f6b52',
  groundFar: '#375f4a',
  path: '#7f7a5c',
  wall: '#6f8378',
  trunk: '#33302a',
  foliage: ['#2f6b5c', '#3e8068', '#5b7f4a', '#245a5a'],
  rock: '#5f7270',
  crystal: '#8affe0',
  outline: '#0c1c1c',
  crack: '#143d44',
  motes: '#b8ffd8',
  stone: '#67786f',
};

/** Cueva de Prisma: oscuridad violeta y cristales que dan la luz. */
export const CUEVA_PALETTE: ZonePalette = {
  skyTop: '#070512',
  skyHorizon: '#2a1a52',
  fog: '#22163f',
  fogDensity: 0.028,
  sun: '#b9a8ff',
  sunIntensity: 0.55,
  hemiSky: '#a9a4e6',
  hemiGround: '#1a1030',
  hemiIntensity: 0.56,
  ground: '#40355c',
  groundFar: '#382e52',
  path: '#5f5484',
  wall: '#544a78',
  trunk: '#2a2240',
  foliage: ['#6a4fd0', '#3f7fe0', '#9a5fe0', '#3fb4d8'],
  rock: '#4e4670',
  crystal: '#c49aff',
  outline: '#0a0618',
  crack: '#07040f',
  motes: '#a8c8ff',
  stone: '#4e4570',
};
