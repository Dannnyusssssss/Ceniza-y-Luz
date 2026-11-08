import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { clamp, damp } from '../core/math';
import { PLAYER_BALANCE } from '../data/balance';
import { ClipEvaluator } from './clipEvaluator';
import { ClipMixer, type ClipTable, type MixInput } from './clipMix';

/** Huesos que no llevan claves en los clips: se balancean por código. */
const SECONDARY: Readonly<Record<string, { readonly lag: number; readonly flutter: number }>> = {
  'hair.1': { lag: 0.35, flutter: 0.05 },
  'hair.2': { lag: 0.3, flutter: 0.07 },
  cape: { lag: 0.75, flutter: 0.06 },
  scarf: { lag: 0.85, flutter: 0.09 },
};

interface Secondary {
  readonly node: TransformNode;
  readonly rest: Quaternion;
  readonly lag: number;
  readonly flutter: number;
  readonly seed: number;
}

/** Datos de un fotograma para animar al personaje. */
export interface AnimatorInput extends MixInput {
  /** "Reducir movimiento": atenúa el ondear del pelo, la capa y la bufanda. */
  readonly reduceMotion: boolean;
}

const tmpQ = new Quaternion();

/**
 * Anima un personaje de Blender: `ClipMixer` decide clips y pesos, `ClipEvaluator` los aplica a los huesos,
 * y el pelo, la capa y la bufanda se balancean por código.
 */
export class CharacterAnimator {
  private readonly mixer: ClipMixer;
  private readonly evaluator: ClipEvaluator;
  private readonly secondary: Secondary[] = [];
  private time = 0;
  private sway = 0;

  constructor(
    groups: ReadonlyMap<string, AnimationGroup>,
    nodes: readonly TransformNode[],
    table: ClipTable,
  ) {
    this.mixer = new ClipMixer(table);
    this.evaluator = new ClipEvaluator(groups);
    let seed = 0;
    for (const node of nodes) {
      const config = SECONDARY[node.name];
      if (!config) continue;
      node.rotationQuaternion ??= Quaternion.FromEulerVector(node.rotation);
      this.secondary.push({ node, rest: node.rotationQuaternion.clone(), ...config, seed: seed++ * 1.7 });
    }
  }

  update(input: AnimatorInput, dt: number): void {
    this.time += dt;
    this.evaluator.apply(this.mixer.update(input, dt));
    this.applySecondary(input, dt);
  }

  /** Pelo largo, capa y bufanda: se quedan atrás con la velocidad y ondean un poco. */
  private applySecondary(input: AnimatorInput, dt: number): void {
    const target = clamp(input.speed / PLAYER_BALANCE.runSpeed, 0, 1);
    this.sway = damp(this.sway, target, 5, dt);
    const flutterScale = input.reduceMotion ? 0.25 : 1;
    for (const s of this.secondary) {
      const flutter = Math.sin(this.time * 2.4 + s.seed) * s.flutter * flutterScale * (0.4 + this.sway);
      const angle = s.lag * this.sway + flutter;
      // Giro sobre el eje X propio del hueso (el eje lateral). Con ángulo positivo la punta iría hacia delante,
      // dentro del cuerpo; por eso se gira en negativo: el pelo y la tela se van hacia atrás.
      Quaternion.RotationAxisToRef(Vector3.RightReadOnly, -angle, tmpQ);
      s.rest.multiplyToRef(tmpQ, s.node.rotationQuaternion ?? (s.node.rotationQuaternion = new Quaternion()));
    }
  }
}
