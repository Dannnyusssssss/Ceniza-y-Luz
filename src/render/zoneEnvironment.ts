import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { createRng } from '../core/rng';
import type { ZonePalette } from '../data/palettes';
import type { ZoneData } from '../data/zones';
import { groundHeight } from '../world/terrain';
import type { ScatterItem, ZoneLayout } from '../world/zones';
import { addZoneStructures, type Veil } from './zoneStructures';
import { InstancedPoints } from './particles';
import { MeshBuilder } from './meshBuilder';
import { applyOutline, type ToonMaterials } from './toon';

const OUTLINE_WIDTH = 0.035;
const FLOWER_COLORS = ['#ffd6e8', '#fff2a8', '#c9b8ff'];
const MUSHROOM_COLORS = { stem: '#e6e0c8', cap: '#7ff0d8' };
const FIREFLY_COLOR = '#f3ff9a';
const CRACK_COLOR = '#100c18';
/** Transparencia de la barrera de Bruma cuando está cerrada. */
const VEIL_ALPHA = 0.3;
/** Separación aproximada de los vértices del suelo (m). */
const GROUND_STEP = 1.7;

/** Cielo: esfera invertida con degradado por color de vértice, sin luz ni niebla. */
function createSky(scene: Scene, palette: ZonePalette): { mesh: Mesh; material: StandardMaterial } {
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
  return { mesh: sky, material };
}

function onCrack(zone: ZoneData, x: number, z: number): boolean {
  for (const b of zone.blocks) {
    if (b.kind === 'crack' && Math.abs(x - b.x) <= b.halfX && Math.abs(z - b.z) <= b.halfZ) return true;
  }
  return false;
}

function onPath(zone: ZoneData, x: number, z: number): boolean {
  for (const p of zone.paths) {
    const dx = p.bx - p.ax;
    const dz = p.bz - p.az;
    const len = dx * dx + dz * dz;
    const t = len > 0 ? Math.min(Math.max(((x - p.ax) * dx + (z - p.az) * dz) / len, 0), 1) : 0;
    if (Math.hypot(x - (p.ax + dx * t), z - (p.az + dz * t)) < p.width / 2) return true;
  }
  return false;
}

/** Suelo: relieve de la zona con caras planas, cada una del color de su centro (hierba o camino). */
function createGround(scene: Scene, zone: ZoneData, palette: ZonePalette, materials: ToonMaterials): Mesh {
  const size = (Math.max(zone.halfX, zone.halfZ) + 36) * 2;
  const ground = CreateGround(
    'ground',
    { width: size, height: size, subdivisions: Math.round(size / GROUND_STEP), updatable: true },
    scene,
  );
  const raw = ground.getVerticesData(VertexBuffer.PositionKind) ?? [];
  for (let i = 0; i < raw.length; i += 3) {
    raw[i + 1] = groundHeight(zone, raw[i] ?? 0, raw[i + 2] ?? 0);
  }
  ground.updateVerticesData(VertexBuffer.PositionKind, raw);
  ground.convertToFlatShadedMesh();
  const positions = ground.getVerticesData(VertexBuffer.PositionKind) ?? [];
  const grass = Color3.FromHexString(palette.ground);
  const far = Color3.FromHexString(palette.groundFar);
  const path = Color3.FromHexString(palette.path);
  const crack = Color3.FromHexString(palette.crack ?? CRACK_COLOR);
  const colors = new Float32Array((positions.length / 3) * 4);
  for (let i = 0; i < positions.length; i += 9) {
    const cx = ((positions[i] ?? 0) + (positions[i + 3] ?? 0) + (positions[i + 6] ?? 0)) / 3;
    const cz = ((positions[i + 2] ?? 0) + (positions[i + 5] ?? 0) + (positions[i + 8] ?? 0)) / 3;
    // Variación suave entre triángulos para que la hierba no sea un color plano.
    const noise = Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453;
    const vary = noise - Math.floor(noise);
    const base = onCrack(zone, cx, cz) ? crack : onPath(zone, cx, cz) ? path : vary < 0.45 ? far : grass;
    const k = 0.97 + vary * 0.06;
    const o = (i / 9) * 12;
    for (let v = 0; v < 3; v++) {
      colors[o + v * 4] = base.r * k;
      colors[o + v * 4 + 1] = base.g * k;
      colors[o + v * 4 + 2] = base.b * k;
      colors[o + v * 4 + 3] = 1;
    }
  }
  ground.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
  ground.hasVertexAlpha = false;
  ground.material = materials.modelToon();
  ground.receiveShadows = true;
  ground.isPickable = false;
  return ground;
}

