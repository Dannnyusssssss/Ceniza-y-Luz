/** Utilidades matemáticas puras (sin el motor gráfico). */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lleva un ángulo al intervalo (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let a = angle % TAU;
  if (a <= -Math.PI) a += TAU;
  else if (a > Math.PI) a -= TAU;
  return a;
}

/** Interpola ángulos por el camino más corto. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Acerca `current` a `target` como mucho `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target);
  return Math.max(current - maxDelta, target);
}

/**
 * Suavizado exponencial independiente de los fotogramas.
 * `rate` es cuántas veces por segundo se reduce la distancia a 1/e.
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Vector 2D mutable para el plano del suelo (x, z). */
export interface Vec2 {
  x: number;
  z: number;
}

export function length2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}
