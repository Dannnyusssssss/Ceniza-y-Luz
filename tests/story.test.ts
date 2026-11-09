import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { INTRO_SHOTS } from '../src/data/intro';
import { NPC_IDS, NPCS } from '../src/data/npcs';
import { DIALOGUES, TEXTS, type Dialogue } from '../src/data/texts';
import { STORY_ZONES, ZONES } from '../src/data/zones';
import { readGameMode } from '../src/engine/gameMode';
import { advanceDialogue, currentLine, lineTextFor, pickDialogue, startDialogue } from '../src/game/dialogue';
import { createDodge, startDodge, updateDodge } from '../src/game/dodge';
import { createEnemy, updateEnemy } from '../src/game/enemies';
import {
  clearCombat,
  createEncounter,
  spawnZoneEnemies,
  updateEncounter,
  type EncounterInput,
} from '../src/game/encounter';
import { createCombo, updateCombo } from '../src/game/combat';
import { createHealth, reviveLoaded, setLife } from '../src/game/health';
import { currentObjective } from '../src/game/objectives';
import { createProgress } from '../src/game/progress';
import { DODGE_BALANCE } from '../src/data/balance';

const DT = 1 / 60;

describe('diálogos', () => {
  const lines: Dialogue = [
    { speaker: 'narrator', text: 'uno' },
    { speaker: 'player', text: { alba: 'hola de Alba', ciro: 'hola de Ciro' } },
  ];

  it('avanzan una línea cada vez, solo cuando se pide, y terminan', () => {
    const cursor = startDialogue(lines);
    expect(currentLine(cursor)?.text).toBe('uno');
    expect(advanceDialogue(cursor)).toBe(true);
    expect(currentLine(cursor)?.speaker).toBe('player');
    expect(advanceDialogue(cursor)).toBe(false);
    expect(currentLine(cursor)).toBeNull();
    expect(advanceDialogue(cursor)).toBe(false);
  });

  it('el texto usa la voz del personaje elegido', () => {
    const text = lines[1]?.text ?? '';
    expect(lineTextFor(text, 'alba')).toBe('hola de Alba');
    expect(lineTextFor(text, 'ciro')).toBe('hola de Ciro');
    expect(lineTextFor('igual', 'ciro')).toBe('igual');
  });

  it('los aldeanos cambian lo que dicen al tomar la Hoja', () => {
    const p = createProgress('alba');
    expect(pickDialogue('ilse', p)).toBe(DIALOGUES.ilse.before);
    p.flags.push('bladeTaken');
    expect(pickDialogue('ilse', p)).toBe(DIALOGUES.ilse.after);
  });

  it('todos tienen algo que decir, con texto para los dos gemelos', () => {
    const all: Dialogue[] = [
      ...NPC_IDS.flatMap((id) => [DIALOGUES[id].before, DIALOGUES[id].after]),
      ...INTRO_SHOTS.map((s) => s.lines),
    ];
    for (const dialogue of all) {
      expect(dialogue.length).toBeGreaterThan(0);
      for (const line of dialogue) {
        expect(lineTextFor(line.text, 'alba').length).toBeGreaterThan(0);
        expect(lineTextFor(line.text, 'ciro').length).toBeGreaterThan(0);
      }
    }
  });

  it('la voz de cada gemelo nombra al otro, nunca a sí mismo como raptado', () => {
    const taken = INTRO_SHOTS.find((s) => s.siblingTaken)?.lines.find((l) => l.speaker === 'narrator');
    const text = taken?.text ?? '';
    expect(lineTextFor(text, 'alba')).toContain('Ciro desapareciendo');
    expect(lineTextFor(text, 'ciro')).toContain('Alba desapareciendo');
  });

  it('cada aldeano de los datos tiene su aspecto, y cada zona de la aventura, su nombre', () => {
    for (const id of STORY_ZONES) {
      for (const npc of ZONES[id].npcs) expect(NPCS[npc.id].name.length).toBeGreaterThan(0);
      expect(TEXTS.world.zones[id].length).toBeGreaterThan(0);
    }
  });
});

describe('intro', () => {
  it('el gemelo está al principio y ya no está al final; hay un plano en que se lo llevan', () => {
    expect(INTRO_SHOTS[0]?.sibling).not.toBeNull();
    expect(INTRO_SHOTS.at(-1)?.sibling).toBeNull();
    expect(INTRO_SHOTS.some((s) => s.siblingTaken)).toBe(true);
  });
});

describe('objetivo actual', () => {
  it('sigue el avance de la aventura', () => {
    const p = createProgress('alba');
    expect(currentObjective(p)).toBe('blade');
    p.flags.push('bladeTaken');
    expect(currentObjective(p)).toBe('forest');
    p.place = { zone: 'bosque', entry: 'fromLumbre' };
    expect(currentObjective(p)).toBe('blocks');
    p.puzzles.push('bosque-bloque');
    expect(currentObjective(p)).toBe('key');
    p.chests.push('bosque-llave');
    expect(currentObjective(p)).toBe('clearing');
    p.gates.push('bosque-claro');
    expect(currentObjective(p)).toBe('seal');
    p.chests.push('bosque-sello');
    expect(currentObjective(p)).toBe('mist');
    p.gates.push('bosque-bruma');
    expect(currentObjective(p)).toBe('marshBlocks');
    p.puzzles.push('cienaga-bloques');
    expect(currentObjective(p)).toBe('pulse');
    p.abilities.push('pulso');
    expect(currentObjective(p)).toBe('torches');
    p.puzzles.push('cienaga-antorchas');
    p.place = { zone: 'cienaga', entry: 'norte' };
    expect(currentObjective(p)).toBe('cave');
    p.place = { zone: 'cueva', entry: 'fromCienaga' };
    expect(currentObjective(p)).toBe('prisms');
    p.puzzles.push('cueva-prismas');
    expect(currentObjective(p)).toBe('impulse');
    p.abilities.push('impulso');
    expect(currentObjective(p)).toBe('crack');
    p.gates.push('cueva-cristal');
    expect(currentObjective(p)).toBe('guardian');
    p.bosses.push('guardian');
    expect(currentObjective(p)).toBe('fortress');
  });
});

