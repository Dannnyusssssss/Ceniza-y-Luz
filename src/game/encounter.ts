import type { BlockData } from '../data/arena';
import type { EnemyKind } from '../data/enemies';
import type { EnemyGroup } from '../data/zones';
import type { DamageTaken } from '../data/settings';
import { createRng, type Rng } from '../core/rng';
import { currentStep, inHitWindow, isInArc, type ComboState } from './combat';
import {
  createEnemy,
  hitEnemy,
  isAlive,
  isHittable,
  markStrikeLanded,
  separate,
  updateEnemy,
  type EnemyPhase,
  type EnemyState,
} from './enemies';
import {
  applyKnockback,
  canRetry,
  createHealth,
  hurtPlayer,
  isDead,
  resetHealth,
  updateHealth,
  type HealthState,
} from './health';
import { createProjectile, slashProjectiles, updateProjectiles, type Projectile } from './projectiles';
import { pruneSparks, spawnSparks, updateSparks, type Spark } from './sparks';
import { createWaves, retryWave, updateWaves, waveNumber, type WaveState } from './waves';
import type { Position2 } from '../world/collision';

/** Algo que pasó en este paso: lo usan el sonido, los efectos y la interfaz. */
export type EncounterEvent =
  | { readonly type: 'enemySpawned'; readonly id: number; readonly kind: EnemyKind }
  | { readonly type: 'enemyWindup'; readonly id: number; readonly kind: EnemyKind }
  | { readonly type: 'enemyAttack'; readonly id: number; readonly kind: EnemyKind }
  | {
      readonly type: 'enemyHit';
      readonly id: number;
      readonly kind: EnemyKind;
      readonly damage: number;
      readonly killed: boolean;
    }
  | { readonly type: 'projectileFired'; readonly x: number; readonly z: number }
  | {
      readonly type: 'projectileEnded';
      readonly x: number;
      readonly z: number;
      readonly how: 'blocked' | 'hit' | 'cut' | 'expired';
    }
  | { readonly type: 'playerHit'; readonly damage: number; readonly fromX: number; readonly fromZ: number }
  | { readonly type: 'playerDown' }
  | { readonly type: 'retryReady' }
  | { readonly type: 'sparksCollected'; readonly count: number }
  | { readonly type: 'waveStarted'; readonly number: number }
  | { readonly type: 'waveCleared'; readonly number: number };

/** Combate de la arena: enemigos, proyectiles, chispas, oleadas y la vida del jugador. */
export interface EncounterState {
  readonly enemies: EnemyState[];
  readonly projectiles: Projectile[];
  readonly sparks: Spark[];
  waves: WaveState;
  readonly health: HealthState;
  /** Chispas recogidas en total. */
  sparkCount: number;
  nextId: number;
  readonly rng: Rng;
  /** Ya se avisó de que se puede reintentar. */
  retryAnnounced: boolean;
  /** Si es false no hay oleadas: los enemigos los coloca la zona. */
  readonly wavesEnabled: boolean;
}

/** Lo que el combate necesita saber del jugador en este paso. */
export interface EncounterInput {
  readonly player: Position2 & { readonly yaw: number };
  readonly playerRadius: number;
  readonly combo: ComboState;
  /** El jugador está en la ventana de invulnerabilidad de la esquiva. */
  readonly dodging: boolean;
  readonly damageSetting: DamageTaken;
  readonly blocks: readonly BlockData[];
  /** Multiplica el daño de los golpes del jugador (temple de la Hoja). */
  readonly damageFactor?: number;
}

export function createEncounter(seed = 20261108, wavesEnabled = true): EncounterState {
  return {
    enemies: [],
    projectiles: [],
    sparks: [],
    waves: createWaves(),
    health: createHealth(),
    sparkCount: 0,
    nextId: 1,
    rng: createRng(seed),
    retryAnnounced: false,
    wavesEnabled,
  };
}

/** Coloca los enemigos de una zona, repartidos en corro alrededor del centro de cada grupo. */
export function spawnZoneEnemies(state: EncounterState, groups: readonly EnemyGroup[]): void {
  for (const group of groups) {
    group.kinds.forEach((kind, i) => {
      const angle = (i / group.kinds.length) * Math.PI * 2 + group.x;
      const x = group.x + Math.cos(angle) * group.spread;
      const z = group.z + Math.sin(angle) * group.spread;
      state.enemies.push(createEnemy(state.nextId++, kind, x, z, angle, 1, true));
    });
  }
}

/** Quita enemigos, proyectiles y chispas sueltas (al cambiar de zona o descansar). */
export function clearCombat(state: EncounterState): void {
  state.enemies.length = 0;
  state.projectiles.length = 0;
  state.sparks.length = 0;
}

/** Enemigos vivos ahora mismo. */
export function aliveEnemies(state: EncounterState): number {
  return state.enemies.filter(isAlive).length;
}

