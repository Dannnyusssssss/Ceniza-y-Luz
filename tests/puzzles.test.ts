import { describe, expect, it } from 'vitest';
import { PUZZLES, type BlocksPuzzle, type SequencePuzzle } from '../src/data/puzzles';
import { STORY_ZONES, ZONES } from '../src/data/zones';
import {
  createAdventure,
  gateRequirementMet,
  interact,
  isGateOpen,
  listInteractables,
  nearestInteractable,
  type AdventureEvent,
} from '../src/game/adventure';
import { createProgress } from '../src/game/progress';
import {
  cellCenter,
  createPuzzleState,
  platesCovered,
  pressSwitch,
  pushBlock,
  pushDirection,
  resetPuzzle,
  shortestSolution,
} from '../src/game/puzzles';

const sequence = PUZZLES.find((p) => p.kind === 'sequence') as SequencePuzzle;
const blocks = PUZZLES.find((p) => p.kind === 'blocks') as BlocksPuzzle;

const SMALL: BlocksPuzzle = {
  kind: 'blocks',
  id: 'prueba',
  zone: 'bosque',
  origin: { x: 0, z: 0 },
  cellSize: 2,
  cols: 3,
  rows: 3,
  solids: [[2, 0]],
  blocks: [[1, 0]],
  plates: [[1, 2]],
  reset: { x: -3, z: 0 },
};

describe('datos de los puzzles', () => {
  it('los identificadores no se repiten y cada puzzle está en una zona de la aventura', () => {
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
    for (const p of PUZZLES) expect(STORY_ZONES).toContain(p.zone);
  });

  it('el orden de la secuencia usa todos sus interruptores una vez', () => {
    const ids = sequence.switches.map((s) => s.id).sort();
    expect([...sequence.order].sort()).toEqual(ids);
  });

  it('cada símbolo es distinto (se distinguen sin depender del color)', () => {
    expect(new Set(sequence.switches.map((s) => s.symbol)).size).toBe(sequence.switches.length);
  });

  it('todo puzzle de bloques de los datos tiene solución', () => {
    for (const p of PUZZLES) {
      if (p.kind !== 'blocks') continue;
      const pushes = shortestSolution(p);
      expect(pushes, p.id).not.toBeNull();
      expect(pushes as number, p.id).toBeGreaterThan(0);
    }
  });

  it('hay tantos bloques como plataformas y ninguno empieza encima de una roca', () => {
    for (const p of PUZZLES) {
      if (p.kind !== 'blocks') continue;
      expect(p.blocks.length).toBe(p.plates.length);
      for (const b of [...p.blocks, ...p.plates]) {
        expect(p.solids.some((s) => s[0] === b[0] && s[1] === b[1])).toBe(false);
      }
    }
  });
});

describe('interruptores en orden', () => {
  it('el orden correcto resuelve el puzzle', () => {
    const state = createPuzzleState(sequence, false);
    const results = sequence.order.map((id) => pressSwitch(state, sequence, id));
    expect(results).toEqual(['advance', 'advance', 'solved']);
    expect(state.solved).toBe(true);
  });

  it('fallar reinicia el orden sin castigo y se puede volver a intentar', () => {
    const state = createPuzzleState(sequence, false);
    const [first, second] = sequence.order as [string, string, string];
    pressSwitch(state, sequence, first);
    expect(pressSwitch(state, sequence, first)).toBe('wrong');
    // El primero pulsado de nuevo cuenta como el inicio del intento nuevo.
    expect(state.pressed).toBe(1);
    expect(pressSwitch(state, sequence, second)).toBe('advance');
    expect(pressSwitch(state, sequence, first)).toBe('wrong');
    for (const id of sequence.order.slice(state.pressed)) pressSwitch(state, sequence, id);
    expect(state.solved).toBe(true);
  });

  it('un interruptor desconocido o ya resuelto no hace nada', () => {
    const state = createPuzzleState(sequence, false);
    expect(pressSwitch(state, sequence, 'otro')).toBe('ignored');
    const solved = createPuzzleState(sequence, true);
    expect(pressSwitch(solved, sequence, sequence.order[0] as string)).toBe('ignored');
    expect(solved.pressed).toBe(sequence.order.length);
  });
});

