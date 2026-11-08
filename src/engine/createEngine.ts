import { Engine } from '@babylonjs/core/Engines/engine';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { describeGpu } from '../core/gpuInfo';
import type { GraphicsBackend } from './backendPreference';

export interface CreatedEngine {
  readonly engine: AbstractEngine;
  readonly backend: GraphicsBackend;
  /** Gráfica que informa el navegador; vacío si no informa nada. */
  readonly gpu: string;
}

/**
 * WebGPU solo descarga sus compiladores (glslang y twgsl) si algún shader viene en GLSL.
 * Para que nunca se pidan a un servidor externo, se dejan sin ruta: si llegara a hacer falta,
 * el shader falla en local y se ve en la consola, en lugar de hacer una petición de red.
 */
const NO_REMOTE_COMPILER = { jsPath: undefined, wasmPath: undefined };

async function tryWebGpu(canvas: HTMLCanvasElement): Promise<CreatedEngine | null> {
  try {
    if (!(await WebGPUEngine.IsSupportedAsync)) return null;
    // Sin powerPreference: Chrome en Windows la ignora y avisa en la consola.
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      stencil: true,
      glslangOptions: NO_REMOTE_COMPILER,
      twgslOptions: NO_REMOTE_COMPILER,
    });
    await engine.initAsync(NO_REMOTE_COMPILER, NO_REMOTE_COMPILER);
    return { engine, backend: 'webgpu', gpu: describeGpu(engine.getInfo()) };
  } catch {
    return null;
  }
}

function tryWebGl2(canvas: HTMLCanvasElement): CreatedEngine | null {
  try {
    const engine = new Engine(canvas, true, {
      stencil: true,
      powerPreference: 'high-performance',
      disableWebGL2Support: false,
    });
    if (engine.webGLVersion < 2) {
      engine.dispose();
      return null;
    }
    return { engine, backend: 'webgl2', gpu: describeGpu(engine.getInfo()) };
  } catch {
    return null;
  }
}

/**
 * Crea el motor gráfico. Orden: la preferencia indicada; si no hay, el motor por defecto;
 * si falla, el otro. Devuelve null si ninguno está disponible.
 */
export async function createEngine(
  canvas: HTMLCanvasElement,
  defaultBackend: GraphicsBackend,
  preference: GraphicsBackend | null,
): Promise<CreatedEngine | null> {
  const first = preference ?? defaultBackend;
  if (first === 'webgpu') {
    return (await tryWebGpu(canvas)) ?? tryWebGl2(canvas);
  }
  return tryWebGl2(canvas) ?? (await tryWebGpu(canvas));
}
