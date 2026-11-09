import { DYNAMIC_RESOLUTION } from '../data/quality';

/**
 * Decide cuándo bajar la resolución interna: mide los FPS por tramos y solo actúa si varios tramos seguidos
 * quedan por debajo del mínimo. Nunca sube sola: así la imagen no cambia de nitidez una y otra vez.
 */
export class ResolutionGovernor {
  private elapsed = 0;
  private frames = 0;
  private slowWindows = 0;

  /** Olvida lo medido (al entrar en una pausa, cambiar de zona o tras un ajuste). */
  reset(): void {
    this.elapsed = 0;
    this.frames = 0;
    this.slowWindows = 0;
  }

  /**
   * Cuenta un fotograma. `scale` es la escala actual (1 = resolución completa) y `limit` los FPS que permite el
   * límite o la pantalla (null si no hay tope). Devuelve la escala nueva si hay que bajarla; si no, null.
   */
  update(seconds: number, scale: number, limit: number | null): number | null {
    const { minFps, windowSeconds, windowsNeeded, step, minScale, maxFrameSeconds } = DYNAMIC_RESOLUTION;
    // Un parón suelto (cambiar de pestaña, una captura) no dice nada del rendimiento de la escena.
    if (seconds > maxFrameSeconds) {
      this.reset();
      return null;
    }
    // Si el límite o la pantalla no dan para más, ir por debajo del mínimo no es culpa de la resolución.
    if (limit !== null && limit < minFps) return null;
    const floor = limit === null ? minFps : Math.min(minFps, limit * DYNAMIC_RESOLUTION.limitMargin);
    this.elapsed += seconds;
    this.frames++;
    if (this.elapsed < windowSeconds) return null;
    const fps = this.frames / this.elapsed;
    this.elapsed = 0;
    this.frames = 0;
    this.slowWindows = fps < floor ? this.slowWindows + 1 : 0;
    if (this.slowWindows < windowsNeeded) return null;
    this.slowWindows = 0;
    if (scale <= minScale) return null;
    return Number(Math.max(minScale, scale - step).toFixed(2));
  }
}
