import { describe, expect, it } from 'vitest';
import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import { TOON_PATCHES, installToonShading } from '../src/render/toonShader';

describe('cambios en el sombreador de dos tonos', () => {
  it('encuentra el código a corregir en los dos lenguajes y lo sustituye', () => {
    // Si una actualización de Babylon cambia el sombreador, este test avisa (la versión está fijada).
    const glsl = ShaderStore.ShadersStore['cellPixelShader'];
    const wgsl = ShaderStore.ShadersStoreWGSL['cellPixelShader'];
    for (const p of TOON_PATCHES.glsl) expect(glsl).toContain(p.from);
    for (const p of TOON_PATCHES.wgsl) expect(wgsl).toContain(p.from);
    expect(installToonShading()).toBe(true);
    for (const p of TOON_PATCHES.glsl) {
      expect(ShaderStore.ShadersStore['cellPixelShader']).toContain(p.to);
      // Si el texto nuevo no incluye el original, el original debe haber desaparecido.
      if (!p.to.includes(p.from)) expect(ShaderStore.ShadersStore['cellPixelShader']).not.toContain(p.from);
    }
    for (const p of TOON_PATCHES.wgsl)
      expect(ShaderStore.ShadersStoreWGSL['cellPixelShader']).toContain(p.to);
  });

  it('ya no normaliza la normal sin un mínimo (evita valores no numéricos)', () => {
    expect(ShaderStore.ShadersStore['cellPixelShader']).not.toContain('normalize(vNormalW)');
    expect(ShaderStore.ShadersStoreWGSL['cellPixelShader']).not.toContain(
      'normalize(fragmentInputs.vNormalW)',
    );
  });

  it('es idempotente', () => {
    expect(installToonShading()).toBe(true);
  });
});
