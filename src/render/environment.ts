import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { createRng, type Rng } from '../core/rng';
import { ARENA } from '../data/arena';
import type { ZonePalette } from '../data/palettes';
import { applyOutline, type ToonMaterials } from './toon';

const OUTLINE_WIDTH = 0.035;

/** Cielo: esfera invertida con degradado por color de vértice, sin luz ni niebla. */
function createSky(scene: Scene, palette: ZonePalette): Mesh {
  const sky = CreateSphere('sky', { diameter: 400, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const positions = sky.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const top = Color3.FromHexString(palette.skyTop);
  const horizon = Color3.FromHexString(palette.skyHorizon);
  const colors: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const t = Math.min(Math.max((positions[i + 1] ?? 0) / 200, 0), 1);
    const c = Color3.Lerp(horizon, top, Math.pow(t, 0.6));
    colors.push(c.r, c.g, c.b, 1);
  }
  sky.setVerticesData(VertexBuffer.ColorKind, colors);
  const material = new StandardMaterial('skyMat', scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.fogEnabled = false;
  material.backFaceCulling = false;
  sky.material = material;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  return sky;
}

interface Terrain {
  readonly phaseA: number;
  readonly phaseB: number;
}

/** Altura del suelo: 0 dentro del claro y colinas suaves fuera. La usan el suelo y la decoración. */
function terrainHeight(terrain: Terrain, x: number, z: number): number {
  const flatLimit = ARENA.halfSize + 2;
  const edge = Math.max(Math.abs(x), Math.abs(z));
  const rise = Math.min(Math.max((edge - flatLimit) / 14, 0), 1);
  const hills = 1.6 + Math.sin(x * 0.18 + terrain.phaseA) * 1.2 + Math.cos(z * 0.15 + terrain.phaseB) * 1.2;
  return rise * rise * hills * 2.2;
}

/** Suelo: plano dentro del claro y colinas suaves fuera, con caras planas (low-poly). */
function createGround(scene: Scene, palette: ZonePalette, materials: ToonMaterials, terrain: Terrain): Mesh {
  const size = ARENA.decoration.groundRadius * 2;
  const ground = CreateGround(
    'ground',
    { width: size, height: size, subdivisions: 40, updatable: true },
    scene,
  );
  const positions = ground.getVerticesData(VertexBuffer.PositionKind) ?? [];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i + 1] = terrainHeight(terrain, positions[i] ?? 0, positions[i + 2] ?? 0);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, positions);
  ground.convertToFlatShadedMesh();
  ground.material = materials.get(palette.ground);
  ground.receiveShadows = true;
  ground.isPickable = false;

  const path = CreateDisc('path', { radius: ARENA.decoration.pathRadius, tessellation: 9 }, scene);
  path.rotation.x = Math.PI / 2;
  path.position.y = 0.02;
  path.material = materials.get(palette.path);
  path.receiveShadows = true;
  return ground;
}

/** Muros, pilares y ruinas de la arena, fusionados en una sola malla (una llamada de dibujo). */
function createBlocks(
  scene: Scene,
  palette: ZonePalette,
  materials: ToonMaterials,
  shadows: ShadowGenerator,
): Mesh | null {
  const parts = ARENA.blocks.map((block, i) => {
    const box = CreateBox(
      `block${i}`,
      { width: block.halfX * 2, depth: block.halfZ * 2, height: block.height },
      scene,
    );
    box.position.set(block.x, block.height / 2, block.z);
    return box;
  });
  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) return null;
  merged.name = 'blocks';
  merged.material = materials.get(palette.wall);
  merged.receiveShadows = true;
  applyOutline(merged, palette.outline, OUTLINE_WIDTH);
  shadows.addShadowCaster(merged);
  return merged;
}

/** Punto al azar en un anillo, siempre fuera del cuadrado de la arena (con margen). */
function ringPoint(rng: Rng, inner: number, outer: number): { x: number; z: number } {
  const keepOut = ARENA.halfSize + 1.5;
  for (;;) {
    const angle = rng.range(0, Math.PI * 2);
    const radius = rng.range(inner, outer);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.max(Math.abs(x), Math.abs(z)) > keepOut) return { x, z };
  }
}

/** Acumula matrices de instancias finas y las sube a la GPU de una sola vez. */
class InstanceBatch {
  private readonly data: number[] = [];
  private readonly scratch = new Matrix();

  add(position: Vector3, scale: Vector3, rotation: Quaternion): void {
    Matrix.ComposeToRef(scale, rotation, position, this.scratch);
    for (const v of this.scratch.m) this.data.push(v);
  }

  addYaw(position: Vector3, scale: Vector3, yaw: number): void {
    this.add(position, scale, Quaternion.RotationYawPitchRoll(yaw, 0, 0));
  }

  applyTo(mesh: Mesh): void {
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(this.data), 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
  }
}

