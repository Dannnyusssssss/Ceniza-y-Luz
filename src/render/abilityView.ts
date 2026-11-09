import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { lerp } from '../core/math';
import { ABILITY_BALANCE } from '../data/items';
import type { AbilityState } from '../game/abilities';
import type { ToonMaterials } from './toon';

const PULSE_COLOR = '#fff0b0';
/** Altura del disparo sobre el suelo. */
const PULSE_HEIGHT = 1.1;

/** Los disparos del Pulso en vuelo: una esfera de luz que no cambia de brillo. */
export class AbilityView {
  private readonly meshes = new Map<number, Mesh>();

  constructor(
    private readonly scene: Scene,
    private readonly materials: ToonMaterials,
    private readonly groundAt: () => (x: number, z: number) => number,
  ) {}

  update(state: AbilityState, alpha: number): void {
    const alive = new Set<number>();
    for (const p of state.pulses) {
      alive.add(p.id);
      let mesh = this.meshes.get(p.id);
      if (!mesh) {
        mesh = CreateIcoSphere(
          `pulse${p.id}`,
          { radius: ABILITY_BALANCE.pulso.radius, subdivisions: 2 },
          this.scene,
        );
        mesh.material = this.materials.get(PULSE_COLOR, { unlit: true });
        mesh.isPickable = false;
        this.meshes.set(p.id, mesh);
      }
      const x = lerp(p.prevX, p.x, alpha);
      const z = lerp(p.prevZ, p.z, alpha);
      mesh.position.set(x, this.groundAt()(x, z) + PULSE_HEIGHT, z);
    }
    for (const [id, mesh] of this.meshes) {
      if (alive.has(id)) continue;
      mesh.dispose();
      this.meshes.delete(id);
    }
  }

  clear(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
  }
}
