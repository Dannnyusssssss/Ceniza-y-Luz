import { describe, expect, it } from 'vitest';
import { FixedStepLoop } from '../src/core/loop';

const STEP = 1 / 60;

describe('FixedStepLoop', () => {
  it('ejecuta un paso por cada 1/60 s acumulado', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    const r = loop.advance(STEP * 3, () => steps++);
    expect(steps).toBe(3);
    expect(r.steps).toBe(3);
    expect(r.alpha).toBeCloseTo(0, 5);
  });

  it('acumula fotogramas cortos y devuelve alpha para interpolar', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    expect(loop.advance(STEP / 2, () => steps++).alpha).toBeCloseTo(0.5, 5);
    expect(steps).toBe(0);
    loop.advance(STEP / 2, () => steps++);
    expect(steps).toBe(1);
  });

  it('pasa siempre el mismo dt a la lógica, sea cual sea el fotograma', () => {
    const loop = new FixedStepLoop();
    const dts: number[] = [];
    for (const frame of [0.007, 0.033, 0.016, 0.05]) loop.advance(frame, (dt) => dts.push(dt));
    expect(dts.every((dt) => dt === STEP)).toBe(true);
  });

  it('el mismo tiempo total da los mismos pasos con fotogramas distintos (determinismo)', () => {
    const a = new FixedStepLoop();
    const b = new FixedStepLoop();
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < 60; i++) a.advance(1 / 60, () => sa++);
    for (let i = 0; i < 30; i++) b.advance(1 / 30, () => sb++);
    expect(Math.abs(sa - sb)).toBeLessThanOrEqual(1);
    expect(sa).toBeGreaterThanOrEqual(59);
  });

  it('limita los pasos por fotograma y descarta el retraso sobrante', () => {
    const loop = new FixedStepLoop({ stepSeconds: STEP, maxStepsPerFrame: 5, maxFrameSeconds: 10 });
    let steps = 0;
    const r = loop.advance(1, () => steps++);
    expect(steps).toBe(5);
    expect(r.alpha).toBeLessThan(1);
    steps = 0;
    loop.advance(0, () => steps++);
    expect(steps).toBe(0);
  });

  it('recorta fotogramas enormes (volver a la pestaña)', () => {
    const loop = new FixedStepLoop({ stepSeconds: STEP, maxStepsPerFrame: 100, maxFrameSeconds: 0.25 });
    let steps = 0;
    loop.advance(30, () => steps++);
    expect(steps).toBe(15);
  });

  it('ignora tiempos negativos o no finitos', () => {
    const loop = new FixedStepLoop();
    let steps = 0;
    loop.advance(-1, () => steps++);
    loop.advance(Number.NaN, () => steps++);
    loop.advance(Number.POSITIVE_INFINITY, () => steps++);
    expect(steps).toBe(0);
  });

  it('reset olvida el tiempo acumulado', () => {
    const loop = new FixedStepLoop();
    loop.advance(STEP * 0.9, () => undefined);
    loop.reset();
    let steps = 0;
    loop.advance(STEP * 0.5, () => steps++);
    expect(steps).toBe(0);
  });

  it('rechaza opciones inválidas', () => {
    expect(() => new FixedStepLoop({ stepSeconds: 0, maxStepsPerFrame: 5, maxFrameSeconds: 1 })).toThrow();
  });
});
