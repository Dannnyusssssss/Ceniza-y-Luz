import { clamp, lerp } from '../core/math';
import { PLAYER_BALANCE } from '../data/balance';

/** Duración de un clip exportado desde Blender (manifiesto generado por `npm run art`). */
export interface ClipInfo {
  readonly frames: number;
  readonly seconds: number;
}

export type ClipTable = Readonly<Record<string, ClipInfo>>;

/** Fotogramas por segundo de los clips. */
export const CLIP_FPS = 60;
/** Tiempo en que la última acción (golpe, voltereta) se funde con el movimiento al terminar. */
export const ACTION_FADE_SECONDS = 0.12;
/** Nombre del clip de cada golpe del combo (paso 0, 1, 2). */
export const ATTACK_CLIPS = ['attack1', 'attack2', 'attack3'] as const;

/** Lo que hace el personaje en este fotograma, según la lógica del juego. */
export interface MixInput {
  /** Velocidad horizontal (m/s). */
  readonly speed: number;
  /** Progreso de la voltereta (0 = no esquiva, hasta 1). */
  readonly dodge: number;
  /** Golpe en curso: paso del combo y segundos desde que empezó. */
  readonly attack: { readonly step: number; readonly time: number } | null;
}

/** Un clip a mostrar: en qué fotograma y con qué peso (los pesos suman 1). */
export interface ClipSample {
  readonly clip: string;
  readonly frame: number;
  readonly weight: number;
}

/**
 * Decide qué clips se ven y cómo se mezclan.
 * - Reposo, caminar y correr se mezclan según la velocidad, con el paso sincronizado entre caminar y correr.
 * - Los golpes y la voltereta se colocan en el fotograma exacto que marca la lógica (no corren por su cuenta),
 *   así la animación coincide siempre con la ventana de daño y la invulnerabilidad.
 */
export class ClipMixer {
  /** Fase del ciclo de paso (0..1), compartida por caminar y correr. */
  private phase = 0;
  private idleTime = 0;
  private lastAction: { clip: string; frame: number } | null = null;
  private fade = 0;

  constructor(private readonly clips: ClipTable) {}

  update(input: MixInput, dt: number): ClipSample[] {
    const action = this.action(input);
    const locomotion = this.locomotion(input.speed, dt);
    if (action) {
      this.lastAction = action;
      this.fade = 1;
      return [{ ...action, weight: 1 }];
    }
    if (this.lastAction && this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / ACTION_FADE_SECONDS);
      if (this.fade > 0) {
        const rest = 1 - this.fade;
        return [
          { ...this.lastAction, weight: this.fade },
          ...locomotion.map((s) => ({ ...s, weight: s.weight * rest })),
        ];
      }
    }
    return locomotion;
  }

  private action(input: MixInput): { clip: string; frame: number } | null {
    if (input.dodge > 0) return this.frameOf('dodge', clamp(input.dodge, 0, 1) * this.seconds('dodge'));
    if (input.attack) {
      const clip = ATTACK_CLIPS[input.attack.step];
      if (clip) return this.frameOf(clip, input.attack.time);
    }
    return null;
  }

  private locomotion(speed: number, dt: number): ClipSample[] {
    const { walkSpeed, runSpeed } = PLAYER_BALANCE;
    const move = clamp(speed / walkSpeed, 0, 1);
    const run = clamp((speed - walkSpeed) / (runSpeed - walkSpeed), 0, 1);
    const cycle = lerp(this.seconds('walk'), this.seconds('run'), run);
    if (move > 0 && cycle > 0) this.phase = (this.phase + dt / cycle) % 1;
    const idleSeconds = this.seconds('idle');
    this.idleTime = idleSeconds > 0 ? (this.idleTime + dt) % idleSeconds : 0;
    const samples: ClipSample[] = [
      { clip: 'idle', frame: this.idleTime * CLIP_FPS, weight: 1 - move },
      { clip: 'walk', frame: this.phase * this.frames('walk'), weight: move * (1 - run) },
      { clip: 'run', frame: this.phase * this.frames('run'), weight: move * run },
    ];
    return samples.filter((s) => s.weight > 1e-4 && this.clips[s.clip] !== undefined);
  }

  private frameOf(clip: string, seconds: number): { clip: string; frame: number } {
    return { clip, frame: clamp(seconds * CLIP_FPS, 0, this.frames(clip)) };
  }

  private frames(clip: string): number {
    return this.clips[clip]?.frames ?? 0;
  }

  private seconds(clip: string): number {
    return this.clips[clip]?.seconds ?? 0;
  }
}
