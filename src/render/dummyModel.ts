import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { DummyState } from '../game/dummy';
import { applyOutline, type ToonMaterials } from './toon';
import { SegmentBuilder } from './segmentBuilder';

const COLORS = {
  wood: '#8a5a3b',
  straw: '#e3c27a',
  strawDark: '#c39a52',
  rope: '#7b4e2f',
  target: '#c8553d',
  barBack: '#2a2233',
  barFill: '#f2c14e',
} as const;

const BAR_WIDTH = 1.1;
/** Tiempo que tarda el muñeco en desvanecerse en ceniza y en reaparecer. */
const FADE_SECONDS = 0.6;

/** Muñeco de práctica: poste, cuerpo de paja con diana y barra de vida flotante. */
export class DummyView {
  private readonly root: TransformNode;
  private readonly body: Mesh;
  private readonly barFill: Mesh;
  private readonly barRoot: TransformNode;
  private wobble = 0;

  constructor(scene: Scene, materials: ToonMaterials, shadows: ShadowGenerator, outline: string) {
    this.root = new TransformNode('dummy', scene);
    this.body = new SegmentBuilder(scene, 'dummyBody')
      .cylinder(1.5, 0.14, 0.16, COLORS.wood, { y: 0.75 })
      .box(1.1, 0.12, 0.12, COLORS.wood, { y: 1.2 })
      .ico(0.38, COLORS.straw, { y: 1.05, sy: 1.25 })
      .box(0.62, 0.08, 0.62, COLORS.rope, { y: 0.82 })
      .cylinder(0.05, 0.36, 0.36, COLORS.target, { y: 1.1, z: 0.3, rx: Math.PI / 2 }, 8)
      .cylinder(0.06, 0.16, 0.16, COLORS.straw, { y: 1.1, z: 0.32, rx: Math.PI / 2 }, 8)
      .ico(0.22, COLORS.strawDark, { y: 1.66 })
      .build(this.root, materials.get('#ffffff', { highlights: true }));
    applyOutline(this.body, outline, 0.015);
    shadows.addShadowCaster(this.body);
    this.body.overlayColor = Color3.White();

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

  /**
   * Actualiza la vista del muñeco. `flash` es la intensidad del destello de golpe (0 si "Reducir parpadeo"),
   * `reduceMotion` atenúa el bamboleo.
   */
  update(dummy: DummyState, flash: number, reduceMotion: boolean, frameSeconds: number): void {
    this.root.position.set(dummy.x, 0, dummy.z);
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
    this.body.visibility = visibility;
    this.body.position.y = -sink;
    this.barRoot.setEnabled(dummy.respawn <= 0);

    this.body.renderOverlay = flash > 0;
    this.body.overlayAlpha = 0.65 * flash;
  }
}