/** Árboles de bajo polígono (tronco + copa) con instancias finas: pocas llamadas de dibujo. */
function createTrees(
  scene: Scene,
  palette: ZonePalette,
  materials: ToonMaterials,
  rng: Rng,
  terrain: Terrain,
): Mesh[] {
  const trunk = CreateCylinder(
    'treeTrunk',
    { height: 1.8, diameterTop: 0.28, diameterBottom: 0.45, tessellation: 5 },
    scene,
  );
  trunk.position.y = 0.9;
  trunk.bakeCurrentTransformIntoVertices();
  trunk.convertToFlatShadedMesh();
  trunk.material = materials.get(palette.trunk);

  const crowns = palette.foliage.map((hex, i) => {
    const crown = CreateIcoSphere(`treeCrown${i}`, { radius: 1.4, subdivisions: 1, flat: true }, scene);
    crown.scaling.y = 1.15;
    crown.position.y = 2.6;
    crown.bakeCurrentTransformIntoVertices();
    crown.material = materials.get(hex, { highlights: true });
    applyOutline(crown, palette.outline, OUTLINE_WIDTH);
    return crown;
  });

  const trunkBatch = new InstanceBatch();
  const crownBatches = crowns.map(() => new InstanceBatch());
  const ring = ARENA.decoration.treeRing;
  for (let i = 0; i < ring.count; i++) {
    const p = ringPoint(rng, ring.inner, ring.outer);
    const s = rng.range(0.8, 1.5);
    const yaw = rng.range(0, Math.PI * 2);
    const pos = new Vector3(p.x, terrainHeight(terrain, p.x, p.z) - 0.1, p.z);
    trunkBatch.addYaw(pos, new Vector3(s, s, s), yaw);
    crownBatches[rng.int(0, crowns.length - 1)]?.addYaw(pos, new Vector3(s, s * rng.range(0.9, 1.2), s), yaw);
  }
  trunkBatch.applyTo(trunk);
  crowns.forEach((crown, i) => crownBatches[i]?.applyTo(crown));
  for (const mesh of [trunk, ...crowns]) mesh.isPickable = false;
  return [trunk, ...crowns];
}

/** Rocas: icosfera deformada de forma determinista, con caras planas. */
function createRocks(
  scene: Scene,
  palette: ZonePalette,
  materials: ToonMaterials,
  rng: Rng,
  terrain: Terrain,
): Mesh {
  const rock = CreateIcoSphere('rock', { radius: 0.8, subdivisions: 1, flat: false, updatable: true }, scene);
  const positions = rock.getVerticesData(VertexBuffer.PositionKind) ?? [];
  for (let i = 0; i < positions.length; i++) positions[i] = (positions[i] ?? 0) * rng.range(0.8, 1.15);
  rock.updateVerticesData(VertexBuffer.PositionKind, positions);
  rock.scaling.y = 0.65;
  rock.bakeCurrentTransformIntoVertices();
  rock.convertToFlatShadedMesh();
  rock.material = materials.get(palette.rock, { highlights: true });
  applyOutline(rock, palette.outline, OUTLINE_WIDTH);

  const batch = new InstanceBatch();
  const ring = ARENA.decoration.rockRing;
  for (let i = 0; i < ring.count; i++) {
    const p = ringPoint(rng, ring.inner, ring.outer);
    const s = rng.range(0.6, 2.2);
    batch.addYaw(
      new Vector3(p.x, terrainHeight(terrain, p.x, p.z), p.z),
      new Vector3(s, s, s),
      rng.range(0, 6.28),
    );
  }
  batch.applyTo(rock);
  rock.isPickable = false;
  return rock;
}

/** Cristales de luz: sin iluminación para que brillen con el bloom. */
function createCrystals(
  scene: Scene,
  palette: ZonePalette,
  materials: ToonMaterials,
  rng: Rng,
  shadows: ShadowGenerator,
): Mesh {
  const crystal = CreateCylinder(
    'crystal',
    { height: 1.6, diameterTop: 0, diameterBottom: 0.5, tessellation: 5 },
    scene,
  );
  crystal.position.y = 0.8;
  crystal.bakeCurrentTransformIntoVertices();
  crystal.convertToFlatShadedMesh();
  crystal.material = materials.get(palette.crystal, { unlit: true });
  applyOutline(crystal, palette.outline, OUTLINE_WIDTH);
  const batch = new InstanceBatch();
  for (const p of ARENA.decoration.crystals) {
    for (let k = 0; k < 3; k++) {
      const s = k === 0 ? 1.2 : rng.range(0.5, 0.8);
      const offset = k === 0 ? 0 : 0.45;
      const angle = rng.range(0, Math.PI * 2);
      const pos = new Vector3(p.x + Math.cos(angle) * offset, 0, p.z + Math.sin(angle) * offset);
      batch.add(
        pos,
        new Vector3(s, s, s),
        Quaternion.RotationYawPitchRoll(
          angle,
          k === 0 ? 0 : rng.range(-0.4, 0.4),
          k === 0 ? 0 : rng.range(-0.4, 0.4),
        ),
      );
    }
  }
  batch.applyTo(crystal);
  shadows.addShadowCaster(crystal);
  return crystal;
}

export interface Environment {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

/** Construye el entorno de la arena de práctica a partir de los datos. */
export function createArenaEnvironment(
  scene: Scene,
  palette: ZonePalette,
  materials: ToonMaterials,
  shadows: ShadowGenerator,
): Environment {
  const rng = createRng(ARENA.decoration.seed);
  const sky = createSky(scene, palette);
  const terrain: Terrain = { phaseA: rng.range(0, Math.PI * 2), phaseB: rng.range(0, Math.PI * 2) };
  const ground = createGround(scene, palette, materials, terrain);
  const blocks = createBlocks(scene, palette, materials, shadows);
  const trees = createTrees(scene, palette, materials, rng, terrain);
  const rocks = createRocks(scene, palette, materials, rng, terrain);
  const crystals = createCrystals(scene, palette, materials, rng, shadows);
  const meshes = [sky, ground, ...(blocks ? [blocks] : []), ...trees, rocks, crystals];
  return {
    meshes,
    dispose() {
      for (const mesh of meshes) mesh.dispose();
    },
  };
}
