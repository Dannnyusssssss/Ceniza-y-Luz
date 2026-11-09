import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Axis } from '@babylonjs/core/Maths/math.axis';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { approach, wrapAngle } from '../core/math';
import { MODELS } from '../data/generated/models';
import { NPCS } from '../data/npcs';
import type { AbilityId } from '../data/items';
import { PUZZLES, type BlocksPuzzle, type SequencePuzzle } from '../data/puzzles';
import type { NpcId, ZoneData } from '../data/zones';
import { MODELS_URL, type LoadedModel } from '../engine/models';
import { isGateOpen, type AdventureState } from '../game/adventure';
import { hasFlag } from '../game/progress';
import { cellCenter } from '../game/puzzles';
import { groundHeight } from '../world/terrain';
import { ClipEvaluator } from './clipEvaluator';
import { CLIP_FPS, type ClipTable } from './clipMix';
import { MeshBuilder } from './meshBuilder';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import type { ToonMaterials } from './toon';

/** Modelos de los objetos del mundo. */
export interface PropModels {
  readonly chest: LoadedModel;
  readonly beacon: LoadedModel;
  readonly switchStone: LoadedModel;
  readonly pushblock: LoadedModel;
  readonly plate: LoadedModel;
  readonly gate: LoadedModel;
  readonly torch: LoadedModel;
  readonly prism: LoadedModel;
  readonly shrine: LoadedModel;
  readonly crystalWall: LoadedModel;
  readonly blade: LoadedModel;
  readonly npcs: Readonly<Record<NpcId, LoadedModel>>;
}

const LID_OPEN = 1.95;
const LID_SPEED = 3.2;
const GATE_WIDTH = 4;
const GATE_DROP = 3.15;
const GATE_SPEED = 1.1;
/** Velocidad a la que se ve deslizar un bloque empujado (m/s). */
const BLOCK_SPEED = 5;
const SYMBOL_COLORS = { idle: '#7f93a8', lit: '#ffd98a' };
/** Altura de cada pieza: del símbolo que la identifica y de la llama cuando se enciende. */
const PIECE_HEIGHTS = {
  stone: { symbol: 1.45, flame: 0 },
  torch: { symbol: 2.65, flame: 2.05 },
  prism: { symbol: 2.35, flame: 1.28 },
} as const;
const ORB_COLORS: Readonly<Record<AbilityId, string>> = { pulso: '#fff0b0', impulso: '#9fe9ff' };
/** Velocidad a la que se hunde una barrera de cristal rota. */
const CRYSTAL_SPEED = 2.4;
const CROSSFADE = 0.2;
/** Más lejos de esto un objeto no se dibuja (la niebla ya casi lo tapa): ahorra llamadas de dibujo. */
const VIEW_DISTANCE = 48;

/** Un modelo colocado en el mundo sobre un nodo propio (la raíz del glTF nunca se toca). */
class PlacedModel {
  readonly pivot: TransformNode;
  readonly model: ModelInstance;

  constructor(
    scene: Scene,
    source: LoadedModel,
    materials: ToonMaterials,
    shadows: ShadowGenerator,
    x: number,
    y: number,
    z: number,
    yaw: number,
    faceTexture?: string,
  ) {
    this.pivot = new TransformNode('prop', scene);
    this.pivot.position.set(x, y, z);
    this.pivot.rotation.y = yaw;
    this.model = instantiateModel(source, materials, shadows, { faceTexture });
    this.model.root.parent = this.pivot;
  }

  dispose(): void {
    this.model.dispose();
    this.pivot.dispose();
  }
}

/** Un personaje que no controla el jugador: reposo y hablar, con fundido entre los dos. */
export class ActorView {
  private readonly evaluator: ClipEvaluator;
  private readonly clips: ClipTable;
  private clip = 'idle';
  private previous: string | null = null;
  private fade = 0;
  private time = 0;

  constructor(
    readonly placed: PlacedModel,
    clips: ClipTable,
  ) {
    this.evaluator = new ClipEvaluator(placed.model.animations);
    this.clips = clips;
  }

  play(clip: string): void {
    if (clip === this.clip || !this.clips[clip]) return;
    this.previous = this.clip;
    this.clip = clip;
    this.fade = 1;
  }

  update(dt: number): void {
    this.time += dt;
    const frameOf = (name: string): number => {
      const info = this.clips[name];
      return info ? (this.time % info.seconds) * CLIP_FPS : 0;
    };
    if (this.previous && this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / CROSSFADE);
      this.evaluator.apply([
        { clip: this.previous, frame: frameOf(this.previous), weight: this.fade },
        { clip: this.clip, frame: frameOf(this.clip), weight: 1 - this.fade },
      ]);
    } else {
      this.evaluator.apply([{ clip: this.clip, frame: frameOf(this.clip), weight: 1 }]);
    }
  }

  dispose(): void {
    this.placed.dispose();
  }
}

