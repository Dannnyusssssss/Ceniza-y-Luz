import type { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { CharacterData } from '../data/characters';
import { MODELS } from '../data/generated/models';
import { MODELS_URL, type LoadedModel } from '../engine/models';
import { CharacterAnimator, type AnimatorInput } from './characterAnimator';
import type { ClipTable } from './clipMix';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import type { ToonMaterials } from './toon';

const HURT_COLOR = Color3.FromHexString('#ff4d5e');

/** Hueso que sujeta la Hoja de Luz. */
export const BLADE_BONE = 'hand.R';

/**
 * Colocación de la Hoja en el puño, en el espacio del hueso de la mano (cuyo eje Y va hacia los dedos).
 * El origen de la Hoja es el centro de la empuñadura y su punta va hacia +Y.
 */
const BLADE_GRIP = {
  position: { x: 0, y: 0.045, z: 0 },
  rotation: Quaternion.FromEulerAngles(Math.PI / 2, 0, 0),
};

/** Un personaje de Blender en la escena: modelo, cara, Hoja en la mano y animación. */
export class CharacterView {
  /** Nodo que mueve el juego (posición y giro del jugador). */
  readonly root: TransformNode;
  private readonly model: ModelInstance;
  private readonly blade: ModelInstance;
  private readonly animator: CharacterAnimator;

  constructor(
    scene: Scene,
    data: CharacterData,
    model: LoadedModel,
    bladeModel: LoadedModel,
    materials: ToonMaterials,
    shadows: ShadowGenerator | null,
  ) {
    this.root = new TransformNode(`character-${data.id}`, scene);
    const manifest = MODELS[data.id];
    const faceTexture = manifest.textures[0];
    this.model = instantiateModel(model, materials, shadows, {
      faceTexture: faceTexture ? MODELS_URL + faceTexture : undefined,
    });
    this.model.root.parent = this.root;
    for (const mesh of this.model.meshes) mesh.overlayColor = HURT_COLOR;
    this.root.scaling.setAll(data.heightScale);

    this.blade = instantiateModel(bladeModel, materials, shadows);
    const hand = this.model.nodes.get(BLADE_BONE);
    if (hand) {
      // Nodo intermedio: la raíz del glTF de la Hoja conserva su propia conversión de ejes.
      const grip = new TransformNode('bladeGrip', scene);
      grip.parent = hand;
      grip.position.set(BLADE_GRIP.position.x, BLADE_GRIP.position.y, BLADE_GRIP.position.z);
      grip.rotationQuaternion = BLADE_GRIP.rotation.clone();
      this.blade.root.parent = grip;
    }

    const clips: ClipTable = manifest.clips;
    this.animator = new CharacterAnimator(this.model.animations, [...this.model.nodes.values()], clips);
  }

  /** Muestra u oculta la Hoja (antes de cogerla en el santuario, el personaje no la lleva). */
  setBladeVisible(visible: boolean): void {
    for (const mesh of this.blade.meshes) mesh.setEnabled(visible);
  }

  /** Transparencia del personaje (el gemelo arrastrado por la Bruma en la intro). */
  setVisibility(visibility: number): void {
    for (const mesh of [...this.model.meshes, ...this.blade.meshes]) mesh.visibility = visibility;
  }

  update(input: AnimatorInput, dt: number): void {
    this.animator.update(input, dt);
  }

  /** Tinte rojo suave al recibir un golpe (0 = sin tinte). Quien llama respeta "Reducir parpadeo". */
  setHurtTint(amount: number): void {
    for (const mesh of this.model.meshes) {
      mesh.renderOverlay = amount > 0;
      mesh.overlayAlpha = 0.45 * amount;
    }
  }

  dispose(): void {
    this.blade.dispose();
    this.model.dispose();
    this.root.dispose();
  }
}
