import type { ZoneId } from './zones';

/** Cómo suena una zona. La música se genera nota a nota con una semilla: siempre parecida, nunca idéntica. */
export interface MusicTrack {
  /** Nota base (número MIDI). */
  readonly root: number;
  /** Escala, en semitonos desde la base. */
  readonly scale: readonly number[];
  /** Pulsos por minuto. */
  readonly tempo: number;
  /** Acordes del fondo: grados de la escala, uno por compás. */
  readonly chords: readonly number[];
  /** Probabilidad de que suene una nota en cada pulso de la melodía. */
  readonly density: number;
  /** Volumen del fondo y de la melodía. */
  readonly padVolume: number;
  readonly melodyVolume: number;
}

const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];

export const ZONE_MUSIC: Readonly<Record<ZoneId, MusicTrack>> = {
  lumbre: {
    root: 57,
    scale: MAJOR_PENTATONIC,
    tempo: 72,
    chords: [0, 3, 1, 4],
    density: 0.4,
    padVolume: 0.05,
    melodyVolume: 0.07,
  },
  bosque: {
    root: 62,
    scale: MAJOR_PENTATONIC,
    tempo: 84,
    chords: [0, 2, 4, 3],
    density: 0.5,
    padVolume: 0.045,
    melodyVolume: 0.07,
  },
  cienaga: {
    root: 52,
    scale: MINOR_PENTATONIC,
    tempo: 58,
    chords: [0, 3, 0, 2],
    density: 0.28,
    padVolume: 0.06,
    melodyVolume: 0.06,
  },
  cueva: {
    root: 50,
    scale: NATURAL_MINOR,
    tempo: 52,
    chords: [0, 5, 3, 4],
    density: 0.22,
    padVolume: 0.06,
    melodyVolume: 0.065,
  },
  fortaleza: {
    root: 48,
    scale: NATURAL_MINOR,
    tempo: 60,
    chords: [0, 5, 4, 3],
    density: 0.26,
    padVolume: 0.065,
    melodyVolume: 0.06,
  },
  arena: {
    root: 55,
    scale: MINOR_PENTATONIC,
    tempo: 96,
    chords: [0, 3, 2, 1],
    density: 0.45,
    padVolume: 0.045,
    melodyVolume: 0.06,
  },
};

/** La lucha contra el Guardián: más rápida, grave y con pulso marcado. */
export const BOSS_MUSIC: MusicTrack = {
  root: 45,
  scale: NATURAL_MINOR,
  tempo: 112,
  chords: [0, 0, 5, 4],
  density: 0.6,
  padVolume: 0.07,
  melodyVolume: 0.075,
};

/** La lucha contra el Regente: más grave y más lenta que la del Guardián, con más peso. */
export const FINAL_BOSS_MUSIC: MusicTrack = {
  root: 43,
  scale: NATURAL_MINOR,
  tempo: 100,
  chords: [0, 5, 3, 4],
  density: 0.55,
  padVolume: 0.075,
  melodyVolume: 0.08,
};

/** Pulsos por compás y compases entre cambios de frase. */
export const BEATS_PER_BAR = 4;
/** Volumen máximo de la música: siempre por debajo de los efectos, sin picos. */
export const MUSIC_VOLUME = 0.7;
/** Segundos del fundido al cambiar de zona o al activar y desactivar la música. */
export const MUSIC_FADE = 1.6;
