import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { ZonePalette } from '../data/palettes';
import { PUZZLES } from '../data/puzzles';
import type { StructureData, ZoneData } from '../data/zones';
import { cellCenter } from '../game/puzzles';
import { groundHeight } from '../world/terrain';
import { MeshBuilder } from './meshBuilder';
import { applyOutline, type ToonMaterials } from './toon';

const OUTLINE_WIDTH = 0.03;
const WALLS = ['#e8d6b8', '#dcc4a4', '#efe0c8'];
const ROOFS = ['#c0563c', '#b4703c', '#7d5ca8'];
const WOOD = { light: '#a8703f', mid: '#8a5a33', dark: '#5f3d25' };
const STONE = { light: '#b8b2a6', mid: '#918c82', dark: '#6a665f' };
const GOLD = '#e8c25a';
const GLOW = { warm: '#ffd98a', cyan: '#8fe9ff', violet: '#a98bff' };
const AWNING = ['#d65a4a', '#f4e8cf'];
const BRUMA_DARK = '#5a4490';

/** Dos mallas por zona: lo que recibe luz y lo que brilla. */
interface Builders {
  readonly solid: MeshBuilder;
  readonly glow: MeshBuilder;
}

function addHouse(b: Builders, s: StructureData, y: number): void {
  const variant = s.variant ?? 0;
  const wall = WALLS[variant % WALLS.length] as string;
  const roof = ROOFS[variant % ROOFS.length] as string;
  const height = 2.6;
  b.solid.box(s.w, height, s.d, wall, { x: s.x, y: y + height / 2 - 0.1, z: s.z });
  // Vigas de las esquinas.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.solid.box(0.2, height + 0.1, 0.2, WOOD.dark, {
        x: s.x + sx * (s.w / 2),
        y: y + height / 2 - 0.1,
        z: s.z + sz * (s.d / 2),
      });
    }
  }
  // La cumbrera va a lo largo del lado mayor.
  const alongX = s.w >= s.d;
  const roofLen = (alongX ? s.w : s.d) + 0.7;
  const roofWide = (alongX ? s.d : s.w) + 0.9;
  b.solid.roof(roofLen, 1.5, roofWide, roof, {
    x: s.x,
    y: y + height - 0.1,
    z: s.z,
    yaw: alongX ? 0 : Math.PI / 2,
  });
  // Puerta y ventanas hacia el centro de la aldea.
  const towardX = Math.abs(s.x) > Math.abs(s.z);
  const sign = towardX ? -Math.sign(s.x) : -Math.sign(s.z);
  const face = (towardX ? s.w : s.d) / 2 + 0.02;
  const place = (along: number, up: number): { x: number; y: number; z: number } =>
    towardX
      ? { x: s.x + sign * face, y: y + up, z: s.z + along }
      : { x: s.x + along, y: y + up, z: s.z + sign * face };
  const doorSize: [number, number, number] = towardX ? [0.1, 1.8, 1] : [1, 1.8, 0.1];
  b.solid.box(doorSize[0], doorSize[1], doorSize[2], WOOD.mid, place(0, 0.9));
  const span = (towardX ? s.d : s.w) * 0.28;
  for (const along of [-span, span]) {
    const size: [number, number, number] = towardX ? [0.1, 0.7, 0.7] : [0.7, 0.7, 0.1];
    b.glow.box(size[0], size[1], size[2], GLOW.warm, place(along, 1.55));
  }
  // Chimenea.
  b.solid.box(0.5, 1.4, 0.5, STONE.mid, { x: s.x + s.w * 0.25, y: y + height + 0.9, z: s.z + s.d * 0.12 });
}

