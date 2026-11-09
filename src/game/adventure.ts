import type { BlockData } from '../data/arena';
import type { AbilityId } from '../data/items';
import {
  puzzleById,
  PUZZLES,
  type BlocksPuzzle,
  type PuzzleData,
  type SequencePuzzle,
} from '../data/puzzles';
import type { BossId, GateData, GateKey, NpcId, SignTextId, ZoneData, ZoneId } from '../data/zones';
import { ZONES } from '../data/zones';
import { groundHeight } from '../world/terrain';
import { buildLayout, exitAt, gateBlock, type ZoneLayout } from '../world/zones';
import { dashCrosses } from './abilities';
import { hasFlag, setFlag, type Progress } from './progress';
import { openChest, type GrantResult } from './inventory';
import {
  cellCenter,
  createPuzzleState,
  pressSwitch,
  pushBlock,
  pushDirection,
  resetPuzzle,
  type PuzzleState,
} from './puzzles';

/** A esta distancia del borde de un objeto se puede interactuar con él. */
const REACH = 1.5;

/** Algo con lo que se puede interactuar en la zona actual. */
export type Interactable =
  | { readonly kind: 'npc'; readonly id: NpcId; readonly x: number; readonly z: number }
  | { readonly kind: 'chest'; readonly id: string; readonly x: number; readonly z: number }
  | {
      readonly kind: 'beacon';
      readonly id: string;
      readonly entry: string;
      readonly x: number;
      readonly z: number;
    }
  | { readonly kind: 'altar'; readonly x: number; readonly z: number }
  | { readonly kind: 'shrine'; readonly ability: AbilityId; readonly x: number; readonly z: number }
  | { readonly kind: 'gate'; readonly id: string; readonly x: number; readonly z: number }
  | { readonly kind: 'sign'; readonly text: SignTextId; readonly x: number; readonly z: number }
  | {
      readonly kind: 'switch';
      readonly puzzle: string;
      readonly id: string;
      readonly x: number;
      readonly z: number;
    }
  | {
      readonly kind: 'block';
      readonly puzzle: string;
      readonly index: number;
      readonly x: number;
      readonly z: number;
    }
  | { readonly kind: 'reset'; readonly puzzle: string; readonly x: number; readonly z: number }
  | { readonly kind: 'rescue'; readonly x: number; readonly z: number };

/** Lo que pasó al interactuar: lo atienden el sonido, los efectos y la interfaz. */
export type AdventureEvent =
  | { readonly type: 'talk'; readonly npc: NpcId }
  | { readonly type: 'read'; readonly text: SignTextId }
  | { readonly type: 'chestOpened'; readonly id: string; readonly result: GrantResult }
  | { readonly type: 'rest'; readonly beacon: string }
  | { readonly type: 'bladeTaken' }
  | { readonly type: 'abilityLearned'; readonly ability: AbilityId }
  | { readonly type: 'gateShattered'; readonly id: string; readonly x: number; readonly z: number }
  /** `byKey`: la abrió el jugador; si no, se abrió como efecto de otra cosa (y esa ya tiene su aviso). */
  | { readonly type: 'gateOpened'; readonly id: string; readonly byKey: boolean }
  | { readonly type: 'gateLocked'; readonly id: string; readonly opens: GateKey }
  | { readonly type: 'switchPressed'; readonly result: 'advance' | 'wrong' | 'solved' }
  | { readonly type: 'blockPushed' }
  | { readonly type: 'blockStuck' }
  | { readonly type: 'puzzleSolved'; readonly id: string }
  | { readonly type: 'puzzleReset'; readonly id: string }
  /** Se libera al gemelo: empieza el final. */
  | { readonly type: 'rescue' };

