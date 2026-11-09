import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { renderScaling, type QualityPreset } from '../data/quality';

/** Aplica la resolución interna según la calidad, la escala dinámica y el alto actual del lienzo. */
export function applyRenderScale(
  engine: AbstractEngine,
  preset: QualityPreset,
  resolutionScale: number,
): void {
  const height = engine.getRenderingCanvas()?.clientHeight ?? 0;
  engine.setHardwareScalingLevel(renderScaling(preset, resolutionScale, height));
}
