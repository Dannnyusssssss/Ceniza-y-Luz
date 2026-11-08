import { FEEDBACK_BALANCE } from '../data/balance';

/**
 * Limita los destellos de golpe a como mucho `maxPerSecond` en cualquier segundo
 * (seguridad para personas fotosensibles: nunca más de 3 por segundo).
 */
export class FlashLimiter {
  private readonly times: number[] = [];

  constructor(private readonly maxPerSecond: number = FEEDBACK_BALANCE.maxFlashesPerSecond) {
    if (maxPerSecond > 3) throw new Error('El máximo seguro es 3 destellos por segundo');
  }

  /** Devuelve true si se permite un destello en el instante `now` (segundos) y lo registra. */
  tryFlash(now: number): boolean {
    while (this.times.length > 0 && now - (this.times[0] ?? 0) >= 1) this.times.shift();
    if (this.times.length >= this.maxPerSecond) return false;
    const last = this.times[this.times.length - 1];
    // Además, separación mínima entre destellos para que no se junten.
    if (last !== undefined && now - last < 1 / this.maxPerSecond) return false;
    this.times.push(now);
    return true;
  }

  /** Destellos registrados en el último segundo antes de `now`. */
  countInLastSecond(now: number): number {
    return this.times.filter((t) => now - t < 1).length;
  }
}

/** Intensidad del destello en [0, 1]: sube de golpe y baja suave (nunca un apagado y encendido bruscos). */
export function flashIntensity(elapsed: number, duration: number = FEEDBACK_BALANCE.flashDuration): number {
  if (elapsed < 0 || elapsed >= duration) return 0;
  const t = elapsed / duration;
  return (1 - t) * (1 - t);
}

/**
 * Desplazamiento de la sacudida de cámara: oscila y se apaga en `duration`.
 * Devuelve 0 si `enabled` es false ("Reducir movimiento").
 */
export function shakeOffset(
  elapsed: number,
  enabled: boolean,
  duration: number = FEEDBACK_BALANCE.shakeDuration,
  strength: number = FEEDBACK_BALANCE.shakeStrength,
): { x: number; y: number } {
  if (!enabled || elapsed < 0 || elapsed >= duration) return { x: 0, y: 0 };
  const decay = 1 - elapsed / duration;
  const amp = strength * decay * decay;
  return { x: Math.sin(elapsed * 90) * amp, y: Math.cos(elapsed * 73) * amp * 0.6 };
}