/** La zona en la que está el jugador con el estado de sus puzzles. Lógica pura, sin motor gráfico. */
export interface AdventureState {
  readonly progress: Progress;
  zone: ZoneData;
  layout: ZoneLayout;
  /** Bloques sólidos de la zona, con puertas y objetos; cambia al abrir una puerta o empujar un bloque. */
  blocks: readonly BlockData[];
  readonly puzzles: Map<string, PuzzleState>;
}

const layouts = new Map<ZoneId, ZoneLayout>();

/** La decoración de una zona siempre es la misma: se calcula una vez. */
function layoutOf(zone: ZoneData): ZoneLayout {
  let layout = layouts.get(zone.id);
  if (!layout) {
    layout = buildLayout(zone);
    layouts.set(zone.id, layout);
  }
  return layout;
}

function zonePuzzles(zone: ZoneData): readonly PuzzleData[] {
  return PUZZLES.filter((p) => p.zone === zone.id);
}

export function createAdventure(progress: Progress, zoneId: ZoneId): AdventureState {
  const adventure: AdventureState = {
    progress,
    zone: ZONES[zoneId],
    layout: layoutOf(ZONES[zoneId]),
    blocks: [],
    puzzles: new Map(),
  };
  enterZone(adventure, zoneId);
  return adventure;
}

/** Cambia de zona. Los puzzles a medias se reinician; los resueltos se quedan resueltos. */
export function enterZone(adventure: AdventureState, zoneId: ZoneId): void {
  adventure.zone = ZONES[zoneId];
  adventure.layout = layoutOf(adventure.zone);
  adventure.puzzles.clear();
  for (const data of zonePuzzles(adventure.zone)) {
    adventure.puzzles.set(data.id, createPuzzleState(data, adventure.progress.puzzles.includes(data.id)));
  }
  refreshGates(adventure);
  refreshBlocks(adventure);
}

/** True si la puerta está abierta. */
export function isGateOpen(adventure: AdventureState, gate: GateData): boolean {
  return adventure.progress.gates.includes(gate.id);
}

/** True si el jugador cumple lo que pide la puerta. */
export function gateRequirementMet(progress: Progress, opens: GateKey): boolean {
  switch (opens.kind) {
    case 'key':
      return progress.keys.includes(opens.key);
    case 'puzzle':
      return progress.puzzles.includes(opens.puzzle);
    case 'flag':
      return hasFlag(progress, opens.flag);
    case 'ability':
      return progress.abilities.includes(opens.ability);
    case 'boss':
      return progress.bosses.includes(opens.boss);
    case 'shatter':
      return false;
  }
}

/** Abre las puertas que no se abren a mano y cuya condición ya se cumple. Devuelve las que se abrieron. */
function refreshGates(adventure: AdventureState): string[] {
  const opened: string[] = [];
  for (const gate of adventure.zone.gates) {
    if (gate.opens.kind === 'key' || gate.opens.kind === 'shatter' || isGateOpen(adventure, gate)) continue;
    if (gateRequirementMet(adventure.progress, gate.opens)) {
      adventure.progress.gates.push(gate.id);
      opened.push(gate.id);
    }
  }
  return opened;
}

/** Recalcula los bloques sólidos: fijos, puertas cerradas, objetos y bloques de puzzle. */
export function refreshBlocks(adventure: AdventureState): void {
  const { zone, layout } = adventure;
  const list: BlockData[] = [...layout.blocks];
  const solid = (x: number, z: number, half: number, height: number): void => {
    list.push({ x, z, halfX: half, halfZ: half, height: height + groundHeight(zone, x, z), kind: 'prop' });
  };
  for (const gate of zone.gates) {
    if (!isGateOpen(adventure, gate)) list.push(gateBlock(gate, groundHeight(zone, gate.x, gate.z)));
  }
  for (const c of zone.chests) solid(c.x, c.z, 0.55, 0.9);
  for (const b of zone.beacons) solid(b.x, b.z, 0.5, 2.2);
  for (const n of zone.npcs) solid(n.x, n.z, 0.32, 1.6);
  for (const s of zone.shrines) solid(s.x, s.z, 0.7, 1.4);
  for (const s of zone.signs) solid(s.x, s.z, 0.2, 1.4);
  for (const data of zonePuzzles(zone)) {
    const state = adventure.puzzles.get(data.id);
    if (data.kind === 'sequence') {
      for (const s of data.switches) solid(s.x, s.z, 0.45, 1.1);
    } else if (state) {
      for (const cell of data.solids) {
        const c = cellCenter(data, cell);
        solid(c.x, c.z, data.cellSize / 2 - 0.1, 1.4);
      }
      for (const cell of state.blocks) {
        const c = cellCenter(data, cell);
        solid(c.x, c.z, data.cellSize / 2 - 0.1, 1.4);
      }
      solid(data.reset.x, data.reset.z, 0.4, 0.9);
    }
  }
  adventure.blocks = list;
}