/** Acumula matrices de instancias finas y las sube a la GPU de una sola vez. */
class InstanceBatch {
  private readonly data: number[] = [];
  private readonly scratch = new Matrix();

  add(position: Vector3, scale: Vector3, yaw: number): void {
    Matrix.ComposeToRef(scale, Quaternion.RotationYawPitchRoll(yaw, 0, 0), position, this.scratch);
    for (const v of this.scratch.m) this.data.push(v);
  }

  get count(): number {
    return this.data.length / 16;
  }

  applyTo(mesh: Mesh): void {
    mesh.thinInstanceSetBuffer('matrix', new Float32Array(this.data), 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
  }
}

/** Árboles de bajo polígono (tronco + copa) con instancias finas: pocas llamadas de dibujo. */
function createTrees(
  scene: Scene,
  zone: ZoneData,
  palette: ZonePalette,
  materials: ToonMaterials,
  layout: ZoneLayout,
  shadows: ShadowGenerator,
): Mesh[] {
  const rng = createRng(zone.scatter.seed + 1);
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
  for (const tree of [...layout.innerTrees, ...layout.outerTrees]) {
    const pos = new Vector3(tree.x, groundHeight(zone, tree.x, tree.z) - 0.1, tree.z);
    const s = tree.s;
    trunkBatch.add(pos, new Vector3(s, s, s), tree.yaw);
    crownBatches[rng.int(0, crowns.length - 1)]?.add(
      pos,
      new Vector3(s, s * rng.range(0.9, 1.2), s),
      tree.yaw,
    );
  }
  const meshes: Mesh[] = [];
  if (trunkBatch.count > 0) {
    trunkBatch.applyTo(trunk);
    trunk.receiveShadows = true;
    meshes.push(trunk);
    shadows.addShadowCaster(trunk);
  } else {
    trunk.dispose();
  }
  crowns.forEach((crown, i) => {
    const batch = crownBatches[i];
    if (batch && batch.count > 0) {
      batch.applyTo(crown);
      meshes.push(crown);
      shadows.addShadowCaster(crown);
    } else {
      crown.dispose();
    }
  });
  for (const mesh of meshes) mesh.isPickable = false;
  return meshes;
}

/** Rocas: icosfera deformada de forma determinista, con caras planas. */
function createRocks(
  scene: Scene,
  zone: ZoneData,
  palette: ZonePalette,
  materials: ToonMaterials,
  items: readonly ScatterItem[],
): Mesh | null {
  if (items.length === 0) return null;
  const rng = createRng(zone.scatter.seed + 2);
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
  for (const r of items) {
    batch.add(new Vector3(r.x, groundHeight(zone, r.x, r.z), r.z), new Vector3(r.s, r.s, r.s), r.yaw);
  }
  batch.applyTo(rock);
  rock.isPickable = false;
  return rock;
}

/** Cristales de luz: sin iluminación para que brillen con el bloom. */
function createCrystals(
  scene: Scene,
  zone: ZoneData,
  palette: ZonePalette,
  materials: ToonMaterials,
  shadows: ShadowGenerator,
): Mesh | null {
  if (zone.crystals.length === 0) return null;
  const rng = createRng(zone.scatter.seed + 3);
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
  const data: number[] = [];
  const m = new Matrix();
  for (const p of zone.crystals) {
    const y = groundHeight(zone, p.x, p.z);
    for (let k = 0; k < 3; k++) {
      const s = k === 0 ? 1.2 : rng.range(0.5, 0.8);
      const offset = k === 0 ? 0 : 0.45;
      const angle = rng.range(0, Math.PI * 2);
      const tilt = k === 0 ? 0 : rng.range(-0.4, 0.4);
      Matrix.ComposeToRef(
        new Vector3(s, s, s),
        Quaternion.RotationYawPitchRoll(angle, tilt, tilt * 0.6),
        new Vector3(p.x + Math.cos(angle) * offset, y, p.z + Math.sin(angle) * offset),
        m,
      );
      for (const v of m.m) data.push(v);
    }
  }
  crystal.thinInstanceSetBuffer('matrix', new Float32Array(data), 16, true);
  crystal.thinInstanceRefreshBoundingInfo(false);
  shadows.addShadowCaster(crystal);
  return crystal;
}

/** Flores: rombos pequeños de tres colores. No proyectan sombra. */
function createFlowers(
  scene: Scene,
  zone: ZoneData,
  materials: ToonMaterials,
  items: readonly ScatterItem[],
): Mesh[] {
  if (items.length === 0) return [];
  const rng = createRng(zone.scatter.seed + 4);
  const meshes = FLOWER_COLORS.map((hex, i) => {
    const flower = CreatePolyhedron(`flower${i}`, { type: 1, size: 0.09 }, scene);
    flower.position.y = 0.16;
    flower.bakeCurrentTransformIntoVertices();
    flower.material = materials.get(hex);
    flower.isPickable = false;
    return flower;
  });
  const batches = meshes.map(() => new InstanceBatch());
  for (const f of items) {
    const pos = new Vector3(f.x, groundHeight(zone, f.x, f.z), f.z);
    batches[rng.int(0, meshes.length - 1)]?.add(pos, new Vector3(f.s, f.s, f.s), f.yaw);
  }
  meshes.forEach((mesh, i) => batches[i]?.applyTo(mesh));
  return meshes;
}

/** Setas que brillan: tallo y sombrero en una sola malla. */
function createMushrooms(
  scene: Scene,
  zone: ZoneData,
  materials: ToonMaterials,
  items: readonly ScatterItem[],
): Mesh | null {
  if (items.length === 0) return null;
  const builder = new MeshBuilder();
  builder.cylinder(0.3, 0.06, 0.09, 6, MUSHROOM_COLORS.stem, { x: 0, y: 0.15, z: 0 });
  builder.sphere(0.17, MUSHROOM_COLORS.cap, { x: 0, y: 0.31, z: 0, sy: 0.6 });
  const mesh = builder.build('mushroom', scene, materials.modelUnlit());
  if (!mesh) return null;
  const batch = new InstanceBatch();
  for (const m of items) {
    batch.add(new Vector3(m.x, groundHeight(zone, m.x, m.z), m.z), new Vector3(m.s, m.s, m.s), m.yaw);
  }
  batch.applyTo(mesh);
  return mesh;
}

/** Haces de luz: conos brillantes y fijos que imitan la luz volumétrica por muy poco coste. */
function createShafts(
  scene: Scene,
  zone: ZoneData,
  palette: ZonePalette,
): { mesh: Mesh; material: StandardMaterial } | null {
  if (zone.shafts.length === 0) return null;
  const builder = new MeshBuilder();
  for (const p of zone.shafts) {
    const y = groundHeight(zone, p.x, p.z);
    builder.cylinder(14, 1.2, 4.2, 7, palette.crystal, { x: p.x, y: y + 7, z: p.z, roll: 0.16 });
  }
  const material = new StandardMaterial('shafts', scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = Color3.White();
  material.alpha = 0.07;
  material.backFaceCulling = false;
  material.fogEnabled = false;
  material.disableDepthWrite = true;
  const mesh = builder.build('shafts', scene, material, false);
  return mesh ? { mesh, material } : null;
}

/** Luciérnagas: giran despacio alrededor de su punto y cambian de tamaño sin parpadear. */
class Fireflies {
  private readonly points: InstancedPoints;
  private readonly items: { x: number; y: number; z: number; phase: number; radius: number }[] = [];
  private time = 0;

  constructor(scene: Scene, zone: ZoneData, palette: ZonePalette, materials: ToonMaterials) {
    const rng = createRng(zone.scatter.seed + 5);
    for (let i = 0; i < zone.scatter.fireflies; i++) {
      const x = rng.range(-zone.halfX, zone.halfX);
      const z = rng.range(-zone.halfZ, zone.halfZ);
      this.items.push({
        x,
        z,
        y: groundHeight(zone, x, z) + rng.range(0.6, 2.6),
        phase: rng.range(0, Math.PI * 2),
        radius: rng.range(0.3, 1.1),
      });
    }
    const mesh = CreateIcoSphere('firefly', { radius: 0.045, subdivisions: 1 }, scene);
    const color = palette.motes ?? FIREFLY_COLOR;
    this.points = new InstancedPoints(mesh, materials.get(color, { unlit: true }), this.items.length);
  }

  update(dt: number, reduceMotion: boolean): void {
    this.time += dt;
    // Con "Reducir movimiento" apenas se desplazan; el tamaño nunca late más de una vez por segundo.
    const amount = reduceMotion ? 0.15 : 1;
    this.points.begin();
    for (const f of this.items) {
      const a = this.time * 0.35 + f.phase;
      const size = 0.8 + 0.4 * Math.sin(this.time * 0.9 + f.phase);
      this.points.push(
        f.x + Math.cos(a) * f.radius * amount,
        f.y + Math.sin(a * 1.7) * 0.25 * amount,
        f.z + Math.sin(a) * f.radius * amount,
        0,
        size,
      );
    }
    this.points.end();
  }

  dispose(): void {
    this.points.dispose();
  }
}

/** Todo lo fijo de una zona: cielo, suelo, construcciones y decoración. Se crea al entrar y se libera al salir. */
export class ZoneEnvironment {
  private readonly meshes: Mesh[] = [];
  private readonly ownedMaterials: StandardMaterial[] = [];
  private readonly fireflies: Fireflies | null;
  private readonly veil: Veil | null;
  private readonly shafts: Mesh | null;

  constructor(
    scene: Scene,
    zone: ZoneData,
    layout: ZoneLayout,
    palette: ZonePalette,
    materials: ToonMaterials,
    private readonly shadows: ShadowGenerator,
  ) {
    const sky = createSky(scene, palette);
    this.meshes.push(sky.mesh);
    this.ownedMaterials.push(sky.material);
    this.meshes.push(createGround(scene, zone, palette, materials));
    const structures = addZoneStructures(scene, zone, palette, materials, shadows);
    this.meshes.push(...structures.meshes);
    this.ownedMaterials.push(...structures.materials);
    this.veil = structures.veil;
    const shafts = createShafts(scene, zone, palette);
    this.shafts = shafts?.mesh ?? null;
    if (shafts) {
      this.meshes.push(shafts.mesh);
      this.ownedMaterials.push(shafts.material);
    }
    this.meshes.push(...createTrees(scene, zone, palette, materials, layout, shadows));
    const rocks = createRocks(scene, zone, palette, materials, layout.rocks);
    if (rocks) this.meshes.push(rocks);
    const crystals = createCrystals(scene, zone, palette, materials, shadows);
    if (crystals) this.meshes.push(crystals);
    this.meshes.push(...createFlowers(scene, zone, materials, layout.flowers));
    const mushrooms = createMushrooms(scene, zone, materials, layout.mushrooms);
    if (mushrooms) this.meshes.push(mushrooms);
    this.fireflies = zone.scatter.fireflies > 0 ? new Fireflies(scene, zone, palette, materials) : null;
  }

  update(dt: number, reduceMotion: boolean, veilOpen: boolean, showShafts: boolean): void {
    this.fireflies?.update(dt, reduceMotion);
    this.shafts?.setEnabled(showShafts);
    if (this.veil) {
      const target = veilOpen ? 0 : VEIL_ALPHA;
      const { material, mesh } = this.veil;
      if (material.alpha !== target) {
        material.alpha =
          target > material.alpha ? target : Math.max(target, material.alpha - (dt * VEIL_ALPHA) / 1.6);
      }
      mesh.setEnabled(material.alpha > 0);
    }
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      this.shadows.removeShadowCaster(mesh, false);
      mesh.dispose();
    }
    this.meshes.length = 0;
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.length = 0;
    this.fireflies?.dispose();
  }
}
