import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { LoadedModel } from '../engine/models';
import type { ToonMaterials } from './toon';

/** Nombres de material que exporta Blender y que el juego reconoce. */
export const MODEL_MATERIALS = ['toon', 'outline', 'glow', 'face'] as const;

/** Opciones al crear una copia: textura de la cara (piezas con material "face"). */
export interface InstanceOptions {
  readonly faceTexture?: string;
}

/** Copia de un modelo en la escena. */
export interface ModelInstance {
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  /** Nodos del modelo (incluidos los huesos), por nombre. */
  readonly nodes: ReadonlyMap<string, TransformNode>;
  readonly skeleton: Skeleton | null;
  readonly animations: ReadonlyMap<string, AnimationGroup>;
  dispose(): void;
}

/**
 * Crea una copia del modelo en la escena con los materiales de estilo anime.
 * Solo las partes con bandas de luz proyectan sombra (el contorno y el brillo no).
 */
export function instantiateModel(
  model: LoadedModel,
  materials: ToonMaterials,
  shadows: ShadowGenerator | null,
  options: InstanceOptions = {},
): ModelInstance {
  // Copias completas, no instancias: cada copia necesita su propio material, transparencia y destello de golpe
  // (las instancias comparten todo eso con una malla original que ni siquiera está en la escena).
  const entries = model.container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
  const root = entries.rootNodes[0] as TransformNode;
  const meshes = root.getChildMeshes(false);
  for (const mesh of meshes) {
    const name = model.materialByMesh.get(mesh.name);
    mesh.isPickable = false;
    // El color por vértice del glTF trae canal alfa (siempre 1): sin esto Babylon trataría la malla como
    // transparente, no escribiría profundidad y unas partes se verían a través de otras.
    mesh.hasVertexAlpha = false;
    if (!name) continue;
    if (name === 'face' && options.faceTexture) mesh.material = materials.modelFace(options.faceTexture);
    else mesh.material = name === 'toon' ? materials.modelToon() : materials.modelUnlit();
    // El cuerpo proyecta y recibe sombra; la cara solo la recibe (está pegada a la cabeza).
    if (name === 'toon' || name === 'face') mesh.receiveShadows = true;
    if (name === 'toon') shadows?.addShadowCaster(mesh, false);
  }
  const nodes = new Map<string, TransformNode>();
  for (const node of root.getDescendants(false)) {
    if ('position' in node) nodes.set(node.name, node as TransformNode);
  }
  const animations = new Map(entries.animationGroups.map((g) => [g.name, g]));
  for (const group of animations.values()) group.stop();
  return {
    root,
    meshes,
    nodes,
    skeleton: entries.skeletons[0] ?? null,
    animations,
    dispose() {
      if (shadows) for (const m of meshes) shadows.removeShadowCaster(m, false);
      for (const g of animations.values()) g.dispose();
      for (const s of entries.skeletons) s.dispose();
      root.dispose(false, false);
    },
  };
}