/** Avanza el combate un paso fijo. El jugador ya se movió en este paso. */
export function updateEncounter(state: EncounterState, dt: number, input: EncounterInput): EncounterEvent[] {
  const events: EncounterEvent[] = [];
  const { player, combo } = input;
  const health = state.health;
  const playerAlive = !isDead(health);

  // 1) Golpes del jugador a los enemigos y a los proyectiles.
  const step = currentStep(combo);
  if (playerAlive && step && inHitWindow(combo)) {
    for (const enemy of state.enemies) {
      if (!isHittable(enemy)) continue;
      if (
        !isInArc(
          player.x,
          player.z,
          player.yaw,
          enemy.x,
          enemy.z,
          enemy.stats.radius,
          step.range,
          step.halfArc,
        )
      )
        continue;
      const damage = Math.round(step.damage * (input.damageFactor ?? 1));
      const dealt = hitEnemy(enemy, damage, combo.swingId, player.x, player.z);
      if (dealt <= 0) continue;
      const killed = !isAlive(enemy);
      events.push({ type: 'enemyHit', id: enemy.id, kind: enemy.kind, damage: dealt, killed });
      if (killed) {
        const [min, max] = enemy.stats.sparks;
        spawnSparks(state.sparks, enemy.x, enemy.z, state.rng.int(min, max), state.rng);
      }
    }
    if (slashProjectiles(state.projectiles, player.x, player.z, player.yaw, step.range, step.halfArc) > 0) {
      for (const p of state.projectiles) {
        if (p.state === 'cut') events.push({ type: 'projectileEnded', x: p.x, z: p.z, how: 'cut' });
      }
    }
  }

  // 2) Enemigos: deciden, se mueven y atacan.
  const ctx = { player, playerRadius: input.playerRadius, playerAlive, blocks: input.blocks, rng: state.rng };
  for (const enemy of state.enemies) {
    const before: EnemyPhase = enemy.phase;
    const out = updateEnemy(enemy, dt, ctx);
    if (before !== enemy.phase) {
      if (enemy.phase === 'windup') events.push({ type: 'enemyWindup', id: enemy.id, kind: enemy.kind });
      if (enemy.phase === 'attack') events.push({ type: 'enemyAttack', id: enemy.id, kind: enemy.kind });
    }
    if (out.strike) {
      // El ataque ya cuenta como hecho aunque se esquive: no vuelve a alcanzar en el mismo ataque.
      markStrikeLanded(enemy);
      const dealt = hurtPlayer(health, player, out.strike.damage, out.strike, {
        dodging: input.dodging,
        setting: input.damageSetting,
      });
      if (dealt > 0) pushPlayerHit(events, health, dealt, out.strike.fromX, out.strike.fromZ);
    }
    if (out.projectile) {
      state.projectiles.push(createProjectile(state.nextId++, out.projectile));
      events.push({ type: 'projectileFired', x: out.projectile.x, z: out.projectile.z });
    }
  }
  separate(state.enemies, player, input.playerRadius, input.blocks);
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    if ((state.enemies[i] as EnemyState).removed) state.enemies.splice(i, 1);
  }

  // 3) Proyectiles: vuelan, chocan o alcanzan al jugador (si esquiva o es invulnerable, lo atraviesan).
  const contacts = updateProjectiles(state.projectiles, dt, input.blocks, player, input.playerRadius);
  for (const { projectile } of contacts) {
    const dealt = hurtPlayer(
      health,
      player,
      projectile.damage,
      { fromX: projectile.x - projectile.vx, fromZ: projectile.z - projectile.vz },
      { dodging: input.dodging, setting: input.damageSetting },
    );
    if (dealt > 0) {
      projectile.state = 'hit';
      pushPlayerHit(events, health, dealt, projectile.x, projectile.z);
    }
  }
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i] as Projectile;
    if (p.state === 'flying') continue;
    if (p.state !== 'cut') events.push({ type: 'projectileEnded', x: p.x, z: p.z, how: p.state });
    state.projectiles.splice(i, 1);
  }

  // 4) Vida: tiempos y empuje del último golpe.
  updateHealth(health, dt);
  applyKnockback(health, player, input.playerRadius, dt, input.blocks);
  if (isDead(health) && !state.retryAnnounced && canRetry(health)) {
    state.retryAnnounced = true;
    events.push({ type: 'retryReady' });
  }

  // 5) Chispas.
  const collected = updateSparks(state.sparks, dt, player);
  if (collected > 0) {
    state.sparkCount += collected;
    events.push({ type: 'sparksCollected', count: collected });
  }
  pruneSparks(state.sparks);

  // 6) Oleadas (se detienen mientras el jugador está caído).
  if (playerAlive && state.wavesEnabled) {
    const wasFighting = state.waves.phase === 'fighting';
    const clearedNumber = waveNumber(state.waves);
    const orders = updateWaves(state.waves, dt, aliveEnemies(state), player, state.rng);
    if (wasFighting && state.waves.phase === 'waiting')
      events.push({ type: 'waveCleared', number: clearedNumber });
    if (orders.length > 0) events.push({ type: 'waveStarted', number: waveNumber(state.waves) });
    for (const order of orders) {
      const enemy = createEnemy(state.nextId++, order.kind, order.x, order.z, order.yaw, order.healthFactor);
      state.enemies.push(enemy);
      events.push({ type: 'enemySpawned', id: enemy.id, kind: enemy.kind });
    }
  }
  return events;
}

function pushPlayerHit(
  events: EncounterEvent[],
  health: HealthState,
  damage: number,
  fromX: number,
  fromZ: number,
): void {
  events.push({ type: 'playerHit', damage, fromX, fromZ });
  if (isDead(health)) events.push({ type: 'playerDown' });
}

/** Reintentar tras caer: sin enemigos ni proyectiles, vida llena y la misma oleada tras una pausa. */
export function retryEncounter(state: EncounterState): void {
  state.enemies.length = 0;
  state.projectiles.length = 0;
  state.sparks.length = 0;
  resetHealth(state.health);
  retryWave(state.waves);
  state.retryAnnounced = false;
}

/** Empezar de cero (al volver a la pantalla de inicio). */
export function resetEncounter(state: EncounterState): void {
  retryEncounter(state);
  state.waves = createWaves();
  state.sparkCount = 0;
}
