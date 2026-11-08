import { describe, expect, it } from 'vitest';
import { createCombo, updateCombo } from '../src/game/combat';
import { createEnemy } from '../src/game/enemies';
import {
  aliveEnemies,
  createEncounter,
  resetEncounter,
  retryEncounter,
  updateEncounter,
  type EncounterEvent,
  type EncounterInput,
} from '../src/game/encounter';
import { HEALTH_BALANCE } from '../src/data/balance';
import { WAVE_RULES } from '../src/data/waves';

const DT = 1 / 60;

function input(overrides: Partial<EncounterInput> = {}): EncounterInput {
  return {
    player: { x: 0, z: 0, yaw: 0 },
    playerRadius: 0.4,
    combo: createCombo(),
    dodging: false,
    damageSetting: 'normal',
    blocks: [],
    ...overrides,
  };
}

function run(
  state: ReturnType<typeof createEncounter>,
  seconds: number,
  inp: EncounterInput,
): EncounterEvent[] {
  const all: EncounterEvent[] = [];
  for (let t = 0; t < seconds; t += DT) all.push(...updateEncounter(state, DT, inp));
  return all;
}

describe('combate de la arena', () => {
  it('la primera oleada aparece tras la pausa inicial', () => {
    const s = createEncounter();
    const events = run(s, WAVE_RULES.firstDelay + 0.1, input({ player: { x: 0, z: -9, yaw: 0 } }));
    expect(events.some((e) => e.type === 'waveStarted' && e.number === 1)).toBe(true);
    expect(aliveEnemies(s)).toBeGreaterThan(0);
  });

  it('el combo del jugador daña a un enemigo delante y suelta chispas al matarlo', () => {
    const s = createEncounter();
    s.waves.timer = 999;
    const enemy = createEnemy(s.nextId++, 'brumilla', 0, 1.2, Math.PI);
    enemy.phase = 'recover';
    enemy.health = 5;
    s.enemies.push(enemy);
    const combo = createCombo();
    updateCombo(combo, true, DT);
    const inp = input({ combo });
    const events: EncounterEvent[] = [];
    for (let i = 0; i < 20; i++) {
      updateCombo(combo, false, DT);
      events.push(...updateEncounter(s, DT, inp));
    }
    expect(events.some((e) => e.type === 'enemyHit' && e.killed)).toBe(true);
    expect(s.sparks.length).toBeGreaterThan(0);
  });

  it('un enemigo que alcanza al jugador le quita vida; esquivando no', () => {
    const s = createEncounter();
    s.waves.timer = 999;
    const enemy = createEnemy(s.nextId++, 'brumilla', 0, 1.2, Math.PI);
    enemy.phase = 'chase';
    s.enemies.push(enemy);
    const events = run(s, 2, input());
    expect(events.some((e) => e.type === 'playerHit')).toBe(true);
    expect(s.health.quarters).toBeLessThan(s.health.maxQuarters);

    const s2 = createEncounter();
    s2.waves.timer = 999;
    const e2 = createEnemy(s2.nextId++, 'brumilla', 0, 1.2, Math.PI);
    e2.phase = 'chase';
    s2.enemies.push(e2);
    run(s2, 2, input({ dodging: true }));
    expect(s2.health.quarters).toBe(s2.health.maxQuarters);
  });

  it('al caer avisa de que se puede reintentar, y reintentar deja todo listo', () => {
    const s = createEncounter();
    s.waves.timer = 999;
    s.health.quarters = 1;
    const enemy = createEnemy(s.nextId++, 'brumilla', 0, 1.2, Math.PI);
    enemy.phase = 'chase';
    s.enemies.push(enemy);
    const events = run(s, 2 + HEALTH_BALANCE.deathScreenDelay, input());
    expect(events.some((e) => e.type === 'playerDown')).toBe(true);
    expect(events.filter((e) => e.type === 'retryReady')).toHaveLength(1);
    retryEncounter(s);
    expect(s.enemies).toHaveLength(0);
    expect(s.health.quarters).toBe(s.health.maxQuarters);
    expect(s.waves.phase).toBe('waiting');
  });

  it('volver al inicio reinicia oleadas y chispas', () => {
    const s = createEncounter();
    s.sparkCount = 9;
    s.waves.index = 3;
    resetEncounter(s);
    expect(s.sparkCount).toBe(0);
    expect(s.waves.index).toBe(0);
  });
});
