import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

describe('createRng', () => {
  it('la misma semilla produce la misma secuencia', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('semillas distintas producen secuencias distintas', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 5 }, () => a.next());
    const sb = Array.from({ length: 5 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('next queda en [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int incluye ambos extremos y no se sale', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('int acepta los extremos invertidos', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      const v = rng.int(5, 2);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('range queda en [min, max)', () => {
    const rng = createRng(11);
    for (let i = 0; i < 200; i++) {
      const v = rng.range(-2, 2);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(2);
    }
  });

  it('pick elige de la lista y falla con una lista vacía', () => {
    const rng = createRng(5);
    expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
    expect(() => rng.pick([])).toThrow();
  });

  it('el estado permite continuar la secuencia', () => {
    const a = createRng(42);
    a.next();
    a.next();
    const b = createRng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it('una semilla no finita no rompe el generador', () => {
    const rng = createRng(Number.NaN);
    expect(Number.isFinite(rng.next())).toBe(true);
  });
});