function addStall(b: Builders, s: StructureData, y: number): void {
  const halfW = s.w / 2;
  b.solid.box(s.w, 1, s.d, WOOD.mid, { x: s.x, y: y + 0.5, z: s.z });
  b.solid.box(s.w + 0.2, 0.1, s.d + 0.2, WOOD.light, { x: s.x, y: y + 1.04, z: s.z });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      b.solid.box(0.14, 2.6, 0.14, WOOD.dark, { x: s.x + sx * halfW, y: y + 1.3, z: s.z + sz * (s.d / 2) });
    }
  }
  // Toldo a rayas, que se reconoce de lejos.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const w = (s.w + 0.6) / stripes;
    b.solid.box(w, 0.08, s.d + 1.1, AWNING[i % 2] as string, {
      x: s.x - (s.w + 0.6) / 2 + w * (i + 0.5),
      y: y + 2.72,
      z: s.z - 0.1,
      pitch: -0.2,
    });
  }
  // Pociones y cajas sobre el mostrador.
  for (let i = 0; i < 5; i++) {
    b.glow.cylinder(0.26, 0.05, 0.13, 6, i % 2 ? '#ff7a8a' : GLOW.cyan, {
      x: s.x - 1.5 + i * 0.75,
      y: y + 1.22,
      z: s.z - 0.2,
    });
  }
  b.solid.box(0.7, 0.6, 0.7, WOOD.light, { x: s.x + halfW + 0.7, y: y + 0.3, z: s.z });
  b.solid.box(0.5, 0.42, 0.5, WOOD.mid, { x: s.x + halfW + 0.72, y: y + 0.81, z: s.z + 0.05 });
}

function addSanctuary(b: Builders, s: StructureData, y: number): void {
  const half = 4.5;
  // Suelo a ras de tierra: el jugador camina por encima sin escalones.
  b.solid.box(s.w + 1.2, 0.06, s.d + 1.2, STONE.dark, { x: s.x, y: y + 0.01, z: s.z });
  b.solid.box(s.w + 0.2, 0.06, s.d + 0.2, STONE.mid, { x: s.x, y: y + 0.03, z: s.z });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = s.x + sx * half;
      const z = s.z + sz * half;
      b.solid.cylinder(3.7, 0.62, 0.8, 8, STONE.light, { x, y: y + 1.85, z });
      b.solid.box(1, 0.2, 1, GOLD, { x, y: y + 3.7, z });
    }
  }
  b.solid.box(s.w + 0.4, 0.45, 1, STONE.mid, { x: s.x, y: y + 3.95, z: s.z - half });
  b.solid.box(s.w + 0.4, 0.45, 1, STONE.mid, { x: s.x, y: y + 3.95, z: s.z + half });
  b.solid.box(1, 0.45, s.d + 0.4, STONE.mid, { x: s.x - half, y: y + 3.95, z: s.z });
  b.solid.box(1, 0.45, s.d + 0.4, STONE.mid, { x: s.x + half, y: y + 3.95, z: s.z });
  b.solid.roof(s.w + 1.4, 1.8, s.d + 1.4, ROOFS[2] as string, { x: s.x, y: y + 4.17, z: s.z });
  b.glow.sphere(0.22, GLOW.warm, { x: s.x, y: y + 6.2, z: s.z });
}

function addAltar(b: Builders, x: number, z: number, y: number): void {
  b.solid.box(2, 0.3, 2, STONE.dark, { x, y: y + 0.55, z });
  b.solid.box(1.4, 0.7, 1.4, STONE.light, { x, y: y + 0.95, z });
  b.solid.box(1.6, 0.1, 1.6, GOLD, { x, y: y + 1.32, z });
  b.glow.cylinder(0.06, 1, 1, 8, GLOW.warm, { x, y: y + 1.4, z });
}

function addWell(b: Builders, s: StructureData, y: number): void {
  b.solid.cylinder(0.9, 1.7, 1.85, 10, STONE.mid, { x: s.x, y: y + 0.45, z: s.z });
  b.glow.cylinder(0.04, 1.35, 1.35, 10, '#6fc8e8', { x: s.x, y: y + 0.88, z: s.z });
  for (const sx of [-1, 1])
    b.solid.box(0.14, 2.2, 0.14, WOOD.dark, { x: s.x + sx * 0.85, y: y + 1.1, z: s.z });
  b.solid.roof(2.4, 0.7, 1.5, ROOFS[0] as string, { x: s.x, y: y + 2.2, z: s.z });
}

