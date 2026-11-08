import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import type { FrameLimiter } from '../core/frameLimiter';

/**
 * Hace que el motor solo empiece un fotograma cuando el limitador lo permite. Un refresco saltado no
 * llega al motor: la pantalla conserva la imagen anterior y el tiempo y los FPS del motor siguen siendo reales.
 * Se llama antes de `runRenderLoop`.
 */
export function limitFrameRate(engine: AbstractEngine, limiter: FrameLimiter, targetFps: () => number): void {
  let handle = 0;
  engine.customAnimationFrameRequester = {
    requestAnimationFrame: (render: FrameRequestCallback): number => {
      const onRefresh: FrameRequestCallback = (now) => {
        if (limiter.tick(now, targetFps())) render(now);
        else handle = window.requestAnimationFrame(onRefresh);
      };
      handle = window.requestAnimationFrame(onRefresh);
      return handle;
    },
    cancelAnimationFrame: (): void => window.cancelAnimationFrame(handle),
  };
}
