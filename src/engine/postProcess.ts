import type { Scene } from '@babylonjs/core/scene';
import type { Camera } from '@babylonjs/core/Cameras/camera';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { POST_FX, type QualityPreset } from '../data/quality';

/** Pipeline de efectos: bloom suave, FXAA, mapeo de tonos y viñeta. */
export function createPostProcess(
  scene: Scene,
  camera: Camera,
  quality: QualityPreset,
): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline('postfx', true, scene, [camera]);
  pipeline.bloomThreshold = POST_FX.bloomThreshold;
  pipeline.bloomWeight = POST_FX.bloomWeight;
  pipeline.bloomKernel = POST_FX.bloomKernel;
  pipeline.bloomScale = POST_FX.bloomScale;
  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  ip.exposure = POST_FX.exposure;
  ip.contrast = POST_FX.contrast;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = POST_FX.vignetteWeight;
  applyPostProcessQuality(pipeline, quality);
  return pipeline;
}

export function applyPostProcessQuality(pipeline: DefaultRenderingPipeline, quality: QualityPreset): void {
  pipeline.bloomEnabled = quality.bloom;
  pipeline.fxaaEnabled = quality.fxaa;
  pipeline.samples = quality.msaaSamples;
}
