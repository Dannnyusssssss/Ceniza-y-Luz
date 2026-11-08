import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Animation } from '@babylonjs/core/Animations/animation';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { clamp, damp } from '../core/math';
import { PLAYER_BALANCE } from '../data/balance';
import { ClipMixer, type ClipSample, type ClipTable, type MixInput } from './clipMix';

/** Huesos que no llevan claves en los clips: se balancean por código. */
const SECONDARY: Readonly<Record<string, { readonly lag: number; readonly flutter: number }>> = {
  'hair.1': { lag: 0.35, flutter: 0.05 },
  'hair.2': { lag: 0.3, flutter: 0.07 },
  cape: { lag: 0.75, flutter: 0.06 },
  scarf: { lag: 0.85, flutter: 0.09 },
};

interface Track {
  readonly node: TransformNode;
  rotation: Animation | null;
  position: Animation | null;
}

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
const tmpV = new Vector3();

/**
 * Anima un personaje de Blender mezclando sus clips a mano: se evalúa cada clip en el fotograma que decide
 * `ClipMixer` y se combinan los huesos por peso. Los grupos de animación de Babylon no se reproducen.
 */
export class CharacterAnimator {
  private readonly mixer: ClipMixer;
  private readonly clips = new Map<string, Track[]>();
  private readonly secondary: Secondary[] = [];
  private readonly rotations = new Map<TransformNode, { q: Quaternion; w: number }>();
  private readonly positions = new Map<TransformNode, { v: Vector3; w: number }>();
  private time = 0;
  private sway = 0;

  constructor(
    groups: ReadonlyMap<string, AnimationGroup>,
    nodes: readonly TransformNode[],
    table: ClipTable,
  ) {
    this.mixer = new ClipMixer(table);
    for (const [name, group] of groups) {
      const tracks = new Map<TransformNode, Track>();
      for (const { animation, target } of group.targetedAnimations) {
        const node = target as TransformNode;
        const track = tracks.get(node) ?? { node, rotation: null, position: null };
        if (animation.targetProperty === 'rotationQuaternion') track.rotation = animation;
        else if (animation.targetProperty === 'position') track.position = animation;
        tracks.set(node, track);
      }
      this.clips.set(name, [...tracks.values()]);
    }
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
    this.apply(this.mixer.update(input, dt));
    this.applySecondary(input, dt);
  }

  private apply(samples: readonly ClipSample[]): void {
    this.rotations.clear();
    this.positions.clear();
    for (const sample of samples) {
      const tracks = this.clips.get(sample.clip);
      if (!tracks) continue;
      for (const track of tracks) {
        if (track.rotation) {
          const q = track.rotation.evaluate(sample.frame) as Quaternion;
          const acc = this.rotations.get(track.node);
          if (!acc) this.rotations.set(track.node, { q: q.scale(sample.weight), w: sample.weight });
          else {
            // Mismo hemisferio antes de sumar, para que la mezcla no dé la vuelta larga.
            const sign = Quaternion.Dot(acc.q, q) < 0 ? -1 : 1;
            q.scaleToRef(sample.weight * sign, tmpQ);
            acc.q.addInPlace(tmpQ);
            acc.w += sample.weight;
          }
        }
        if (track.position) {
          const v = track.position.evaluate(sample.frame) as Vector3;
          const acc = this.positions.get(track.node);
          if (!acc) this.positions.set(track.node, { v: v.scale(sample.weight), w: sample.weight });
          else {
            v.scaleToRef(sample.weight, tmpV);
            acc.v.addInPlace(tmpV);
            acc.w += sample.weight;
          }
        }
      }
    }
    for (const [node, acc] of this.rotations) {
      node.rotationQuaternion ??= new Quaternion();
      node.rotationQuaternion.copyFrom(acc.q).normalize();
    }
    for (const [node, acc] of this.positions) {
      if (acc.w > 0) node.position.copyFrom(acc.v).scaleInPlace(1 / acc.w);
    }
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
