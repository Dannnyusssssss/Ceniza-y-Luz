import { describe, expect, it } from 'vitest';
import { describeGpu } from '../src/core/gpuInfo';

describe('describeGpu', () => {
  it('en WebGPU une fabricante, arquitectura y descripción', () => {
    expect(describeGpu({ vendor: 'intel', renderer: 'gen-12lp', version: 'Iris Xe' })).toBe(
      'intel gen-12lp Iris Xe',
    );
  });

  it('descarta lo que WebGPU no informa', () => {
    expect(describeGpu({ vendor: 'nvidia', renderer: 'unknown renderer', version: 'unknown version' })).toBe(
      'nvidia',
    );
  });

  it('en WebGL2 usa el nombre completo sin repetir el fabricante ni la versión de WebGL', () => {
    expect(
      describeGpu({
        vendor: 'Google Inc. (NVIDIA)',
        renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti, Direct3D11)',
        version: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
      }),
    ).toBe('Google Inc. (NVIDIA) ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Ti, Direct3D11)');
    expect(describeGpu({ vendor: 'NVIDIA', renderer: 'NVIDIA GeForce RTX', version: '' })).toBe(
      'NVIDIA GeForce RTX',
    );
  });

  it('sin datos devuelve un texto vacío', () => {
    expect(describeGpu({ vendor: '', renderer: ' ', version: 'unknown version' })).toBe('');
  });
});
