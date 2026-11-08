/**
 * Loop de timestep fijo: la lógica avanza siempre en pasos iguales (60 Hz por defecto)
 * aunque los fotogramas lleguen a ritmo irregular. El render interpola con `alpha`.
 */
export interface FixedStepOptions {
  /** Duración de un paso de lógica, en segundos. */
  readonly stepSeconds: number;
  /** Pasos máximos por fotograma, para no entrar en espiral si el equipo va lento. */
  readonly maxStepsPerFrame: number;
  /** Tiempo máximo que se acepta de un solo fotograma (p. ej. al volver a la pestaña). */
  readonly maxFrameSeconds: number;
}

export const DEFAULT_FIXED_STEP: FixedStepOptions = {
  stepSeconds: 1 / 60,
  maxStepsPerFrame: 5,
  maxFrameSeconds: 0.25,
};

export interface FrameResult {
  /** Pasos de lógica ejecutados en este fotograma. */
  readonly steps: number;
  /** Fracción (0..1) entre el último paso y el siguiente, para interpolar el render. */
  readonly alpha: number;
}

export class FixedStepLoop {
  private accumulator = 0;

  constructor(private readonly options: FixedStepOptions = DEFAULT_FIXED_STEP) {
    if (!(options.stepSeconds > 0) || options.maxStepsPerFrame < 1) {
      throw new Error('Opciones de timestep inválidas');
    }
  }

  get stepSeconds(): number {
    return this.options.stepSeconds;
  }

  /**
   * Avanza el reloj `frameSeconds` y llama a `step` tantas veces como pasos completos quepan.
   * Valores negativos o no finitos se tratan como 0.
   */
  advance(frameSeconds: number, step: (dt: number) => void): FrameResult {
    const { stepSeconds, maxStepsPerFrame, maxFrameSeconds } = this.options;
    const safeFrame = Number.isFinite(frameSeconds)
      ? Math.min(Math.max(frameSeconds, 0), maxFrameSeconds)
      : 0;
    this.accumulator += safeFrame;

    let steps = 0;
    while (this.accumulator >= stepSeconds && steps < maxStepsPerFrame) {
      step(stepSeconds);
      this.accumulator -= stepSeconds;
      steps++;
    }
    // Si se alcanzó el tope, se descarta el retraso sobrante en vez de acumularlo.
    if (steps === maxStepsPerFrame && this.accumulator >= stepSeconds) {
      this.accumulator = this.accumulator % stepSeconds;
    }
    return { steps, alpha: this.accumulator / stepSeconds };
  }

  /** Olvida el tiempo acumulado (al pausar o reanudar). */
  reset(): void {
    this.accumulator = 0;
  }
}
