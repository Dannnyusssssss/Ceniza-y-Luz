import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { BLADE_COLORS, type CharacterData } from '../data/characters';
import { applyOutline, type ToonMaterials } from './toon';
import { SegmentBuilder } from './segmentBuilder';

/** Escala base del modelo (altura total cercana a 1,65 m). */
const BASE_SCALE = 0.88;
const OUTLINE_WIDTH = 0.012;
/** Color blanco del material compartido: el color real va en cada vértice. */
const VERTEX_COLOR_BASE = '#ffffff';

/** Articulaciones del personaje, para animarlo por código. */
export interface CharacterRig {
  readonly root: TransformNode;
  /** Centro de masa: aquí gira la voltereta de la esquiva. */
  readonly body: TransformNode;
  readonly hips: TransformNode;
  readonly torso: TransformNode;
  readonly head: TransformNode;
  /** Pelo largo (Alba) o mechones traseros: se balancean. Puede faltar. */
  readonly hair: TransformNode | null;
  /** Capa o bufanda: se mueve con la inercia. */
  readonly cloth: TransformNode;
  readonly shoulderL: TransformNode;
  readonly elbowL: TransformNode;
  readonly shoulderR: TransformNode;
  readonly elbowR: TransformNode;
  readonly sword: TransformNode;
  readonly hipL: TransformNode;
  readonly kneeL: TransformNode;
  readonly hipR: TransformNode;
  readonly kneeR: TransformNode;
  readonly blade: Mesh;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

function node(name: string, scene: Scene, parent: TransformNode | null, x = 0, y = 0, z = 0): TransformNode {
  const n = new TransformNode(name, scene);
  n.parent = parent;
  n.position.set(x, y, z);
  return n;
}

/** Construye el modelo low-poly de Alba o de Ciro con la Hoja de Luz en la mano derecha. */
export function createCharacterModel(
  scene: Scene,
  data: CharacterData,
  materials: ToonMaterials,
  shadows: ShadowGenerator | null,
  outlineColor: string,
): CharacterRig {
  const c = data.colors;
  const material = materials.get(VERTEX_COLOR_BASE, { highlights: true });
  const meshes: Mesh[] = [];
  const id = data.id;

  const root = node(`${id}-root`, scene, null);
  root.scaling.setAll(BASE_SCALE * data.heightScale);
  const body = node(`${id}-body`, scene, root, 0, 0.55, 0);
  const hips = node(`${id}-hips`, scene, body, 0, 0.33, 0);
  const torso = node(`${id}-torso`, scene, hips, 0, 0.05, 0);
  const head = node(`${id}-head`, scene, torso, 0, 0.5, 0);

  // Cadera y torso.
  const torsoSeg = new SegmentBuilder(scene, `${id}-torsoSeg`)
    .box(0.34, 0.18, 0.22, c.pants, { y: -0.06 })
    .box(0.38, 0.36, 0.24, c.outfit, { y: 0.22, sx: 1, sz: 1 })
    .box(0.4, 0.07, 0.26, c.accent, { y: 0.04 })
    .box(0.34, 0.08, 0.25, c.outfitDark, { y: 0.4 })
    .cylinder(0.1, 0.11, 0.12, c.skin, { y: 0.47 });
  if (data.accessory === 'scarf') {
    torsoSeg.cylinder(0.1, 0.24, 0.26, c.cloth, { y: 0.46 }, 7);
  } else {
    torsoSeg.box(0.42, 0.05, 0.27, c.cloth, { y: 0.44 });
  }
  meshes.push(torsoSeg.build(torso, material));

  // Cabeza, ojos y pelo.
  const headSeg = new SegmentBuilder(scene, `${id}-headSeg`)
    .ico(0.24, c.skin, { y: 0.2, sy: 1.05, sz: 0.95 })
    .box(0.05, 0.085, 0.02, c.eyes, { x: -0.085, y: 0.19, z: 0.222 })
    .box(0.05, 0.085, 0.02, c.eyes, { x: 0.085, y: 0.19, z: 0.222 })
    .ico(0.265, c.hair, { y: 0.27, z: -0.07, sx: 1.04, sy: 0.92, sz: 1.06 });
  if (data.hairStyle === 'longLoose') {
    // Flequillo y mechones laterales que enmarcan la cara.
    for (const x of [-0.12, -0.04, 0.05, 0.13]) {
      headSeg.cylinder(0.16, 0.08, 0.02, c.hair, { x, y: 0.31, z: 0.17, rx: 0.5 }, 4);
    }
    for (const side of [-1, 1]) {
      headSeg.cylinder(0.42, 0.1, 0.04, c.hair, { x: side * 0.22, y: 0.07, z: 0.02, rz: side * 0.08 }, 4);
    }
  } else {
    // Mechones en punta hacia arriba y hacia atrás.
    const spikes: [number, number, number, number, number][] = [
      [0, 0.47, -0.02, -0.3, 0],
      [-0.12, 0.44, 0.02, -0.2, 0.5],
      [0.12, 0.44, 0.02, -0.2, -0.5],
      [-0.2, 0.36, -0.08, -0.6, 0.9],
      [0.2, 0.36, -0.08, -0.6, -0.9],
      [0, 0.38, -0.22, -1.2, 0],
      [-0.1, 0.3, -0.26, -1.5, 0.4],
      [0.1, 0.3, -0.26, -1.5, -0.4],
      [0.06, 0.4, 0.18, 0.6, -0.2],
    ];
    for (const [x, y, z, rx, rz] of spikes) {
      headSeg.cylinder(0.2, 0, 0.13, c.hair, { x, y, z, rx, rz }, 4);
    }
  }
  meshes.push(headSeg.build(head, material));

  let hair: TransformNode | null = null;
  if (data.hairStyle === 'longLoose') {
    // Pelo largo y suelto: mechones afinados que caen por la espalda desde la nuca.
    hair = node(`${id}-hair`, scene, head, 0, 0.3, -0.13);
    const hairSeg = new SegmentBuilder(scene, `${id}-hairSeg`);
    const strands: [number, number, number][] = [
      [-0.2, 0.62, 0.03],
      [-0.13, 0.72, 0],
      [-0.05, 0.78, -0.02],
      [0.04, 0.78, -0.02],
      [0.12, 0.72, 0],
      [0.19, 0.62, 0.03],
    ];
    for (const [x, length, z] of strands) {
      hairSeg.cylinder(length, 0.15, 0.04, c.hair, { x, y: -length / 2, z, rz: -x * 0.25 }, 4);
    }
    hairSeg.box(0.42, 0.18, 0.1, c.hair, { y: -0.05, z: 0.02 });
    meshes.push(hairSeg.build(hair, material));
  }

  // Capa (Alba) o colas de la bufanda (Ciro).
  const cloth = node(`${id}-cloth`, scene, torso, 0, 0.44, -0.14);
  const clothSeg = new SegmentBuilder(scene, `${id}-clothSeg`);
  if (data.accessory === 'cape') {
    clothSeg.box(0.46, 0.58, 0.03, c.cloth, { y: -0.29 }).box(0.48, 0.05, 0.04, c.accent, { y: -0.57 });
  } else {
    clothSeg
      .box(0.1, 0.62, 0.025, c.cloth, { x: 0.05, y: -0.3, rz: 0.06 })
      .box(0.09, 0.5, 0.025, c.cloth, { x: 0.15, y: -0.24, rz: 0.2 });
  }
  meshes.push(clothSeg.build(cloth, material));

  // Brazos: hombro → codo → mano.
  const makeArm = (side: number): { shoulder: TransformNode; elbow: TransformNode } => {
    const shoulder = node(`${id}-shoulder${side}`, scene, torso, side * 0.26, 0.37, 0);
    const elbow = node(`${id}-elbow${side}`, scene, shoulder, 0, -0.29, 0);
    meshes.push(
      new SegmentBuilder(scene, `${id}-upperArm${side}`)
        .ico(0.075, c.outfitDark, { y: -0.01 })
        .cylinder(0.29, 0.11, 0.09, c.outfit, { y: -0.145 })
        .build(shoulder, material),
    );
    meshes.push(
      new SegmentBuilder(scene, `${id}-foreArm${side}`)
        .cylinder(0.26, 0.085, 0.075, c.skin, { y: -0.13 })
        .cylinder(0.07, 0.1, 0.1, c.accent, { y: -0.21 })
        .box(0.08, 0.09, 0.08, c.skin, { y: -0.29 })
        .build(elbow, material),
    );
    return { shoulder, elbow };
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);

  // La Hoja de Luz en la mano derecha: empuñadura y guarda con el material del cuerpo; la hoja brilla.
  const sword = node(`${id}-sword`, scene, armR.elbow, 0, -0.3, 0.02);
  meshes.push(
    new SegmentBuilder(scene, `${id}-hilt`)
      .cylinder(0.18, 0.045, 0.045, BLADE_COLORS.hilt, { y: 0.02 })
      .box(0.22, 0.045, 0.07, BLADE_COLORS.guard, { y: 0.12 })
      .build(sword, material),
  );
  const blade = CreateBox(`${id}-blade`, { width: 0.075, height: 0.82, depth: 0.025 }, scene);
  blade.position.y = 0.55;
  blade.parent = sword;
  blade.material = materials.get(BLADE_COLORS.blade, { unlit: true });
  blade.isPickable = false;
  meshes.push(blade);

  // Piernas: cadera → rodilla → bota.
  const makeLeg = (side: number): { hip: TransformNode; knee: TransformNode } => {
    const hip = node(`${id}-hip${side}`, scene, hips, side * 0.1, -0.08, 0);
    const knee = node(`${id}-knee${side}`, scene, hip, 0, -0.37, 0);
    meshes.push(
      new SegmentBuilder(scene, `${id}-thigh${side}`)
        .cylinder(0.37, 0.14, 0.11, c.pants, { y: -0.185 })
        .build(hip, material),
    );
    meshes.push(
      new SegmentBuilder(scene, `${id}-shin${side}`)
        .cylinder(0.24, 0.1, 0.09, c.pants, { y: -0.12 })
        .box(0.13, 0.2, 0.15, c.boots, { y: -0.3 })
        .box(0.13, 0.08, 0.22, c.boots, { y: -0.37, z: 0.035 })
        .build(knee, material),
    );
    return { hip, knee };
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  for (const mesh of meshes) {
    applyOutline(mesh, outlineColor, OUTLINE_WIDTH);
    shadows?.addShadowCaster(mesh);
  }

  return {
    root,
    body,
    hips,
    torso,
    head,
    hair,
    cloth,
    shoulderL: armL.shoulder,
    elbowL: armL.elbow,
    shoulderR: armR.shoulder,
    elbowR: armR.elbow,
    sword,
    hipL: legL.hip,
    kneeL: legL.knee,
    hipR: legR.hip,
    kneeR: legR.knee,
    blade,
    meshes,
    dispose() {
      if (shadows) for (const m of meshes) shadows.removeShadowCaster(m);
      root.dispose(false, true);
    },
  };
}