/** Crea un personaje secundario con sus clips (aldeanos y enemigos de la intro). */
export function createActor(
  scene: Scene,
  source: LoadedModel,
  name: keyof typeof MODELS,
  materials: ToonMaterials,
  shadows: ShadowGenerator,
  x: number,
  y: number,
  z: number,
  yaw: number,
): ActorView {
  const manifest = MODELS[name];
  const textures: readonly string[] = manifest.textures;
  const texture = textures[0];
  const placed = new PlacedModel(
    scene,
    source,
    materials,
    shadows,
    x,
    y,
    z,
    yaw,
    texture ? MODELS_URL + texture : undefined,
  );
  return new ActorView(placed, manifest.clips as ClipTable);
}

interface ChestView {
  readonly id: string;
  readonly placed: PlacedModel;
  readonly lid: TransformNode | null;
  open: number;
}

interface GateView {
  readonly data: ZoneData['gates'][number];
  readonly placed: PlacedModel;
  readonly bars: TransformNode | null;
  drop: number;
}

interface BlockView {
  readonly placed: PlacedModel;
  readonly puzzle: BlocksPuzzle;
  readonly index: number;
}

interface SwitchView {
  readonly puzzle: SequencePuzzle;
  readonly id: string;
  readonly symbol: Mesh | null;
  readonly flame: Mesh | null;
}

interface CrystalWallView {
  readonly data: ZoneData['gates'][number];
  readonly placed: PlacedModel;
  gone: number;
}

interface ShrineView {
  readonly ability: AbilityId;
  readonly orb: Mesh;
  readonly baseY: number;
}

interface PlateView {
  readonly placed: PlacedModel;
  readonly puzzle: BlocksPuzzle;
  readonly cell: readonly [number, number];
}

interface NpcView {
  readonly id: NpcId;
  readonly actor: ActorView;
  readonly restYaw: number;
  yaw: number;
  targetYaw: number;
}

/** Los objetos de una zona: reflejan el estado de la aventura, nunca lo cambian. */
export class ZoneProps {
  private readonly all: PlacedModel[] = [];
  private readonly chests: ChestView[] = [];
  private readonly gates: GateView[] = [];
  private readonly blocks: BlockView[] = [];
  private readonly switches: SwitchView[] = [];
  private readonly plates: PlateView[] = [];
  private readonly npcs: NpcView[] = [];
  private readonly crystalWalls: CrystalWallView[] = [];
  private readonly shrines: ShrineView[] = [];
  private altarBlade: PlacedModel | null = null;
  private time = 0;

  constructor(
    private readonly scene: Scene,
    private readonly zone: ZoneData,
    private readonly models: PropModels,
    private readonly materials: ToonMaterials,
    private readonly shadows: ShadowGenerator,
    adventure: AdventureState,
    options: { readonly npcs: boolean },
  ) {
    const y = (x: number, z: number): number => groundHeight(zone, x, z);
    for (const c of zone.chests) {
      const placed = this.place(models.chest, c.x, y(c.x, c.z), c.z, c.yaw);
      const opened = adventure.progress.chests.includes(c.id);
      const view: ChestView = {
        id: c.id,
        placed,
        lid: placed.model.nodes.get('chestLid') ?? null,
        open: opened ? 1 : 0,
      };
      this.setLid(view);
      this.chests.push(view);
    }
    for (const b of zone.beacons) this.place(models.beacon, b.x, y(b.x, b.z), b.z, 0);
    for (const s of zone.shrines) {
      const ground = y(s.x, s.z);
      this.place(models.shrine, s.x, ground, s.z, 0);
      const builder = new MeshBuilder();
      builder.sphere(0.3, '#ffffff', { x: 0, y: 0, z: 0 }, 2);
      const orb = builder.build(
        `orb-${s.ability}`,
        scene,
        materials.get(ORB_COLORS[s.ability], { unlit: true }),
        false,
      );
      if (orb) {
        orb.position.set(s.x, ground + 1.95, s.z);
        this.shrines.push({ ability: s.ability, orb, baseY: ground + 1.95 });
      }
    }
    for (const gate of zone.gates) {
      // La barrera de niebla la dibuja el entorno; aquí solo están las rejas y el cristal.
      if (gate.style === 'mist') continue;
      if (gate.style === 'crystal') {
        const wall = this.place(
          models.crystalWall,
          gate.x,
          y(gate.x, gate.z),
          gate.z,
          gate.alongX ? 0 : Math.PI / 2,
        );
        wall.pivot.scaling.x = gate.width / GATE_WIDTH;
        const gone = isGateOpen(adventure, gate) ? 1 : 0;
        this.crystalWalls.push({ data: gate, placed: wall, gone });
        continue;
      }
      const placed = this.place(
        models.gate,
        gate.x,
        y(gate.x, gate.z),
        gate.z,
        gate.alongX ? 0 : Math.PI / 2,
      );
      placed.pivot.scaling.x = gate.width / GATE_WIDTH;
      const open = isGateOpen(adventure, gate);
      const view: GateView = {
        data: gate,
        placed,
        bars: placed.model.nodes.get('gateBars') ?? null,
        drop: open ? 1 : 0,
      };
      this.setBars(view);
      this.gates.push(view);
    }
    for (const data of PUZZLES) {
      if (data.zone !== zone.id) continue;
      if (data.kind === 'sequence') this.addSwitches(data);
      else this.addBlocks(data, adventure);
    }
    if (options.npcs) {
      for (const npc of zone.npcs) {
        const actor = createActor(
          scene,
          models.npcs[npc.id],
          npc.id,
          materials,
          shadows,
          npc.x,
          y(npc.x, npc.z),
          npc.z,
          npc.yaw,
        );
        actor.placed.pivot.scaling.setAll(NPCS[npc.id].heightScale);
        this.npcs.push({ id: npc.id, actor, restYaw: npc.yaw, yaw: npc.yaw, targetYaw: npc.yaw });
      }
    }
    if (zone.altar && !hasFlag(adventure.progress, 'bladeTaken')) {
      this.altarBlade = this.place(
        models.blade,
        zone.altar.x,
        y(zone.altar.x, zone.altar.z) + 1.85,
        zone.altar.z,
        0,
      );
      this.altarBlade.pivot.scaling.setAll(1.5);
    }
  }

