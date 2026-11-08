import { Scene } from '@babylonjs/core/scene';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import type { ZonePalette } from '../data/palettes';
import type { QualityPreset } from '../data/quality';
import { ToonMaterials } from '../render/toon';

export interface WorldScene {
  readonly scene: Scene;
  readonly sun: DirectionalLight;
  readonly hemi: HemisphericLight;
  readonly shadows: ShadowGenerator;
  readonly materials: ToonMaterials;
}

/** Dirección de la luz principal. */
const SUN_DIRECTION = new Vector3(-0.55, -1, 0.45).normalize();
/** Distancia del sol al punto que enfoca. */
const SUN_DISTANCE = 50;
/** La zona de sombras se mueve a saltos de esta medida: así los bordes de las sombras no tiemblan al caminar. */
const SHADOW_SNAP = 2;

/** Aplica la paleta de una zona a la niebla y a las luces. */
export function applyPalette(world: WorldScene, palette: ZonePalette): void {
  const { scene, hemi, sun } = world;
  const horizon = Color3.FromHexString(palette.skyHorizon);
  scene.clearColor = new Color4(horizon.r, horizon.g, horizon.b, 1);
  scene.fogDensity = palette.fogDensity;
  scene.fogColor = Color3.FromHexString(palette.fog);
  hemi.diffuse = Color3.FromHexString(palette.hemiSky);
  hemi.groundColor = Color3.FromHexString(palette.hemiGround);
  hemi.intensity = palette.hemiIntensity;
  sun.diffuse = Color3.FromHexString(palette.sun);
  sun.intensity = palette.sunIntensity;
}

/** Tamaño del área con sombras alrededor del jugador. */
export function setShadowExtent(world: WorldScene, extent: number): void {
  const { sun } = world;
  sun.orthoLeft = -extent;
  sun.orthoRight = extent;
  sun.orthoTop = extent;
  sun.orthoBottom = -extent;
}

/** Centra las sombras en un punto (el jugador): solo cuesta lo que se ve. */
export function focusShadows(world: WorldScene, x: number, z: number): void {
  const sx = Math.round(x / SHADOW_SNAP) * SHADOW_SNAP;
  const sz = Math.round(z / SHADOW_SNAP) * SHADOW_SNAP;
  world.sun.position.set(
    sx - SUN_DIRECTION.x * SUN_DISTANCE,
    -SUN_DIRECTION.y * SUN_DISTANCE,
    sz - SUN_DIRECTION.z * SUN_DISTANCE,
  );
}

/** Escena base: luz direccional con sombras, luz hemisférica de relleno y niebla, con la paleta de la zona. */
export function createWorldScene(
  engine: AbstractEngine,
  palette: ZonePalette,
  quality: QualityPreset,
): WorldScene {
  const scene = new Scene(engine);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.skipPointerMovePicking = true;

  const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemi.specular = Color3.Black();

  const sun = new DirectionalLight('sun', SUN_DIRECTION.clone(), scene);
  // Zona de sombras alrededor del jugador: más resolución que ajustarla a todo el paisaje.
  sun.autoUpdateExtends = false;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 120;

  const shadows = new ShadowGenerator(quality.shadowMapSize, sun);
  // Con menos margen, las paredes de cara al sol se sombrean a sí mismas y salen con rayas finas.
  shadows.bias = 0.004;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.35;
  applyShadowFilter(shadows, quality);

  const world: WorldScene = { scene, sun, hemi, shadows, materials: new ToonMaterials(scene) };
  applyPalette(world, palette);
  setShadowExtent(world, 30);
  focusShadows(world, 0, 0);
  return world;
}

export function applyShadowFilter(shadows: ShadowGenerator, quality: QualityPreset): void {
  shadows.usePercentageCloserFiltering = quality.softShadows;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  const map = shadows.getShadowMap();
  if (map && map.getSize().width !== quality.shadowMapSize) map.resize(quality.shadowMapSize);
}