describe('bloques y plataformas', () => {
  it('empujar mueve el bloque y al cubrir la plataforma se resuelve', () => {
    const state = createPuzzleState(SMALL, false);
    expect(pushBlock(state, SMALL, 0, 0, 1)).toBe(true);
    expect(state.solved).toBe(false);
    expect(pushBlock(state, SMALL, 0, 0, 1)).toBe(true);
    expect(state.solved).toBe(true);
    expect(platesCovered(SMALL, state.blocks)).toBe(true);
  });

  it('no atraviesa rocas ni sale de la cuadrícula', () => {
    const state = createPuzzleState(SMALL, false);
    expect(pushBlock(state, SMALL, 0, 1, 0)).toBe(false);
    expect(pushBlock(state, SMALL, 0, 0, -1)).toBe(false);
    expect(state.blocks[0]).toEqual([1, 0]);
  });

  it('solo admite empujones de una celda en un eje', () => {
    const state = createPuzzleState(SMALL, false);
    expect(pushBlock(state, SMALL, 0, 1, 1)).toBe(false);
    expect(pushBlock(state, SMALL, 0, 0, 2)).toBe(false);
    expect(pushBlock(state, SMALL, 5, 0, 1)).toBe(false);
  });

  it('resuelto, el bloque queda en la plataforma y ya no se mueve', () => {
    const state = createPuzzleState(SMALL, true);
    expect(state.blocks[0]).toEqual([1, 2]);
    expect(pushBlock(state, SMALL, 0, 0, -1)).toBe(false);
  });

  it('reiniciar devuelve el bloque a su sitio, salvo si ya está resuelto', () => {
    const state = createPuzzleState(SMALL, false);
    pushBlock(state, SMALL, 0, -1, 0);
    expect(state.blocks[0]).toEqual([0, 0]);
    resetPuzzle(state, SMALL);
    expect(state.blocks[0]).toEqual([1, 0]);
    const solved = createPuzzleState(SMALL, true);
    resetPuzzle(solved, SMALL);
    expect(solved.blocks[0]).toEqual([1, 2]);
  });

  it('reiniciar no comparte datos con el puzzle: los empujones no alteran los datos', () => {
    const state = createPuzzleState(SMALL, false);
    pushBlock(state, SMALL, 0, 0, 1);
    expect(SMALL.blocks[0]).toEqual([1, 0]);
  });

  it('detecta un puzzle sin solución', () => {
    const impossible: BlocksPuzzle = { ...SMALL, blocks: [[0, 0]], plates: [[2, 2]], solids: [[1, 1]] };
    const corner: BlocksPuzzle = { ...impossible, cols: 1, rows: 1, plates: [[0, 0]] };
    expect(shortestSolution(corner)).toBe(0);
    const walled: BlocksPuzzle = {
      ...SMALL,
      solids: [
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    };
    expect(shortestSolution(walled)).toBeNull();
  });

  it('la dirección del empujón sale de la posición del jugador', () => {
    expect(pushDirection(0, 0, 2, 0.2)).toEqual([1, 0]);
    expect(pushDirection(0, 0, -2, 0.2)).toEqual([-1, 0]);
    expect(pushDirection(0, 0, 0.2, 2)).toEqual([0, 1]);
    expect(pushDirection(0, 0, 0.2, -2)).toEqual([0, -1]);
  });

  it('el centro de una celda sale del origen y del tamaño', () => {
    expect(cellCenter(blocks, [1, 2])).toEqual({
      x: blocks.origin.x + blocks.cellSize,
      z: blocks.origin.z + blocks.cellSize * 2,
    });
  });
});

describe('aventura: objetos y puertas', () => {
  const typesOf = (events: readonly AdventureEvent[]): string[] => events.map((e) => e.type);

  it('coger la Hoja abre el portal de Lumbre', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'lumbre');
    const portal = ZONES.lumbre.gates[0];
    if (!portal) throw new Error('falta el portal');
    expect(isGateOpen(a, portal)).toBe(false);
    const altar = listInteractables(a).find((i) => i.kind === 'altar');
    if (!altar) throw new Error('falta el altar');
    const events = interact(a, altar, altar.x, altar.z);
    expect(typesOf(events)).toEqual(['bladeTaken', 'gateOpened']);
    expect(isGateOpen(a, portal)).toBe(true);
    expect(listInteractables(a).some((i) => i.kind === 'altar')).toBe(false);
  });

  it('el portal cerrado avisa de lo que falta', () => {
    const a = createAdventure(createProgress('alba'), 'lumbre');
    const gate = listInteractables(a).find((i) => i.kind === 'gate');
    if (!gate) throw new Error('falta la puerta');
    expect(typesOf(interact(a, gate, gate.x, gate.z))).toEqual(['gateLocked']);
  });

  it('un cofre abierto deja de ofrecerse', () => {
    const a = createAdventure(createProgress('alba'), 'lumbre');
    const chest = listInteractables(a).find((i) => i.kind === 'chest');
    if (!chest) throw new Error('falta el cofre');
    expect(typesOf(interact(a, chest, chest.x, chest.z))).toEqual(['chestOpened']);
    expect(listInteractables(a).some((i) => i.kind === 'chest')).toBe(false);
  });

  it('descansar en un faro fija la reaparición', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'bosque');
    const beacon = listInteractables(a).find((i) => i.kind === 'beacon');
    if (!beacon || beacon.kind !== 'beacon') throw new Error('falta el faro');
    expect(typesOf(interact(a, beacon, beacon.x, beacon.z))).toEqual(['rest']);
    expect(progress.respawn).toEqual({ zone: 'bosque', entry: beacon.entry });
    expect(progress.place).toEqual({ zone: 'bosque', entry: beacon.entry });
  });

  it('la puerta con llave pide la llave y la gasta al abrir', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'bosque');
    const find = () => listInteractables(a).find((i) => i.kind === 'gate' && i.id === 'bosque-claro');
    const gate = find();
    if (!gate) throw new Error('falta la puerta');
    expect(typesOf(interact(a, gate, gate.x, gate.z))).toEqual(['gateLocked']);
    progress.keys.push('llave-claro');
    expect(typesOf(interact(a, gate, gate.x, gate.z))).toEqual(['gateOpened']);
    expect(progress.keys).toEqual([]);
    expect(find()).toBeUndefined();
  });

  it('resolver los símbolos abre la alcoba y queda resuelto al volver a la zona', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'bosque');
    let last: AdventureEvent[] = [];
    for (const id of sequence.order) {
      const item = listInteractables(a).find((i) => i.kind === 'switch' && i.id === id);
      if (!item) throw new Error(`falta ${id}`);
      last = interact(a, item, item.x, item.z);
    }
    expect(typesOf(last)).toEqual(['switchPressed', 'puzzleSolved', 'gateOpened']);
    expect(progress.puzzles).toContain(sequence.id);
    expect(progress.gates).toContain('bosque-alcoba');
    const again = createAdventure(progress, 'bosque');
    expect(again.puzzles.get(sequence.id)?.solved).toBe(true);
    expect(listInteractables(again).some((i) => i.kind === 'switch')).toBe(false);
  });

  it('resolver los bloques empujando desde el lado correcto abre la puerta del norte', () => {
    const progress = createProgress('alba');
    const a = createAdventure(progress, 'bosque');
    const push = (dc: number, dr: number): AdventureEvent[] => {
      const item = listInteractables(a).find((i) => i.kind === 'block');
      if (!item) throw new Error('falta el bloque');
      // El jugador se coloca detrás del bloque respecto a la dirección del empujón.
      return interact(a, item, item.x - dc * 1.5, item.z - dr * 1.5);
    };
    push(1, 0);
    push(1, 0);
    push(0, 1);
    push(0, 1);
    const last = push(0, 1);
    expect(typesOf(last)).toEqual(['blockPushed', 'puzzleSolved', 'gateOpened']);
    expect(progress.gates).toContain('bosque-puerta');
  });

  it('un empujón contra una roca avisa y no mueve el bloque; la piedra lo reinicia', () => {
    const a = createAdventure(createProgress('alba'), 'bosque');
    const state = a.puzzles.get(blocks.id);
    const item = listInteractables(a).find((i) => i.kind === 'block');
    if (!state || !item) throw new Error('faltan datos');
    // Hacia -z hasta el borde de la cuadrícula.
    interact(a, item, item.x, item.z + 1.5);
    const stuck = listInteractables(a).find((i) => i.kind === 'block');
    if (!stuck) throw new Error('falta el bloque');
    expect(typesOf(interact(a, stuck, stuck.x, stuck.z + 1.5))).toEqual(['blockStuck']);
    const reset = listInteractables(a).find((i) => i.kind === 'reset');
    if (!reset) throw new Error('falta la piedra');
    expect(typesOf(interact(a, reset, reset.x, reset.z))).toEqual(['puzzleReset']);
    expect(state.blocks[0]).toEqual([...(blocks.blocks[0] as readonly [number, number])]);
  });

  it('un bloque empujado sigue siendo sólido en su nueva celda', () => {
    const a = createAdventure(createProgress('alba'), 'bosque');
    const item = listInteractables(a).find((i) => i.kind === 'block');
    if (!item) throw new Error('falta el bloque');
    const before = a.blocks;
    interact(a, item, item.x - 1.5, item.z);
    expect(a.blocks).not.toBe(before);
    const next = cellCenter(blocks, [3, 1]);
    expect(a.blocks.some((b) => b.x === next.x && b.z === next.z)).toBe(true);
  });

  it('solo se alcanza lo que está cerca, y gana lo más cercano', () => {
    const a = createAdventure(createProgress('alba'), 'lumbre');
    expect(nearestInteractable(a, 0, -16)).toBeNull();
    const chest = ZONES.lumbre.chests[0];
    if (!chest) throw new Error('falta el cofre');
    expect(nearestInteractable(a, chest.x - 1, chest.z)?.kind).toBe('chest');
  });

  it('gateRequirementMet comprueba cada tipo de condición', () => {
    const p = createProgress('alba');
    expect(gateRequirementMet(p, { kind: 'ability', ability: 'pulso' })).toBe(false);
    p.abilities.push('pulso');
    expect(gateRequirementMet(p, { kind: 'ability', ability: 'pulso' })).toBe(true);
    expect(gateRequirementMet(p, { kind: 'flag', flag: 'bladeTaken' })).toBe(false);
    p.flags.push('bladeTaken');
    expect(gateRequirementMet(p, { kind: 'flag', flag: 'bladeTaken' })).toBe(true);
  });
});
