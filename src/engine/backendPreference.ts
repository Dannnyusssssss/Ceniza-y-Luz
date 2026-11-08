export type GraphicsBackend = 'webgpu' | 'webgl2';

/** Motor por defecto. WebGPU con respaldo automático a WebGL2. */
export const DEFAULT_BACKEND: GraphicsBackend = 'webgpu';

/**
 * Lee la preferencia de motor desde la URL (`?motor=webgpu` o `?motor=webgl2`).
 * Cualquier otro valor se ignora.
 */
export function readBackendPreference(search: string): GraphicsBackend | null {
  const value = new URLSearchParams(search).get('motor');
  return value === 'webgpu' || value === 'webgl2' ? value : null;
}
