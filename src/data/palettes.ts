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