/** Todo lo que se puede usar ahora en la zona. Lo abierto o resuelto deja de ofrecerse. */
export function listInteractables(adventure: AdventureState): Interactable[] {
  const { zone, progress } = adventure;
  const list: Interactable[] = [];
  for (const n of zone.npcs) list.push({ kind: 'npc', id: n.id, x: n.x, z: n.z });
  for (const c of zone.chests) {
    if (!progress.chests.includes(c.id)) list.push({ kind: 'chest', id: c.id, x: c.x, z: c.z });
  }
  for (const b of zone.beacons) list.push({ kind: 'beacon', id: b.id, entry: b.entry, x: b.x, z: b.z });
  if (zone.altar && !hasFlag(progress, 'bladeTaken'))
    list.push({ kind: 'altar', x: zone.altar.x, z: zone.altar.z });
  for (const s of zone.shrines) {
    if (!progress.abilities.includes(s.ability))
      list.push({ kind: 'shrine', ability: s.ability, x: s.x, z: s.z });
  }
  for (const s of zone.signs) list.push({ kind: 'sign', text: s.text, x: s.x, z: s.z });
  for (const g of zone.gates) {
    if (!isGateOpen(adventure, g)) list.push({ kind: 'gate', id: g.id, x: g.x, z: g.z });
  }
  if (zone.rescue && progress.bosses.includes('regente') && !hasFlag(progress, 'gameCompleted')) {
    list.push({ kind: 'rescue', x: zone.rescue.x, z: zone.rescue.z });
  }
  for (const data of zonePuzzles(zone)) {
    const state = adventure.puzzles.get(data.id);
    if (!state || state.solved) continue;
    if (data.kind === 'sequence') {
      // Las antorchas y los prismas no se tocan: se encienden con el Pulso.
      if (usesPulse(data)) continue;
      for (const s of data.switches) list.push({ kind: 'switch', puzzle: data.id, id: s.id, x: s.x, z: s.z });
    } else {
      state.blocks.forEach((cell, index) => {
        const c = cellCenter(data, cell);
        list.push({ kind: 'block', puzzle: data.id, index, x: c.x, z: c.z });
      });
      list.push({ kind: 'reset', puzzle: data.id, x: data.reset.x, z: data.reset.z });
    }
  }
  return list;
}

function reachOf(item: Interactable, adventure: AdventureState): number {
  switch (item.kind) {
    case 'gate': {
      const gate = adventure.zone.gates.find((g) => g.id === item.id);
      return (gate?.width ?? 2) / 2 + REACH * 0.8;
    }
    case 'block': {
      const data = puzzleById(item.puzzle) as BlocksPuzzle;
      return data.cellSize / 2 + REACH * 0.6;
    }
    case 'altar':
    case 'shrine':
    case 'rescue':
      return 1 + REACH;
    default:
      return REACH + 0.5;
  }
}

