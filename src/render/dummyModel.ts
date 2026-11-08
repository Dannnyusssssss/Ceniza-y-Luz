import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { DummyState } from '../game/dummy';
import type { LoadedModel } from '../engine/models';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import type { ToonMaterials } from './toon';

const COLORS = {
  barBack: '#2a2233',
  barFill: '#f2c14e',
} as const;

const BAR_WIDTH = 1.1;
/** Tiempo que tarda el muñeco en desvanecerse en ceniza y en reaparecer. */
const FADE_SECONDS = 0.6;

/** Muñeco de práctica (modelo de Blender) con barra de vida flotante. */
export class DummyView {
  private readonly root: TransformNode;
  /** Pivote en la base del poste: el bamboleo y el hundimiento se aplican aquí. */
  private readonly body: TransformNode;
  private readonly model: ModelInstance;
  private readonly barFill: Mesh;
  private readonly barRoot: TransformNode;
  private wobble = 0;

  constructor(scene: Scene, model: LoadedModel, materials: ToonMaterials, shadows: ShadowGenerator) {
    this.root = new TransformNode('dummy', scene);
    this.body = new TransformNode('dummyBody', scene);
    this.body.parent = this.root;
    this.model = instantiateModel(model, materials, shadows);
    this.model.root.parent = this.body;
    for (const mesh of this.model.meshes) mesh.overlayColor = Color3.White();

    // Barra de vida: siempre mira a la cámara. El número exacto se muestra también como texto en el HUD.
    this.barRoot = new TransformNode('dummyBar', scene);
    this.barRoot.parent = this.root;
    this.barRoot.position.y = 2.15;
    const back = CreateBox('dummyBarBack', { width: BAR_WIDTH + 0.06, height: 0.14, depth: 0.02 }, scene);
    back.material = materials.get(COLORS.barBack, { unlit: true });
    back.parent = this.barRoot;
    this.barFill = CreateBox('dummyBarFill', { width: BAR_WIDTH, height: 0.09, depth: 0.03 }, scene);
    this.barFill.material = materials.get(COLORS.barFill, { unlit: true });
    this.barFill.parent = this.barRoot;
    this.barFill.position.z = -0.01;
    for (const m of [back, this.barFill]) {
      m.isPickable = false;
      m.applyFog = false;
    }
    // La barra entera mira a la cámara (no cada caja por separado), así el relleno queda delante del fondo.
    this.barRoot.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  }

  /** En las zonas sin muñeco no se dibuja. */
  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  /**
   * Actualiza la vista del muñeco. `flash` es la intensidad del destello de golpe (0 si "Reducir parpadeo"),
   * `reduceMotion` atenúa el bamboleo.
   */
  update(dummy: DummyState, flash: number, reduceMotion: boolean, frameSeconds: number, groundY = 0): void {
    this.root.position.set(dummy.x, groundY, dummy.z);
    const ratio = Math.max(0, dummy.health / dummy.maxHealth);
    this.barFill.scaling.x = Math.max(ratio, 0.0001);
    this.barFill.position.x = -(BAR_WIDTH * (1 - ratio)) / 2;

    // Bamboleo al recibir un golpe, que se apaga solo.
    const hitAge = dummy.sinceHit;
    const amp = (reduceMotion ? 0.06 : 0.18) * Math.max(0, 1 - hitAge / 0.5);
    this.wobble += frameSeconds * 22;
    this.body.rotation.x = Math.sin(this.wobble) * amp;

    // Desvanecerse en ceniza: se hunde y se vuelve transparente; al reaparecer, lo contrario.
    let visibility = 1;
    let sink = 0;
    if (dummy.respawn > 0) {
      const sinceDefeat = hitAge;
      const fadeOut = Math.min(sinceDefeat / FADE_SECONDS, 1);
      const fadeIn = dummy.respawn < FADE_SECONDS ? 1 - dummy.respawn / FADE_SECONDS : 0;
      visibility = Math.max(1 - fadeOut, fadeIn);
      sink = (1 - visibility) * 0.5;
    }
    this.body.position.y = -sink;
    this.barRoot.setEnabled(dummy.respawn <= 0);
    for (const mesh of this.model.meshes) {
      mesh.visibility = visibility;
      mesh.renderOverlay = flash > 0;
      mesh.overlayAlpha = 0.65 * flash;
    }
  }
}
