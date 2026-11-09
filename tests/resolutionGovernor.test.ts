import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from '../src/core/resolutionGovernor';
import { parseSettings, serializeSettings, defaultSettings } from '../src/core/settings';
import { DYNAMIC_RESOLUTION as D, QUALITY_PRESETS, renderScaling } from '../src/data/quality';

/** Avanza `seconds` a `fps` y devuelve la última escala pedida. */
function play(
  g: ResolutionGovernor,
  seconds: number,
  fps: number,
  scale = 1,
  limit: number | null = 60,
): number | null {
  let result: number | null = null;
  for (let t = 0; t < seconds; t += 1 / fps) result = g.update(1 / fps, scale, limit) ?? result;
  return result;
}

const SUSTAINED = D.windowSeconds * D.windowsNeeded + 1;

describe('resolución dinámica', () => {
  it('con FPS suficientes no cambia nada', () => {
    expect(play(new ResolutionGovernor(), SUSTAINED * 3, 58)).toBeNull();
  });

  it('un bajón corto tampoco', () => {
    const g = new ResolutionGovernor();
    expect(play(g, D.windowSeconds + 0.5, 30)).toBeNull();
    expect(play(g, D.windowSeconds * 2, 60)).toBeNull();
    expect(play(g, D.windowSeconds + 0.5, 30)).toBeNull();
  });

  it('por debajo del mínimo de forma sostenida baja un escalón', () => {
    expect(play(new ResolutionGovernor(), SUSTAINED, D.minFps - 10)).toBe(1 - D.step);
  });

  it('no baja de la escala mínima', () => {
    expect(play(new ResolutionGovernor(), SUSTAINED, 20, D.minScale)).toBeNull();
    expect(play(new ResolutionGovernor(), SUSTAINED, 20, D.minScale + 0.01)).toBe(D.minScale);
  });

  it('no actúa con el límite de ahorro: esos 30 FPS son a propósito', () => {
    expect(play(new ResolutionGovernor(), SUSTAINED * 2, 30, 1, 30)).toBeNull();
  });

  it('una pantalla de 50 Hz no se confunde con un equipo lento', () => {
    expect(play(new ResolutionGovernor(), SUSTAINED * 2, 49, 1, 50)).toBeNull();
    expect(play(new ResolutionGovernor(), SUSTAINED * 2, 30, 1, 50)).toBe(1 - D.step);
  });

  it('un parón suelto no cuenta', () => {
    const g = new ResolutionGovernor();
    for (let i = 0; i < 20; i++) expect(g.update(D.maxFrameSeconds + 1, 1, 60)).toBeNull();
  });

  it('reiniciar olvida lo medido', () => {
    const g = new ResolutionGovernor();
    play(g, D.windowSeconds * (D.windowsNeeded - 0.5), 20);
    g.reset();
    expect(play(g, D.windowSeconds, 20)).toBeNull();
  });
});

describe('escala de render', () => {
  it('combina la calidad con la escala dinámica, sin pasar del tope', () => {
    expect(renderScaling(QUALITY_PRESETS.medium, 1)).toBe(1);
    // El tope de alto: 1080p no cambia y 4K se dibuja a la mitad, salvo en Alta.
    expect(renderScaling(QUALITY_PRESETS.medium, 1, 1080)).toBe(1);
    expect(renderScaling(QUALITY_PRESETS.medium, 1, 720)).toBe(1);
    expect(renderScaling(QUALITY_PRESETS.medium, 1, 2160)).toBe(2);
    expect(renderScaling(QUALITY_PRESETS.medium, 1, 1440)).toBeCloseTo(4 / 3);
    expect(renderScaling(QUALITY_PRESETS.high, 1, 2160)).toBe(1);
    expect(renderScaling(QUALITY_PRESETS.low, 1, 1080)).toBe(1.5);
    expect(renderScaling(QUALITY_PRESETS.low, 1, 2160)).toBe(D.maxScaling);
    expect(renderScaling(QUALITY_PRESETS.medium, 0.8, 2160)).toBe(D.maxScaling);
    expect(renderScaling(QUALITY_PRESETS.medium, 0.8)).toBeCloseTo(1.25);
    expect(renderScaling(QUALITY_PRESETS.low, 0.6)).toBe(D.maxScaling);
  });

  it('los ajustes guardan la escala y corrigen los valores manipulados', () => {
    const defaults = defaultSettings(false);
    expect(defaults.dynamicResolution).toBe(true);
    expect(defaults.resolutionScale).toBe(1);
    const saved = { ...defaults, resolutionScale: 0.8, dynamicResolution: false };
    const back = parseSettings(serializeSettings(saved), false);
    expect(back.resolutionScale).toBe(0.8);
    expect(back.dynamicResolution).toBe(false);
    expect(parseSettings(JSON.stringify({ resolutionScale: 0.01 }), false).resolutionScale).toBe(D.minScale);
    expect(parseSettings(JSON.stringify({ resolutionScale: 9 }), false).resolutionScale).toBe(1);
    expect(parseSettings(JSON.stringify({ resolutionScale: 'x' }), false).resolutionScale).toBe(1);
  });

  it('unos ajustes antiguos sin estos campos los reciben por defecto', () => {
    const s = parseSettings(JSON.stringify({ version: 1, quality: 'high' }), false);
    expect(s.quality).toBe('high');
    expect(s.dynamicResolution).toBe(true);
  });
});