  private place(source: LoadedModel, x: number, y: number, z: number, yaw: number): PlacedModel {
    const placed = new PlacedModel(this.scene, source, this.materials, this.shadows, x, y, z, yaw);
    this.all.push(placed);
    return placed;
  }

  private addSwitches(data: SequencePuzzle): void {
    const piece = data.piece ?? 'stone';
    const model =
      piece === 'torch' ? this.models.torch : piece === 'prism' ? this.models.prism : this.models.switchStone;
    const heights = PIECE_HEIGHTS[piece];
    for (const s of data.switches) {
      const ground = groundHeight(this.zone, s.x, s.z);
      this.place(model, s.x, ground, s.z, 0);
      const builder = new MeshBuilder();
      // Blanco: el material decide el color (apagado o encendido).
      builder.symbol(s.symbol, 0.26, '#ffffff', { x: s.x, y: ground + heights.symbol, z: s.z });
      const symbol = builder.build(
        `symbol-${s.id}`,
        this.scene,
        this.materials.get(SYMBOL_COLORS.idle, { unlit: true }),
      );
      let flame: Mesh | null = null;
      if (heights.flame > 0) {
        const glow = new MeshBuilder();
        glow.sphere(0.36, '#ffffff', { x: s.x, y: ground + heights.flame, z: s.z, sy: 1.25 });
        flame = glow.build(
          `flame-${s.id}`,
          this.scene,
          this.materials.get(SYMBOL_COLORS.lit, { unlit: true }),
        );
        flame?.setEnabled(false);
      }
      this.switches.push({ puzzle: data, id: s.id, symbol, flame });
    }
  }

  private addBlocks(data: BlocksPuzzle, adventure: AdventureState): void {
    for (const cell of data.plates) {
      const c = cellCenter(data, cell);
      const placed = this.place(this.models.plate, c.x, groundHeight(this.zone, c.x, c.z), c.z, 0);
      this.plates.push({ placed, puzzle: data, cell });
    }
    const state = adventure.puzzles.get(data.id);
    (state?.blocks ?? []).forEach((cell, index) => {
      const c = cellCenter(data, cell);
      const placed = this.place(this.models.pushblock, c.x, groundHeight(this.zone, c.x, c.z), c.z, 0);
      this.blocks.push({ placed, puzzle: data, index });
    });
  }

  private setLid(view: ChestView): void {
    if (!view.lid) return;
    view.lid.rotationQuaternion = Quaternion.RotationAxis(Axis.X, view.open * LID_OPEN);
  }

  private setBars(view: GateView): void {
    if (!view.bars) return;
    view.bars.position.y = -view.drop * GATE_DROP;
    // Del todo abierta, las rejas bajo tierra no se dibujan.
    view.bars.setEnabled(view.drop < 1);
  }

  /** Un aldeano se gira hacia quien le habla y gesticula. `null` lo devuelve a su sitio. */
  setTalking(id: NpcId | null, x = 0, z = 0): void {
    for (const npc of this.npcs) {
      if (npc.id === id) {
        const p = npc.actor.placed.pivot.position;
        npc.targetYaw = Math.atan2(x - p.x, z - p.z);
        npc.actor.play('talk');
      } else {
        npc.targetYaw = npc.restYaw;
        npc.actor.play('idle');
      }
    }
  }

