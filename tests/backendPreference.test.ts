import { describe, expect, it } from 'vitest';
import { readBackendPreference } from '../src/engine/backendPreference';
import { META } from '../src/data/meta';

describe('readBackendPreference', () => {
  it('acepta los dos motores conocidos', () => {
    expect(readBackendPreference('?motor=webgpu')).toBe('webgpu');
    expect(readBackendPreference('?motor=webgl2')).toBe('webgl2');
  });

  it('ignora valores desconocidos, vacíos o con mayúsculas', () => {
    expect(readBackendPreference('')).toBeNull();
    expect(readBackendPreference('?motor=')).toBeNull();
    expect(readBackendPreference('?motor=WEBGPU')).toBeNull();
    expect(readBackendPreference('?motor=<script>')).toBeNull();
  });
});

describe('META', () => {
  it('define el título, el slug y el prefijo de almacenamiento', () => {
    expect(META.title).toBe('Ceniza y Luz');
    expect(META.slug).toBe('ceniza-y-luz');
    expect(META.storagePrefix).toBe('cenizayluz:');
  });
});