describe('enemigos de zona', () => {
  const ctx = (x: number, z: number) => ({
    player: { x, z },
    playerRadius: 0.4,
    playerAlive: true,
    blocks: [],
    rng: createRng(3),
  });

  it('esperan quietos hasta ver al jugador', () => {
    const e = createEnemy(1, 'brumilla', 0, 0, 0, 1, true);
    expect(e.phase).toBe('idle');
    for (let i = 0; i < 60; i++) updateEnemy(e, DT, ctx(0, 40));
    expect(e.phase).toBe('idle');
    expect(e.z).toBe(0);
    updateEnemy(e, DT, ctx(0, e.stats.detectRange - 1));
    expect(e.phase).toBe('chase');
  });

  it('lo pierden de vista si se aleja y se quedan donde están', () => {
    const e = createEnemy(1, 'brumilla', 0, 0, 0, 1, true);
    e.alerted = true;
    e.phase = 'chase';
    updateEnemy(e, DT, ctx(0, e.stats.detectRange * 3));
    expect(e.phase).toBe('idle');
    expect(e.alerted).toBe(false);
  });

  it('los de la arena nunca dejan de perseguir', () => {
    const e = createEnemy(1, 'brumilla', 0, 0, 0);
    e.phase = 'chase';
    updateEnemy(e, DT, ctx(0, 500));
    expect(e.phase).toBe('chase');
  });
});

describe('combate en una zona', () => {
  const input = (overrides: Partial<EncounterInput> = {}): EncounterInput => ({
    player: { x: 0, z: 0, yaw: 0 },
    playerRadius: 0.4,
    combo: createCombo(),
    dodging: false,
    damageSetting: 'normal',
    blocks: [],
    ...overrides,
  });

  it('coloca todos los enemigos de los grupos y los quita al salir', () => {
    const s = createEncounter(1, false);
    spawnZoneEnemies(s, ZONES.bosque.enemies);
    const expected = ZONES.bosque.enemies.reduce((n, g) => n + g.kinds.length, 0);
    expect(s.enemies).toHaveLength(expected);
    expect(new Set(s.enemies.map((e) => e.id)).size).toBe(expected);
    clearCombat(s);
    expect(s.enemies).toHaveLength(0);
  });

  it('sin oleadas no aparece ningún enemigo por sí solo', () => {
    const s = createEncounter(1, false);
    for (let i = 0; i < 60 * 20; i++) updateEncounter(s, DT, input());
    expect(s.enemies).toHaveLength(0);
  });

  it('el temple de la Hoja multiplica el daño', () => {
    const damageWith = (factor: number): number => {
      const s = createEncounter(1, false);
      const enemy = createEnemy(s.nextId++, 'coloso', 0, 1.2, Math.PI);
      enemy.phase = 'recover';
      s.enemies.push(enemy);
      const combo = createCombo();
      updateCombo(combo, true, DT);
      for (let i = 0; i < 20; i++) {
        updateCombo(combo, false, DT);
        updateEncounter(s, DT, input({ combo, damageFactor: factor }));
      }
      return enemy.maxHealth - enemy.health;
    };
    expect(damageWith(2)).toBe(damageWith(1) * 2);
  });
});

describe('vida al cargar y fragmentos', () => {
  it('setLife respeta los límites', () => {
    const h = createHealth();
    setLife(h, 20, 999);
    expect(h.maxQuarters).toBe(20);
    expect(h.quarters).toBe(20);
    setLife(h, 20, 0);
    expect(h.quarters).toBe(1);
  });

  it('una vida cargada no arrastra la caída anterior', () => {
    const h = createHealth();
    h.deadFor = 3;
    h.invulnerable = 1;
    reviveLoaded(h);
    expect(h.deadFor).toBe(-1);
    expect(h.invulnerable).toBe(0);
  });
});

describe('talismán: espera de la esquiva', () => {
  it('con factor 0,75 la esquiva vuelve a estar lista antes', () => {
    const finishAt = (factor: number): number => {
      const d = createDodge();
      d.cooldownFactor = factor;
      startDodge(d, 0, 1);
      let t = 0;
      while (d.phase !== 'ready' && t < 5) {
        updateDodge(d, DT);
        t += DT;
      }
      return t;
    };
    const saved = finishAt(1) - finishAt(0.75);
    expect(saved).toBeCloseTo(DODGE_BALANCE.cooldown * 0.25, 1);
  });
});

describe('modo de juego de la URL', () => {
  it('solo ?modo=arena cambia el modo', () => {
    expect(readGameMode('?modo=arena')).toBe('arena');
    expect(readGameMode('')).toBe('story');
    expect(readGameMode('?modo=otra')).toBe('story');
    expect(readGameMode('?modo=<script>')).toBe('story');
  });
});