  /** Se llama en la pantalla de elección y en juego: todo lo vivo sigue moviéndose suavemente. */
  update(
    adventure: AdventureState,
    dt: number,
    reduceMotion: boolean,
    viewerX: number,
    viewerZ: number,
  ): void {
    this.time += dt;
    const { progress } = adventure;
    for (const placed of this.all) {
      const p = placed.pivot.position;
      placed.pivot.setEnabled(Math.hypot(p.x - viewerX, p.z - viewerZ) < VIEW_DISTANCE);
    }
    for (const view of this.chests) {
      const target = progress.chests.includes(view.id) ? 1 : 0;
      if (view.open !== target) {
        view.open = approach(view.open, target, LID_SPEED * dt);
        this.setLid(view);
      }
    }
    for (const view of this.gates) {
      const target = isGateOpen(adventure, view.data) ? 1 : 0;
      if (view.drop !== target) {
        view.drop = approach(view.drop, target, GATE_SPEED * dt);
        this.setBars(view);
      }
    }
    for (const view of this.blocks) {
      const cell = adventure.puzzles.get(view.puzzle.id)?.blocks[view.index];
      if (!cell) continue;
      const c = cellCenter(view.puzzle, cell);
      const p = view.placed.pivot.position;
      p.x = approach(p.x, c.x, BLOCK_SPEED * dt);
      p.z = approach(p.z, c.z, BLOCK_SPEED * dt);
      p.y = groundHeight(this.zone, p.x, p.z);
    }
    for (const view of this.plates) {
      const blocks = adventure.puzzles.get(view.puzzle.id)?.blocks ?? [];
      const pressed = blocks.some((b) => b[0] === view.cell[0] && b[1] === view.cell[1]);
      const c = cellCenter(view.puzzle, view.cell);
      view.placed.pivot.position.y = groundHeight(this.zone, c.x, c.z) - (pressed ? 0.06 : 0);
    }
    for (const view of this.switches) {
      if (!view.symbol) continue;
      const state = adventure.puzzles.get(view.puzzle.id);
      const order = view.puzzle.order.indexOf(view.id);
      const lit = !!state && (state.solved || order < state.pressed);
      const color = lit ? SYMBOL_COLORS.lit : SYMBOL_COLORS.idle;
      view.symbol.material = this.materials.get(color, { unlit: true });
      view.flame?.setEnabled(lit);
    }
    for (const view of this.crystalWalls) {
      const target = isGateOpen(adventure, view.data) ? 1 : 0;
      if (view.gone !== target) {
        view.gone = approach(view.gone, target, CRYSTAL_SPEED * dt);
        view.placed.pivot.scaling.y = 1 - view.gone;
      }
      // Va después del recorte por distancia: una barrera rota no vuelve a activarse.
      if (view.gone >= 1) view.placed.pivot.setEnabled(false);
    }
    for (const view of this.shrines) {
      const learned = progress.abilities.includes(view.ability);
      view.orb.setEnabled(!learned);
      if (!learned && !reduceMotion) view.orb.position.y = view.baseY + Math.sin(this.time * 1.4) * 0.06;
    }
    for (const npc of this.npcs) {
      const diff = wrapAngle(npc.targetYaw - npc.yaw);
      npc.yaw = wrapAngle(npc.yaw + Math.max(-dt * 4, Math.min(dt * 4, diff)));
      npc.actor.placed.pivot.rotation.y = npc.yaw;
      npc.actor.update(dt);
    }
    if (this.altarBlade) {
      if (hasFlag(progress, 'bladeTaken')) {
        this.all.splice(this.all.indexOf(this.altarBlade), 1);
        this.altarBlade.dispose();
        this.altarBlade = null;
      } else {
        const pivot = this.altarBlade.pivot;
        pivot.rotation.y += dt * (reduceMotion ? 0.2 : 0.7);
        if (!reduceMotion && this.zone.altar) {
          const base = groundHeight(this.zone, this.zone.altar.x, this.zone.altar.z) + 1.85;
          pivot.position.y = base + Math.sin(this.time * 1.4) * 0.05;
        }
      }
    }
  }

  dispose(): void {
    for (const placed of this.all) placed.dispose();
    this.all.length = 0;
    for (const npc of this.npcs) npc.actor.dispose();
    this.npcs.length = 0;
    for (const view of this.switches) {
      view.symbol?.dispose();
      view.flame?.dispose();
    }
    this.switches.length = 0;
    for (const view of this.shrines) view.orb.dispose();
    this.shrines.length = 0;
    this.crystalWalls.length = 0;
  }
}
