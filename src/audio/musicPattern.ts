import type { Rng } from '../core/rng';
import { BEATS_PER_BAR, type MusicTrack } from '../data/music';

/** Una nota programada: en qué pulso del compás empieza, cuánto dura y cómo de fuerte suena. */
export interface MusicNote {
  readonly beat: number;
  readonly midi: number;
  readonly beats: number;
  /** Fracción del volumen de la melodía o del fondo (0 a 1). */
  readonly level: number;
  readonly voice: 'pad' | 'melody';
}

/** Frecuencia en Hz de una nota MIDI. */
export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** La nota de un grado de la escala; los grados que se salen suben o bajan de octava. */
export function degreeToMidi(track: MusicTrack, degree: number, octave = 0): number {
  const n = track.scale.length;
  const wrapped = ((degree % n) + n) % n;
  const octaves = Math.floor(degree / n) + octave;
  return track.root + (track.scale[wrapped] ?? 0) + octaves * 12;
}

/** Duración de un pulso en segundos. */
export function beatSeconds(track: MusicTrack): number {
  return 60 / track.tempo;
}

/**
 * Las notas de un compás: un acorde de fondo y una melodía que camina por la escala, siempre a pasos cortos para
 * que no dé saltos bruscos. Devuelve también el grado en que queda, para el compás siguiente.
 */
export function composeBar(
  track: MusicTrack,
  bar: number,
  rng: Rng,
  lastDegree: number,
): { readonly notes: MusicNote[]; readonly degree: number } {
  const notes: MusicNote[] = [];
  const chord = track.chords[bar % track.chords.length] ?? 0;
  for (const [i, step] of [0, 2, 4].entries()) {
    notes.push({
      beat: 0,
      midi: degreeToMidi(track, chord + step, -1),
      beats: BEATS_PER_BAR,
      level: i === 0 ? 1 : 0.7,
      voice: 'pad',
    });
  }
  let degree = lastDegree;
  for (let beat = 0; beat < BEATS_PER_BAR; beat++) {
    if (rng.next() > track.density) continue;
    degree += rng.int(-2, 2);
    // Se mantiene en la zona media: ni muy grave ni estridente.
    const max = track.scale.length * 2;
    degree = Math.min(Math.max(degree, 0), max);
    // Empezar el compás en una nota del acorde da sensación de armonía sin tener que calcularla.
    if (beat === 0 && rng.next() < 0.5) degree = chord + track.scale.length;
    notes.push({
      beat,
      midi: degreeToMidi(track, degree),
      beats: rng.next() < 0.3 ? 2 : 1,
      level: beat === 0 ? 1 : 0.8,
      voice: 'melody',
    });
  }
  return { notes, degree };
}
