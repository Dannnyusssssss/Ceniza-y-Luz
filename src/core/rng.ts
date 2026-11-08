/**
 * Generador pseudoaleatorio con semilla (mulberry32). Misma semilla, misma secuencia:
 * así las pruebas y el comportamiento se pueden reproducir.
 */
export interface Rng {
  /** Número en [0, 1). */
  next(): number;
  /** Entero en [min, max], ambos incluidos. */
  int(min: number, max: number): number;
  /** Número en [min, max). */
  range(min: number, max: number): number;
  /** Elemento al azar de una lista no vacía. */
  pick<T>(items: readonly T[]): T;
  /** Estado interno, para guardar y continuar la secuencia. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let state = Math.trunc(Number.isFinite(seed) ? seed : 0) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() con una lista vacía');
      return items[Math.floor(next() * items.length)] as T;
    },
    get state() {
      return state;
    },
  };
}
