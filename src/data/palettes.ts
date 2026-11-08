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
