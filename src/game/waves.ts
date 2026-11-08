import type { Point2 } from '../data/arena';
import type { EnemyKind } from '../data/enemies';
import { SPAWN_POINTS, WAVE_RULES, WAVES, type WaveData } from '../data/waves';
import type { Rng } from '../core/rng';
import type { Position2 } from '../world/collision';

export type WaveRules = typeof WAVE_RULES;

/**
 * Oleadas de la arena:
 * - `waiting`: pausa antes de la siguiente oleada (`timer` cuenta hacia atrás).
 * - `fighting`: hay enemigos vivos de la oleada actual.
 */
export interface WaveState {
  /** Oleada actual (0 = la primera). */
  index: number;
  /** Vueltas completas a todas las oleadas (sube la vida de los enemigos). */
  loop: number;
  phase: 'waiting' | 'fighting';
  timer: number;
}

export interface EnemySpawnOrder {
  readonly kind: EnemyKind;
  readonly x: number;
  readonly z: number;
  /** Mirando hacia el jugador. */
  readonly yaw: number;
  readonly healthFactor: number;
}

export function createWaves(rules: WaveRules = WAVE_RULES): WaveState {
  return { index: 0, loop: 0, phase: 'waiting', timer: rules.firstDelay };
}

/** Número de oleada que se muestra (empieza en 1 y sigue contando en cada vuelta). */
export function waveNumber(state: WaveState, waves: readonly WaveData[] = WAVES): number {
  return state.loop * waves.length + state.index + 1;
}

/**
 * Avanza las oleadas. `aliveEnemies` = enemigos vivos ahora. Devuelve los enemigos que hay que crear
 * (vacío casi siempre). Cuando se vence una oleada empieza la pausa y luego la siguiente; tras la última,
 * se vuelve a la primera con enemigos más resistentes.
 */
export function updateWaves(
  state: WaveState,
  dt: number,
  aliveEnemies: number,
  player: Position2,
  rng: Rng,
  waves: readonly WaveData[] = WAVES,
  spawnPoints: readonly Point2[] = SPAWN_POINTS,
  rules: WaveRules = WAVE_RULES,
): EnemySpawnOrder[] {
  if (state.phase === 'fighting') {
    if (aliveEnemies > 0) return [];
    state.phase = 'waiting';
    state.timer = rules.intermission;
    state.index++;
    if (state.index >= waves.length) {
      state.index = 0;
      state.loop++;
    }
    return [];
  }
  state.timer -= dt;
  if (state.timer > 0) return [];
  state.phase = 'fighting';
  const wave = waves[state.index];
  if (!wave) return [];
  return planSpawns(wave, player, rng, spawnPoints, rules, rules.loopHealthFactor ** state.loop);
}

/** Reparte los enemigos de una oleada por los puntos de aparición lejanos al jugador. */
export function planSpawns(
  wave: WaveData,
  player: Position2,
  rng: Rng,
  spawnPoints: readonly Point2[] = SPAWN_POINTS,
  rules: WaveRules = WAVE_RULES,
  healthFactor = 1,
): EnemySpawnOrder[] {
  const far = spawnPoints.filter((p) => Math.hypot(p.x - player.x, p.z - player.z) >= rules.minSpawnDistance);
  const points = far.length > 0 ? far : spawnPoints;
  // Orden barajado: cada enemigo en un punto distinto mientras haya puntos.
  const order = [...points];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j] as Point2, order[i] as Point2];
  }
  const spawns: EnemySpawnOrder[] = [];
  let n = 0;
  for (const group of wave.groups) {
    for (let k = 0; k < group.count; k++) {
      const base = order[n % order.length] as Point2;
      // Si se repite un punto, se separa un poco.
      const lap = Math.floor(n / order.length);
      const x = base.x + (lap > 0 ? rng.range(-1.5, 1.5) : 0);
      const z = base.z + (lap > 0 ? rng.range(-1.5, 1.5) : 0);
      spawns.push({ kind: group.kind, x, z, yaw: Math.atan2(player.x - x, player.z - z), healthFactor });
      n++;
    }
  }
  return spawns;
}

/** Reintentar tras morir: vuelve a empezar la oleada en la que se cayó, tras una pausa corta. */
export function retryWave(state: WaveState, rules: WaveRules = WAVE_RULES): void {
  state.phase = 'waiting';
  state.timer = rules.firstDelay;
}
