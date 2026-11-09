import { describe, expect, it } from 'vitest';
import { RedrawGate } from '../src/core/redrawGate';
import { STATIC_REDRAW_FRAMES as N } from '../src/data/quality';

function countDraws(gate: RedrawGate, isStatic: boolean, frames: number): number {
  let draws = 0;
  for (let i = 0; i < frames; i++) if (gate.shouldDraw(isStatic)) draws++;
  return draws;
}

describe('RedrawGate', () => {
  it('siempre dibuja mientras se juega', () => {
    const gate = new RedrawGate();
    expect(countDraws(gate, false, N * 3)).toBe(N * 3);
  });

  it('al quedarse quieta dibuja unos fotogramas y luego para', () => {
    const gate = new RedrawGate();
    gate.shouldDraw(false);
    expect(countDraws(gate, true, N * 3)).toBe(N);
    expect(gate.shouldDraw(true)).toBe(false);
  });

  it('un cambio en pausa vuelve a dibujar y luego para otra vez', () => {
    const gate = new RedrawGate();
    countDraws(gate, true, N * 2);
    gate.invalidate();
    expect(countDraws(gate, true, N * 3)).toBe(N);
  });

  it('cada pausa nueva vuelve a dibujar sus fotogramas', () => {
    const gate = new RedrawGate();
    countDraws(gate, true, N * 2);
    gate.shouldDraw(false);
    expect(countDraws(gate, true, N * 2)).toBe(N);
  });

  it('un cambio mientras se juega no deja dibujos de más para la pausa', () => {
    const gate = new RedrawGate();
    gate.invalidate();
    gate.shouldDraw(false);
    expect(countDraws(gate, true, N * 2)).toBe(N);
  });
});
