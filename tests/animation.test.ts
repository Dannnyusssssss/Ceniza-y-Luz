import { describe, expect, it } from 'vitest';
import { COMBO_BALANCE, DODGE_BALANCE, PLAYER_BALANCE } from '../src/data/balance';
import { CHARACTER_IDS } from '../src/data/characters';
import { MODELS } from '../src/data/generated/models';
import {
  ACTION_FADE_SECONDS,
  ATTACK_CLIPS,
  CLIP_FPS,
  ClipMixer,
  type ClipSample,
  type ClipTable,
} from '../src/render/clipMix';

/** Fotogramas enteros que cubren una duración (igual que el script de Blender). */
const framesFor = (seconds: number): number => Math.ceil(seconds * CLIP_FPS - 1e-6);

const TABLE: ClipTable = {
  idle: { frames: 120, seconds: 2 },
  walk: { frames: 60, seconds: 1 },
  run: { frames: 38, seconds: 38 / 60 },
  dodge: { frames: 26, seconds: 26 / 60 },
  attack1: { frames: 26, seconds: 26 / 60 },
  attack2: { frames: 26, seconds: 26 / 60 },
  attack3: { frames: 38, seconds: 38 / 60 },
};

const totalWeight = (samples: readonly ClipSample[]): number => samples.reduce((sum, s) => sum + s.weight, 0);
const weightOf = (samples: readonly ClipSample[], clip: string): number =>
  samples.find((s) => s.clip === clip)?.weight ?? 0;

describe('clips de los gemelos frente a los datos del juego', () => {
  for (const id of CHARACTER_IDS) {
    const clips = MODELS[id].clips;
    it(`${id}: tiene todos los clips`, () => {
      for (const name of ['idle', 'walk', 'run', 'dodge', ...ATTACK_CLIPS, 'hurt', 'fall']) {
        expect(Object.keys(clips)).toContain(name);
      }
    });
    it(`${id}: cada golpe dura lo mismo que en balance.ts`, () => {
      COMBO_BALANCE.steps.forEach((step, i) => {
        const clip = clips[ATTACK_CLIPS[i] as keyof typeof clips];
        expect(clip.frames).toBe(framesFor(step.duration));
        // La ventana de daño cae dentro del clip.
        expect(step.hitTo * CLIP_FPS).toBeLessThanOrEqual(clip.frames);
      });
    });
    it(`${id}: la voltereta dura lo mismo que la esquiva`, () => {
      expect(clips.dodge.frames).toBe(framesFor(DODGE_BALANCE.duration));
    });
    it(`${id}: tiene la mano que sujeta la Hoja y los huesos que se balancean`, () => {
      expect(MODELS[id].bones).toEqual(
        expect.arrayContaining(['hand.R', 'hair.1', 'hair.2', 'cape', 'scarf']),
      );
    });
  }
});

describe('ClipMixer', () => {
  it('quieto: solo reposo', () => {
    const samples = new ClipMixer(TABLE).update({ speed: 0, dodge: 0, attack: null }, 1 / 60);
    expect(samples.map((s) => s.clip)).toEqual(['idle']);
    expect(totalWeight(samples)).toBeCloseTo(1);
  });

  it('a velocidad de caminar: solo caminar; corriendo: solo correr', () => {
    const mixer = new ClipMixer(TABLE);
    expect(
      weightOf(mixer.update({ speed: PLAYER_BALANCE.walkSpeed, dodge: 0, attack: null }, 0.016), 'walk'),
    ).toBeCloseTo(1);
    expect(
      weightOf(mixer.update({ speed: PLAYER_BALANCE.runSpeed, dodge: 0, attack: null }, 0.016), 'run'),
    ).toBeCloseTo(1);
  });

  it('entre caminar y correr: mezcla con el paso sincronizado y pesos que suman 1', () => {
    const mixer = new ClipMixer(TABLE);
    const speed = (PLAYER_BALANCE.walkSpeed + PLAYER_BALANCE.runSpeed) / 2;
    let samples: ClipSample[] = [];
    for (let i = 0; i < 20; i++) samples = mixer.update({ speed, dodge: 0, attack: null }, 1 / 60);
    expect(totalWeight(samples)).toBeCloseTo(1);
    const walk = samples.find((s) => s.clip === 'walk')?.frame ?? Number.NaN;
    const run = samples.find((s) => s.clip === 'run')?.frame ?? Number.NaN;
    // Misma fase del ciclo en los dos clips.
    expect(walk / 60).toBeCloseTo(run / 38);
  });

  it('un golpe se muestra en el fotograma que marca la lógica, con peso 1', () => {
    const mixer = new ClipMixer(TABLE);
    const samples = mixer.update({ speed: 3, dodge: 0, attack: { step: 1, time: 0.2 } }, 0.016);
    expect(samples).toEqual([{ clip: 'attack2', frame: 0.2 * CLIP_FPS, weight: 1 }]);
  });

  it('la voltereta sigue el progreso de la esquiva y no se pasa del último fotograma', () => {
    const mixer = new ClipMixer(TABLE);
    expect(mixer.update({ speed: 0, dodge: 0.5, attack: null }, 0.016)[0]).toMatchObject({
      clip: 'dodge',
      frame: 0.5 * (26 / 60) * CLIP_FPS,
    });
    expect(mixer.update({ speed: 0, dodge: 2, attack: null }, 0.016)[0]?.frame).toBe(26);
  });

  it('al terminar una acción se funde con el movimiento y luego desaparece', () => {
    const mixer = new ClipMixer(TABLE);
    mixer.update({ speed: 0, dodge: 0, attack: { step: 0, time: 0.4 } }, 0.016);
    const fading = mixer.update({ speed: 0, dodge: 0, attack: null }, ACTION_FADE_SECONDS / 2);
    expect(weightOf(fading, 'attack1')).toBeCloseTo(0.5);
    expect(totalWeight(fading)).toBeCloseTo(1);
    const done = mixer.update({ speed: 0, dodge: 0, attack: null }, ACTION_FADE_SECONDS);
    expect(done.map((s) => s.clip)).toEqual(['idle']);
  });
});
