import type { BlockData } from '../data/arena';
import { DUMMY_BALANCE } from '../data/balance';
import type { AdventureState } from '../game/adventure';
import type { DummyState } from '../game/dummy';

/** Los bloques sólidos de cada paso: los de la zona y el muñeco en pie. Solo se rehacen si algo cambió. */
export class SolidBlocks {
  private blocks: readonly BlockData[] = [];
  private source: readonly BlockData[] | null = null;
  private withDummy = false;

  /** Olvida la lista (al cambiar de zona). */
  invalidate(): void {
    this.source = null;
  }

  get(adventure: AdventureState, dummy: DummyState): readonly BlockData[] {
    const withDummy = adventure.zone.dummy !== null && dummy.respawn <= 0;
    if (this.source !== adventure.blocks || this.withDummy !== withDummy) {
      this.source = adventure.blocks;
      this.withDummy = withDummy;
      const r = DUMMY_BALANCE.radius * 0.7;
      this.blocks = withDummy
        ? [...adventure.blocks, { x: dummy.x, z: dummy.z, halfX: r, halfZ: r, height: 3, kind: 'prop' }]
        : adventure.blocks;
    }
    return this.blocks;
  }
}
