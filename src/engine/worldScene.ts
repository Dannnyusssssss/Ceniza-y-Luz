import { Scene } from '@babylonjs/core/scene';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { ZonePalette } from '../data/palettes';
import { ARENA } from '../data/arena';
import type { QualityPreset } from '../data/quality';
import { ToonMaterials } from '../render/toon';

export interface WorldScene {
  readonly scene: Scene;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphericLight;
  readonly shadows: ShadowGenerator;
  readonly materials: ToonMaterials;
}

/** Escena base: luz direccional con sombras, luz hemisférica de relleno y niebla, con la paleta de la zona. */
export function createWorldScene(
  engine: AbstractEngine,
  palette: ZonePalette,
  quality: QualityPreset,
): WorldScene {
  const scene = new Scene(engine);
  const horizon = Color3.FromHexString(palette.skyHorizon);
  scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = palette.fogDensity;
  scene.fogColor = Color3.FromHexString(palette.fog);
  scene.skipPointerMovePicking = true;

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.diffuse = Color3.FromHexString(palette.hemiSky);
  hemi.groundColor = Color3.FromHexString(palette.hemiGround);
  hemi.specular = Color3.Black();
  hemi.intensity = palette.hemiIntensity;

  const sun = new DirectionalLight('sun', new Vector3(-0.55, -1, 0.45).normalize(), scene);
  sun.position = new Vector3(22, 40, -18);
  sun.diffuse = Color3.FromHexString(palette.sun);
  sun.intensity = palette.sunIntensity;
  // Zona de sombras fija sobre la arena: más resolución que ajustarla a todo el paisaje.
  sun.autoUpdateExtends = false;
  const extent = ARENA.halfSize + 4;
  sun.orthoLeft = -extent;
  sun.orthoRight = extent;
  sun.orthoTop = extent;
  sun.orthoBottom = -extent;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 120;

  const shadows = new ShadowGenerator(quality.shadowMapSize, sun);
  shadows.bias = 0.0015;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.35;
  applyShadowFilter(shadows, quality);

  return { scene, sun, hemi, shadows, materials: new ToonMaterials(scene) };
}

export function applyShadowFilter(shadows: ShadowGenerator, quality: QualityPreset): void {
  shadows.usePercentageCloserFiltering = quality.softShadows;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  const map = shadows.getShadowMap();
  if (map && map.getSize().width !== quality.shadowMapSize) map.resize(quality.shadowMapSize);
}