/** Lo más cercano al alcance del jugador, si hay algo. */
export function nearestInteractable(adventure: AdventureState, x: number, z: number): Interactable | null {
  let best: Interactable | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of listInteractables(adventure)) {
    const d = Math.hypot(item.x - x, item.z - z);
    const reach = reachOf(item, adventure);
    if (d > reach) continue;
    // Se compara el margen, no la distancia: una puerta ancha no tapa al cofre que hay delante.
    const score = d / reach;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/** Usa un objeto. El jugador está en (x, z). */
export function interact(
  adventure: AdventureState,
  item: Interactable,
  x: number,
  z: number,
): AdventureEvent[] {
  const { progress } = adventure;
  switch (item.kind) {
    case 'npc':
      return [{ type: 'talk', npc: item.id }];
    case 'sign':
      return [{ type: 'read', text: item.text }];
    case 'chest': {
      const result = openChest(progress, item.id);
      return result ? [{ type: 'chestOpened', id: item.id, result }] : [];
    }
    case 'beacon':
      progress.respawn = { zone: adventure.zone.id, entry: item.entry };
      progress.place = { ...progress.respawn };
      return [{ type: 'rest', beacon: item.id }];
    case 'altar': {
      if (hasFlag(progress, 'bladeTaken')) return [];
      setFlag(progress, 'bladeTaken');
      const events: AdventureEvent[] = [{ type: 'bladeTaken' }];
      for (const id of refreshGates(adventure)) events.push({ type: 'gateOpened', id, byKey: false });
      refreshBlocks(adventure);
      return events;
    }
    case 'shrine': {
      if (progress.abilities.includes(item.ability)) return [];
      progress.abilities.push(item.ability);
      const events: AdventureEvent[] = [{ type: 'abilityLearned', ability: item.ability }];
      for (const id of refreshGates(adventure)) events.push({ type: 'gateOpened', id, byKey: false });
      refreshBlocks(adventure);
      return events;
    }
    case 'gate':
      return useGate(adventure, item.id);
    case 'switch':
      return useSwitch(adventure, item.puzzle, item.id);
    case 'block':
      return useBlock(adventure, item.puzzle, item.index, x, z);
    case 'rescue': {
      if (hasFlag(progress, 'gameCompleted')) return [];
      // Queda anotado aquí: si se cierra la página en mitad del final, la aventura ya está terminada.
      setFlag(progress, 'gameCompleted');
      progress.place = { ...progress.respawn };
      return [{ type: 'rescue' }];
    }
    case 'reset': {
      const state = adventure.puzzles.get(item.puzzle);
      const data = puzzleById(item.puzzle);
      if (!state || !data || state.solved) return [];
      resetPuzzle(state, data);
      refreshBlocks(adventure);
      return [{ type: 'puzzleReset', id: item.puzzle }];
    }
  }
}

function useGate(adventure: AdventureState, gateId: string): AdventureEvent[] {
  const gate = adventure.zone.gates.find((g) => g.id === gateId);
  if (!gate || isGateOpen(adventure, gate)) return [];
  if (gate.opens.kind !== 'key' || !gateRequirementMet(adventure.progress, gate.opens)) {
    return [{ type: 'gateLocked', id: gate.id, opens: gate.opens }];
  }
  // La llave se gasta al abrir.
  const { progress } = adventure;
  progress.keys = progress.keys.filter((k) => k !== (gate.opens as { key: string }).key);
  progress.gates.push(gate.id);
  refreshBlocks(adventure);
  return [{ type: 'gateOpened', id: gate.id, byKey: true }];
}

function solvePuzzle(adventure: AdventureState, puzzleId: string): AdventureEvent[] {
  const { progress } = adventure;
  if (!progress.puzzles.includes(puzzleId)) progress.puzzles.push(puzzleId);
  const events: AdventureEvent[] = [{ type: 'puzzleSolved', id: puzzleId }];
  for (const id of refreshGates(adventure)) events.push({ type: 'gateOpened', id, byKey: false });
  return events;
}

function useSwitch(adventure: AdventureState, puzzleId: string, switchId: string): AdventureEvent[] {
  const data = puzzleById(puzzleId) as SequencePuzzle | undefined;
  const state = adventure.puzzles.get(puzzleId);
  if (!data || !state) return [];
  const result = pressSwitch(state, data, switchId);
  if (result === 'ignored') return [];
  const events: AdventureEvent[] = [{ type: 'switchPressed', result }];
  if (result === 'solved') {
    events.push(...solvePuzzle(adventure, puzzleId));
    refreshBlocks(adventure);
  }
  return events;
}

function useBlock(
  adventure: AdventureState,
  puzzleId: string,
  index: number,
  x: number,
  z: number,
): AdventureEvent[] {
  const data = puzzleById(puzzleId) as BlocksPuzzle | undefined;
  const state = adventure.puzzles.get(puzzleId);
  const cell = state?.blocks[index];
  if (!data || !state || !cell) return [];
  const center = cellCenter(data, cell);
  const [dc, dr] = pushDirection(x, z, center.x, center.z);
  if (!pushBlock(state, data, index, dc, dr)) return [{ type: 'blockStuck' }];
  const events: AdventureEvent[] = [{ type: 'blockPushed' }];
  if (state.solved) events.push(...solvePuzzle(adventure, puzzleId));
  refreshBlocks(adventure);
  return events;
}

/** True si la pieza del puzzle se enciende con el Pulso en lugar de tocarla. */
export function usesPulse(data: SequencePuzzle): boolean {
  return data.piece === 'torch' || data.piece === 'prism';
}

/** Una antorcha o un prisma que aún se puede encender. */
export interface PulseTarget {
  readonly puzzle: string;
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/** Las piezas de la zona que responden al Pulso. */
export function pulseTargets(adventure: AdventureState): PulseTarget[] {
  const list: PulseTarget[] = [];
  for (const data of zonePuzzles(adventure.zone)) {
    if (data.kind !== 'sequence' || !usesPulse(data) || adventure.puzzles.get(data.id)?.solved) continue;
    for (const s of data.switches) list.push({ puzzle: data.id, id: s.id, x: s.x, z: s.z });
  }
  return list;
}

/** El Pulso alcanzó una pieza: cuenta igual que tocar una piedra. */
export function lightPiece(adventure: AdventureState, target: PulseTarget): AdventureEvent[] {
  return useSwitch(adventure, target.puzzle, target.id);
}

/** Rompe las barreras de cristal que cruza una carrera desde (x, z) hacia (dirX, dirZ). */
export function shatterGates(
  adventure: AdventureState,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  radius: number,
): AdventureEvent[] {
  const events: AdventureEvent[] = [];
  for (const gate of adventure.zone.gates) {
    if (gate.opens.kind !== 'shatter' || isGateOpen(adventure, gate)) continue;
    if (!dashCrosses(x, z, dirX, dirZ, radius, gateBlock(gate))) continue;
    adventure.progress.gates.push(gate.id);
    events.push({ type: 'gateShattered', id: gate.id, x: gate.x, z: gate.z });
  }
  if (events.length > 0) refreshBlocks(adventure);
  return events;
}

/** Se venció a un jefe: queda anotado y se abre lo que guardaba. */
export function defeatBoss(adventure: AdventureState, boss: BossId): AdventureEvent[] {
  const { progress } = adventure;
  if (progress.bosses.includes(boss)) return [];
  progress.bosses.push(boss);
  const events: AdventureEvent[] = [];
  for (const id of refreshGates(adventure)) events.push({ type: 'gateOpened', id, byKey: false });
  refreshBlocks(adventure);
  return events;
}

/** La salida en la que está el jugador, si hay alguna. */
export function currentExit(adventure: AdventureState, x: number, z: number): ReturnType<typeof exitAt> {
  return exitAt(adventure.zone.exits, x, z);
}
