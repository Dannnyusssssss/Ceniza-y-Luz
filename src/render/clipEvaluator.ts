import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Animation } from '@babylonjs/core/Animations/animation';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ClipSample } from './clipMix';

interface Track {
  readonly node: TransformNode;
  rotation: Animation | null;
  position: Animation | null;
  scaling: Animation | null;
}

const tmpQ = new Quaternion();
const tmpV = new Vector3();

/**
 * Aplica a los huesos una mezcla de clips: evalúa cada clip en su fotograma y combina por peso
 * giros, posiciones y escalas. Los grupos de animación de Babylon no se reproducen: el juego decide el fotograma.
 */
export class ClipEvaluator {
  private readonly clips = new Map<string, Track[]>();
  private readonly rotations = new Map<TransformNode, { q: Quaternion; w: number }>();
  private readonly positions = new Map<TransformNode, { v: Vector3; w: number }>();
  private readonly scalings = new Map<TransformNode, { v: Vector3; w: number }>();

  constructor(groups: ReadonlyMap<string, AnimationGroup>) {
    for (const [name, group] of groups) {
      const tracks = new Map<TransformNode, Track>();
      for (const { animation, target } of group.targetedAnimations) {
        const node = target as TransformNode;
        const track = tracks.get(node) ?? { node, rotation: null, position: null, scaling: null };
        if (animation.targetProperty === 'rotationQuaternion') track.rotation = animation;
        else if (animation.targetProperty === 'position') track.position = animation;
        else if (animation.targetProperty === 'scaling') track.scaling = animation;
        tracks.set(node, track);
      }
      this.clips.set(name, [...tracks.values()]);
    }
  }

  has(clip: string): boolean {
    return this.clips.has(clip);
  }

  apply(samples: readonly ClipSample[]): void {
    this.rotations.clear();
    this.positions.clear();
    this.scalings.clear();
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
        if (track.position) accumulate(this.positions, track.node, track.position, sample);
        if (track.scaling) accumulate(this.scalings, track.node, track.scaling, sample);
      }
    }
    for (const [node, acc] of this.rotations) {
      node.rotationQuaternion ??= new Quaternion();
      node.rotationQuaternion.copyFrom(acc.q).normalize();
    }
    for (const [node, acc] of this.positions) {
      if (acc.w > 0) node.position.copyFrom(acc.v).scaleInPlace(1 / acc.w);
    }
    for (const [node, acc] of this.scalings) {
      if (acc.w > 0) node.scaling.copyFrom(acc.v).scaleInPlace(1 / acc.w);
    }
  }
}

function accumulate(
  map: Map<TransformNode, { v: Vector3; w: number }>,
  node: TransformNode,
  animation: Animation,
  sample: ClipSample,
): void {
  const v = animation.evaluate(sample.frame) as Vector3;
  const acc = map.get(node);
  if (!acc) map.set(node, { v: v.scale(sample.weight), w: sample.weight });
  else {
    v.scaleToRef(sample.weight, tmpV);
    acc.v.addInPlace(tmpV);
    acc.w += sample.weight;
  }
}
