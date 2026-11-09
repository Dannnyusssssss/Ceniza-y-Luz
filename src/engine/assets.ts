import type { CharacterId } from '../data/characters';
import { ENEMY_KINDS, type EnemyKind } from '../data/enemies';
import { NPC_IDS } from '../data/npcs';
import type { NpcId } from '../data/zones';
import type { PropModels } from '../render/zoneProps';
import { loadModel, type LoadedModel } from './models';
import type { WorldScene } from './worldScene';

/** Modelos de Blender que necesita una partida, ya cargados. Se quedan en memoria: las zonas solo crean copias. */
export interface SessionAssets {
  readonly blade: LoadedModel;
  readonly dummy: LoadedModel;
  readonly characters: Readonly<Record<CharacterId, LoadedModel>>;
  readonly enemies: Readonly<Record<EnemyKind, LoadedModel>>;
  readonly guardian: LoadedModel;
  readonly regente: LoadedModel;
  readonly brazier: LoadedModel;
  readonly throne: LoadedModel;
  readonly props: PropModels;
}

/** Carga todos los modelos a la vez. `onProgress` recibe la fracción cargada (0..1). */
export async function loadAssets(
  world: WorldScene,
  onProgress: (fraction: number) => void,
): Promise<SessionAssets> {
  const files = [
    'blade',
    'dummy',
    'alba',
    'ciro',
    'chest',
    'beacon',
    'switch',
    'pushblock',
    'plate',
    'gate',
    'torch',
    'prism',
    'shrine',
    'crystalwall',
    'guardian',
    'regente',
    'brazier',
    'throne',
    ...ENEMY_KINDS,
    ...NPC_IDS,
  ];
  let done = 0;
  onProgress(0);
  const loaded = await Promise.all(
    files.map(async (name) => {
      const model = await loadModel(world.scene, `${name}.glb`);
      onProgress(++done / files.length);
      return [name, model] as const;
    }),
  );
  const byName = new Map(loaded);
  const get = (name: string): LoadedModel => {
    const model = byName.get(name);
    if (!model) throw new Error(`Falta el modelo ${name}`);
    return model;
  };
  const npcs = Object.fromEntries(NPC_IDS.map((id) => [id, get(id)])) as Record<NpcId, LoadedModel>;
  return {
    blade: get('blade'),
    dummy: get('dummy'),
    characters: { alba: get('alba'), ciro: get('ciro') },
    enemies: {
      brumilla: get('brumilla'),
      acechador: get('acechador'),
      coloso: get('coloso'),
      tirador: get('tirador'),
    },
    guardian: get('guardian'),
    regente: get('regente'),
    brazier: get('brazier'),
    throne: get('throne'),
    props: {
      chest: get('chest'),
      beacon: get('beacon'),
      switchStone: get('switch'),
      pushblock: get('pushblock'),
      plate: get('plate'),
      gate: get('gate'),
      torch: get('torch'),
      prism: get('prism'),
      shrine: get('shrine'),
      crystalWall: get('crystalwall'),
      blade: get('blade'),
      npcs,
    },
  };
}