function addLantern(b: Builders, s: StructureData, y: number): void {
  b.solid.box(0.16, 2.3, 0.16, WOOD.dark, { x: s.x, y: y + 1.15, z: s.z });
  b.solid.box(0.56, 0.08, 0.56, WOOD.dark, { x: s.x, y: y + 2.72, z: s.z });
  b.glow.box(0.34, 0.42, 0.34, GLOW.warm, { x: s.x, y: y + 2.48, z: s.z });
}

function addStones(b: Builders, s: StructureData, y: number): void {
  const count = 7;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = (Math.min(s.w, s.d) / 2) * (0.55 + 0.35 * ((i * 3) % 2));
    b.solid.box(1.3, 0.14, 1, STONE.mid, {
      x: s.x + Math.cos(a) * r,
      y: y + 0.05,
      z: s.z + Math.sin(a) * r,
      yaw: a,
    });
  }
}

/** Muros de piedra y ruinas con el borde superior más oscuro. */
function addBlocks(b: Builders, zone: ZoneData): void {
  for (const block of zone.blocks) {
    if (block.kind !== 'wall' && block.kind !== 'ruin' && block.kind !== 'pillar') continue;
    const y = groundHeight(zone, block.x, block.z);
    const below = 0.9;
    const w = block.halfX * 2;
    const d = block.halfZ * 2;
    b.solid.box(w, block.height + below, d, STONE.mid, {
      x: block.x,
      y: y + (block.height - below) / 2,
      z: block.z,
    });
    b.solid.box(w + 0.1, 0.16, d + 0.1, STONE.dark, { x: block.x, y: y + block.height, z: block.z });
  }
}

function addPuzzleParts(b: Builders, zone: ZoneData): void {
  for (const puzzle of PUZZLES) {
    if (puzzle.zone !== zone.id) continue;
    if (puzzle.kind === 'sequence') {
      // Mural: los símbolos en el orden correcto. Es la pista, y siempre se ve.
      const { x, z, yaw } = puzzle.mural;
      const y = groundHeight(zone, x, z);
      b.solid.box(0.5, 2.3, 2.6, STONE.mid, { x, y: y + 1, z });
      b.solid.box(0.6, 0.16, 2.8, STONE.dark, { x, y: y + 2.2, z });
      puzzle.order.forEach((id, i) => {
        const data = puzzle.switches.find((s) => s.id === id);
        if (!data) return;
        const face = x + 0.32;
        b.glow.symbol(data.symbol, 0.24, GLOW.cyan, { x: face, y: y + 1.75 - i * 0.68, z, yaw });
      });
    } else {
      for (const cell of puzzle.solids) {
        const c = cellCenter(puzzle, cell);
        const y = groundHeight(zone, c.x, c.z);
        b.solid.sphere(1.05, STONE.dark, { x: c.x, y: y + 0.6, z: c.z, sy: 0.85 });
      }
      // Marco en el suelo: la zona donde se empuja, visible como pista.
      const half = puzzle.cellSize / 2;
      const minX = puzzle.origin.x - half;
      const minZ = puzzle.origin.z - half;
      const w = puzzle.cols * puzzle.cellSize;
      const d = puzzle.rows * puzzle.cellSize;
      const gy = groundHeight(zone, puzzle.origin.x, puzzle.origin.z) + 0.04;
      b.solid.box(w, 0.04, 0.12, STONE.light, { x: minX + w / 2, y: gy, z: minZ });
      b.solid.box(w, 0.04, 0.12, STONE.light, { x: minX + w / 2, y: gy, z: minZ + d });
      b.solid.box(0.12, 0.04, d, STONE.light, { x: minX, y: gy, z: minZ + d / 2 });
      b.solid.box(0.12, 0.04, d, STONE.light, { x: minX + w, y: gy, z: minZ + d / 2 });
      // Piedra de reinicio: una flecha circular de luz.
      const ry = groundHeight(zone, puzzle.reset.x, puzzle.reset.z);
      b.solid.cylinder(0.8, 0.62, 0.78, 8, STONE.mid, { x: puzzle.reset.x, y: ry + 0.4, z: puzzle.reset.z });
      b.glow.cylinder(0.04, 0.42, 0.42, 8, GLOW.cyan, { x: puzzle.reset.x, y: ry + 0.82, z: puzzle.reset.z });
    }
  }
}

