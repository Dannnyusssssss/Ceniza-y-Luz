import { describe, expect, it } from 'vitest';
import { QUALITY_PRESETS, ZONE_BUDGET } from '../src/data/quality';
import { LUMBRE_PALETTE } from '../src/data/palettes';
import { ARENA } from '../src/data/arena';
import { QUALITY_LEVELS } from '../src/data/settings';

const HEX = /^#[0-9a-f]{6}$/i;

describe('calidad', () => {
  it('hay un preset por nivel, con valores coherentes', () => {
    for (const level of QUALITY_LEVELS) {
      const q = QUALITY_PRESETS[level];
      expect(q.hardwareScaling).toBeGreaterThanOrEqual(1);
      expect(Math.log2(q.shadowMapSize) % 1).toBe(0);
      expect([1, 2, 4, 8]).toContain(q.msaaSamples);
    }
  });

  it('Baja no usa bloom y reduce la resolución; la calidad crece de Baja a Alta', () => {
    expect(QUALITY_PRESETS.low.bloom).toBe(false);
    expect(QUALITY_PRESETS.low.hardwareScaling).toBeGreaterThan(1);
    expect(QUALITY_PRESETS.medium.bloom).toBe(true);
    expect(QUALITY_PRESETS.high.shadowMapSize).toBeGreaterThanOrEqual(QUALITY_PRESETS.medium.shadowMapSize);
    expect(QUALITY_PRESETS.medium.shadowMapSize).toBeGreaterThanOrEqual(QUALITY_PRESETS.low.shadowMapSize);
  });

  it('el presupuesto de zona es el acordado', () => {
    expect(ZONE_BUDGET).toEqual({ maxLights: 4, maxShadowGenerators: 1, maxDrawCalls: 150 });
  });
});

describe('paleta de Lumbre', () => {
  it('todos los colores son hexadecimales válidos', () => {
    for (const [key, value] of Object.entries(LUMBRE_PALETTE)) {
      const values = Array.isArray(value) ? value : [value];
      for (const v of values) {
        if (typeof v === 'string') expect(v, key).toMatch(HEX);
      }
    }
    expect(LUMBRE_PALETTE.foliage.length).toBeGreaterThan(0);
  });
});

describe('arena', () => {
  it('los bloques tienen tamaño positivo y quedan dentro de la arena', () => {
    for (const b of ARENA.blocks) {
      expect(b.halfX).toBeGreaterThan(0);
      expect(b.halfZ).toBeGreaterThan(0);
      expect(b.height).toBeGreaterThan(0);
      expect(Math.abs(b.x)).toBeLessThanOrEqual(ARENA.halfSize + 1);
      expect(Math.abs(b.z)).toBeLessThanOrEqual(ARENA.halfSize + 1);
    }
  });

  it('el punto de inicio y el muñeco no están dentro de un bloque', () => {
    for (const p of [ARENA.playerSpawn, ARENA.dummy]) {
      for (const b of ARENA.blocks) {
        const inside = Math.abs(p.x - b.x) < b.halfX + 0.6 && Math.abs(p.z - b.z) < b.halfZ + 0.6;
        expect(inside).toBe(false);
      }
    }
  });
});
