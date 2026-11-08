import { describe, expect, it } from 'vitest';
import { FrameLimiter, frameTarget, refreshDivisor } from '../src/core/frameLimiter';

/** Simula `refreshes` refrescos a `hz` y devuelve cuántos dibujó en la segunda mitad, ya con la medida hecha. */
function drawnPerSecond(hz: number, target: number): number {
  const limiter = new FrameLimiter();
  const seconds = 4;
  const refreshes = hz * seconds;
  let drawn = 0;
  for (let i = 0; i < refreshes; i++) {
    const draws = limiter.tick((i * 1000) / hz, target);
    if (i >= refreshes / 2 && draws) drawn++;
  }
  return drawn / (seconds / 2);
}

describe('refreshDivisor', () => {
  it('con objetivo 60 no provoca saltos irregulares en ninguna pantalla común', () => {
    expect(refreshDivisor(60, 60)).toBe(1);
    expect(refreshDivisor(75, 60)).toBe(1);
    expect(refreshDivisor(90, 60)).toBe(1);
    expect(refreshDivisor(120, 60)).toBe(2);
    expect(refreshDivisor(144, 60)).toBe(2);
    expect(refreshDivisor(240, 60)).toBe(4);
  });

  it('con objetivo 30 reduce también las pantallas de 60 y 75 Hz', () => {
    expect(refreshDivisor(60, 30)).toBe(2);
    expect(refreshDivisor(75, 30)).toBe(2);
    expect(refreshDivisor(144, 30)).toBe(4);
  });

  it('tolera frecuencias algo por debajo de lo nominal', () => {
    expect(refreshDivisor(59.94, 60)).toBe(1);
    expect(refreshDivisor(119.88, 60)).toBe(2);
  });

  it('nunca baja de 1, ni con datos inválidos', () => {
    expect(refreshDivisor(30, 60)).toBe(1);
    expect(refreshDivisor(0, 60)).toBe(1);
    expect(refreshDivisor(Number.NaN, 60)).toBe(1);
    expect(refreshDivisor(144, 0)).toBe(1);
    expect(refreshDivisor(144, Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('frameTarget', () => {
  it('jugando usa el objetivo del ajuste; sin límite no limita', () => {
    expect(frameTarget(60, true, 30)).toBe(60);
    expect(frameTarget(null, true, 30)).toBe(Number.POSITIVE_INFINITY);
  });

  it('fuera de la partida nunca supera el objetivo de reposo', () => {
    expect(frameTarget(60, false, 30)).toBe(30);
    expect(frameTarget(null, false, 30)).toBe(30);
    expect(frameTarget(20, false, 30)).toBe(20);
  });
});

describe('FrameLimiter', () => {
  it('dibuja todo hasta tener la medida de la pantalla', () => {
    const limiter = new FrameLimiter();
    expect(limiter.refreshHz).toBeNull();
    for (let i = 0; i < 20; i++) expect(limiter.tick(i * 7, 30)).toBe(true);
    expect(limiter.refreshHz).toBeNull();
  });

  it('mide la frecuencia de la pantalla', () => {
    const limiter = new FrameLimiter();
    for (let i = 0; i < 100; i++) limiter.tick((i * 1000) / 144, 60);
    expect(limiter.refreshHz).toBeCloseTo(144, 0);
  });

  it('produce el ritmo esperado en cada pantalla', () => {
    expect(drawnPerSecond(60, 60)).toBeCloseTo(60, 0);
    expect(drawnPerSecond(75, 60)).toBeCloseTo(75, 0);
    expect(drawnPerSecond(144, 60)).toBeCloseTo(72, 0);
    expect(drawnPerSecond(144, 30)).toBeCloseTo(36, 0);
    expect(drawnPerSecond(144, Number.POSITIVE_INFINITY)).toBeCloseTo(144, 0);
  });

  it('las imágenes quedan a intervalos iguales', () => {
    const limiter = new FrameLimiter();
    const drawnAt: number[] = [];
    for (let i = 0; i < 300; i++) if (limiter.tick((i * 1000) / 144, 60)) drawnAt.push(i);
    const late = drawnAt.slice(-20);
    for (let i = 1; i < late.length; i++) expect((late[i] ?? 0) - (late[i - 1] ?? 0)).toBe(2);
  });

  it('un fotograma lento suelto no altera la medida', () => {
    const limiter = new FrameLimiter();
    let now = 0;
    for (let i = 0; i < 200; i++) {
      now += i % 40 === 0 ? 50 : 1000 / 144;
      limiter.tick(now, 60);
    }
    expect(limiter.refreshHz).toBeCloseTo(144, 0);
  });

  it('ignora el tiempo con la pestaña oculta y detecta el cambio de monitor', () => {
    const limiter = new FrameLimiter();
    let now = 0;
    for (let i = 0; i < 100; i++) limiter.tick((now += 1000 / 144), 60);
    limiter.tick((now += 60000), 60);
    expect(limiter.refreshHz).toBeCloseTo(144, 0);
    for (let i = 0; i < 100; i++) limiter.tick((now += 1000 / 75), 60);
    expect(limiter.refreshHz).toBeCloseTo(75, 0);
  });

  it('ignora tiempos que retroceden o se repiten', () => {
    const limiter = new FrameLimiter();
    expect(limiter.tick(100, 60)).toBe(true);
    expect(limiter.tick(100, 60)).toBe(true);
    expect(limiter.tick(50, 60)).toBe(true);
    expect(limiter.refreshHz).toBeNull();
  });
});
