import { describe, expect, it } from 'vitest';
import { beatSeconds, composeBar, degreeToMidi, midiToHz } from '../src/audio/musicPattern';
import { createRng } from '../src/core/rng';
import { BEATS_PER_BAR, BOSS_MUSIC, MUSIC_VOLUME, ZONE_MUSIC } from '../src/data/music';
import { ZONES, type ZoneId } from '../src/data/zones';

const tracks = [...Object.values(ZONE_MUSIC), BOSS_MUSIC];

describe('notas', () => {
  it('convierte notas a frecuencia', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
    expect(midiToHz(57)).toBeCloseTo(220);
  });

  it('los grados que se salen de la escala suben o bajan de octava', () => {
    const t = ZONE_MUSIC.lumbre;
    expect(degreeToMidi(t, 0)).toBe(t.root);
    expect(degreeToMidi(t, t.scale.length)).toBe(t.root + 12);
    expect(degreeToMidi(t, -1)).toBe(t.root + (t.scale[t.scale.length - 1] ?? 0) - 12);
    expect(degreeToMidi(t, 0, -1)).toBe(t.root - 12);
  });

  it('el pulso depende del tempo', () => {
    expect(beatSeconds({ ...ZONE_MUSIC.lumbre, tempo: 60 })).toBe(1);
  });
});

describe('composición', () => {
  it('cada zona tiene su música, y son distintas', () => {
    for (const id of Object.keys(ZONES) as ZoneId[]) expect(ZONE_MUSIC[id]).toBeDefined();
    const prints = Object.values(ZONE_MUSIC).map((t) => `${t.root}/${t.tempo}/${t.scale.join()}`);
    expect(new Set(prints).size).toBe(prints.length);
  });

  it('un compás lleva su acorde de fondo y queda dentro del compás', () => {
    for (const track of tracks) {
      const { notes } = composeBar(track, 0, createRng(1), 3);
      expect(notes.filter((n) => n.voice === 'pad')).toHaveLength(3);
      for (const n of notes) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(BEATS_PER_BAR);
        expect(n.level).toBeGreaterThan(0);
        expect(n.level).toBeLessThanOrEqual(1);
      }
    }
  });

  it('la melodía siempre usa notas de la escala y se queda en la zona audible', () => {
    for (const track of tracks) {
      const rng = createRng(7);
      let degree = 3;
      for (let bar = 0; bar < 200; bar++) {
        const out = composeBar(track, bar, rng, degree);
        degree = out.degree;
        for (const n of out.notes) {
          const pc = (((n.midi - track.root) % 12) + 12) % 12;
          expect(track.scale).toContain(pc);
          expect(midiToHz(n.midi)).toBeGreaterThan(50);
          expect(midiToHz(n.midi)).toBeLessThan(1600);
        }
      }
    }
  });

  it('con la misma semilla sale igual; con otra, distinta', () => {
    const t = ZONE_MUSIC.bosque;
    const song = (seed: number): string => {
      const rng = createRng(seed);
      let degree = 3;
      const all: number[] = [];
      for (let bar = 0; bar < 16; bar++) {
        const out = composeBar(t, bar, rng, degree);
        degree = out.degree;
        all.push(...out.notes.map((n) => n.midi));
      }
      return all.join();
    };
    expect(song(5)).toBe(song(5));
    expect(song(5)).not.toBe(song(6));
  });

  it('el volumen nunca es alto: la música acompaña a los efectos', () => {
    expect(MUSIC_VOLUME).toBeLessThanOrEqual(1);
    for (const t of tracks) {
      expect(t.padVolume).toBeLessThanOrEqual(0.1);
      expect(t.melodyVolume).toBeLessThanOrEqual(0.1);
      expect(t.ambience.volume).toBeLessThanOrEqual(0.05);
    }
  });
});