/** Crea las construcciones, carteles y piezas fijas de una zona. Cada malla reúne muchas piezas. */
export function addZoneStructures(
  scene: Scene,
  zone: ZoneData,
  palette: ZonePalette,
  materials: ToonMaterials,
  shadows: ShadowGenerator,
): { meshes: Mesh[]; materials: StandardMaterial[] } {
  const b: Builders = { solid: new MeshBuilder(), glow: new MeshBuilder() };
  const owned: StandardMaterial[] = [];
  const meshes: Mesh[] = [];
  addBlocks(b, zone);
  for (const s of zone.structures) {
    const y = groundHeight(zone, s.x, s.z);
    switch (s.kind) {
      case 'house':
        addHouse(b, s, y);
        break;
      case 'stall':
        addStall(b, s, y);
        break;
      case 'sanctuary':
        addSanctuary(b, s, y);
        break;
      case 'well':
        addWell(b, s, y);
        break;
      case 'lantern':
        addLantern(b, s, y);
        break;
      case 'stones':
        addStones(b, s, y);
        break;
      case 'barrier':
        break;
    }
  }
  if (zone.altar) addAltar(b, zone.altar.x, zone.altar.z, groundHeight(zone, zone.altar.x, zone.altar.z));
  for (const sign of zone.signs) {
    const y = groundHeight(zone, sign.x, sign.z);
    b.solid.box(0.14, 1.3, 0.14, WOOD.dark, { x: sign.x, y: y + 0.65, z: sign.z });
    b.solid.box(1, 0.55, 0.1, WOOD.light, { x: sign.x, y: y + 1.2, z: sign.z });
    b.solid.box(0.76, 0.06, 0.12, WOOD.dark, { x: sign.x, y: y + 1.3, z: sign.z });
    b.solid.box(0.56, 0.06, 0.12, WOOD.dark, { x: sign.x, y: y + 1.14, z: sign.z });
  }
  addPuzzleParts(b, zone);

  const solid = b.solid.build('structures', scene, materials.modelToon());
  if (solid) {
    solid.receiveShadows = true;
    applyOutline(solid, palette.outline, OUTLINE_WIDTH);
    shadows.addShadowCaster(solid);
    meshes.push(solid);
  }
  const glow = b.glow.build('structureGlow', scene, materials.modelUnlit());
  if (glow) meshes.push(glow);

  // Barrera de Bruma: velos violetas superpuestos, semitransparentes y quietos.
  const barriers = zone.structures.filter((s) => s.kind === 'barrier');
  if (barriers.length > 0) {
    const veil = new MeshBuilder();
    for (const s of barriers) {
      const y = groundHeight(zone, s.x, s.z);
      // Columnas de bruma de distinta altura: nada de bordes rectos, se leen como humo denso.
      const columns = 14;
      for (let layer = 0; layer < 3; layer++) {
        for (let i = 0; i < columns; i++) {
          const k = i / (columns - 1) - 0.5;
          const wave = Math.sin(i * 1.9 + layer * 2.3) * 0.5 + 0.5;
          const height = (5.5 + wave * 3.5) * (1 - Math.abs(k) * 0.55);
          veil.cylinder(height, 0.5, 1.5, 6, layer === 1 ? GLOW.violet : BRUMA_DARK, {
            x: s.x + k * (s.w + 3) + layer * 0.2,
            y: y + height / 2 - 0.2,
            z: s.z + (layer - 1) * 0.55,
          });
        }
      }
    }
    const material = new StandardMaterial('bruma', scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.emissiveColor = Color3.White();
    material.alpha = 0.3;
    material.backFaceCulling = false;
    const mesh = veil.build('barrier', scene, material);
    if (mesh) meshes.push(mesh);
    owned.push(material);
  }
  return { meshes, materials: owned };
}
