import type { BlockData } from '../data/arena';
import { ENEMIES, ENEMY_RULES, type EnemyKind, type EnemyStats } from '../data/enemies';
import { wrapAngle } from '../core/math';
import type { Rng } from '../core/rng';
import { moveCircle, resolveCircle, type Position2 } from '../world/collision';

export type EnemyRules = typeof ENEMY_RULES;

/**
 * Fases de un enemigo:
 * - `spawning`: surge de la bruma, todavía no actúa.
 * - `idle`: no ha visto al jugador.
 * - `chase`: se acerca (o se coloca a distancia, el Tirador).
 * - `circle`: rodea al jugador (Acechador).
 * - `windup`: aviso visible del ataque.
 * - `attack`: el ataque en curso; aquí hace daño.
 * - `recover`: pausa tras atacar; el momento de contraatacar.
 * - `stagger`: aturdido por un golpe.
 * - `dying`: se desvanece en ceniza.
 */
export type EnemyPhase =
  'spawning' | 'idle' | 'chase' | 'circle' | 'windup' | 'attack' | 'recover' | 'stagger' | 'dying';

export interface EnemyState {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly stats: EnemyStats;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  /** Hacia dónde mira (0 = +z, como el jugador). */
  yaw: number;
  prevYaw: number;
  health: number;
  readonly maxHealth: number;
  phase: EnemyPhase;
  /** Tiempo dentro de la fase actual. */
  time: number;
  /** Duración elegida para la fase actual cuando varía (rodear). */
  phaseLength: number;
  /** Ya vio al jugador (en la arena, desde que aparece). */
  alerted: boolean;
  /** Vive en una zona: espera hasta ver al jugador y lo pierde de vista si se aleja. */
  readonly roaming: boolean;
  /** Punto del golpe del Coloso, fijado al empezar el aviso (se dibuja en el suelo). */
  targetX: number;
  targetZ: number;
  /** Dirección fijada del salto o la embestida. */
  dirX: number;
  dirZ: number;
  /** Sentido en que rodea (1 o −1). */
  orbit: number;
  knockVx: number;
  knockVz: number;
  /** El ataque actual ya alcanzó al jugador. */
  hitDone: boolean;
  /** Último golpe del jugador recibido (un golpe solo cuenta una vez). */
  lastSwingId: number;
  /** Tiempo desde el último golpe recibido (destello y sacudida). */
  sinceHit: number;
  /** Velocidad del último paso (para la animación). */
  speed: number;
  /** Ya terminó de desvanecerse: se puede quitar. */
  removed: boolean;
}

/** Lo que necesita un enemigo para decidir en este paso. */
export interface EnemyContext {
  readonly player: Position2;
  readonly playerRadius: number;
  /** Si el jugador está muerto, los enemigos dejan de atacar. */
  readonly playerAlive: boolean;
  readonly blocks: readonly BlockData[];
  readonly rng: Rng;
}

/** Golpe que el enemigo intenta hacer al jugador en este paso. */
export interface EnemyStrike {
  readonly damage: number;
  readonly fromX: number;
  readonly fromZ: number;
}

/** Proyectil que hay que crear (lo dispara el Tirador). */
export interface ProjectileSpawn {
  readonly x: number;
  readonly z: number;
  readonly dirX: number;
  readonly dirZ: number;
  readonly speed: number;
  readonly radius: number;
  readonly lifetime: number;
  readonly damage: number;
}

export interface EnemyOutput {
  strike: EnemyStrike | null;
  projectile: ProjectileSpawn | null;
}

export function createEnemy(
  id: number,
  kind: EnemyKind,
  x: number,
  z: number,
  yaw: number,
  healthFactor = 1,
  roaming = false,
): EnemyState {
  const stats = ENEMIES[kind];
  const maxHealth = Math.max(1, Math.round(stats.maxHealth * healthFactor));
  return {
    id,
    kind,
    stats,
    x,
    z,
    prevX: x,
    prevZ: z,
    yaw,
    prevYaw: yaw,
    health: maxHealth,
    maxHealth,
    phase: roaming ? 'idle' : 'spawning',
    time: 0,
    phaseLength: 0,
    alerted: !roaming,
    roaming,
    targetX: x,
    targetZ: z,
    dirX: 0,
    dirZ: 1,
    orbit: 1,
    knockVx: 0,
    knockVz: 0,
    hitDone: false,
    lastSwingId: -1,
    sinceHit: Number.POSITIVE_INFINITY,
    speed: 0,
    removed: false,
  };
}

export function isAlive(enemy: EnemyState): boolean {
  return enemy.phase !== 'dying' && !enemy.removed;
}

/** Puede recibir golpes (no mientras surge ni mientras se desvanece). */
export function isHittable(enemy: EnemyState): boolean {
  return enemy.phase !== 'spawning' && isAlive(enemy);
}

function setPhase(enemy: EnemyState, phase: EnemyPhase, length = 0): void {
  enemy.phase = phase;
  enemy.time = 0;
  enemy.phaseLength = length;
  if (phase === 'attack') enemy.hitDone = false;
}

function faceTowards(enemy: EnemyState, x: number, z: number, dt: number, rules: EnemyRules): void {
  const target = Math.atan2(x - enemy.x, z - enemy.z);
  const diff = wrapAngle(target - enemy.yaw);
  const maxTurn = rules.turnRate * dt;
  enemy.yaw = wrapAngle(enemy.yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
}

/** Avance del enemigo en una dirección, deslizando por las paredes. */
function step(enemy: EnemyState, vx: number, vz: number, dt: number, ctx: EnemyContext): void {
  moveCircle(enemy, vx * dt, vz * dt, enemy.stats.radius, ctx.blocks);
}

/**
 * Recibe un golpe del jugador. Cuenta una vez por `swingId`. Empuja, aturde (si el tipo se aturde)
 * y, si la vida llega a cero, empieza a desvanecerse. Devuelve el daño hecho.
 */
export function hitEnemy(
  enemy: EnemyState,
  damage: number,
  swingId: number,
  fromX: number,
  fromZ: number,
  rules: EnemyRules = ENEMY_RULES,
): number {
  if (!isHittable(enemy) || swingId === enemy.lastSwingId || !(damage > 0)) return 0;
  enemy.lastSwingId = swingId;
  const dealt = Math.min(enemy.health, damage);
  enemy.health -= dealt;
  enemy.sinceHit = 0;
  const dx = enemy.x - fromX;
  const dz = enemy.z - fromZ;
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const push = rules.knockbackSpeed * enemy.stats.knockbackTaken;
  enemy.knockVx = (dx / len) * push;
  enemy.knockVz = (dz / len) * push;
  if (enemy.health <= 0) {
    enemy.health = 0;
    setPhase(enemy, 'dying');
    return dealt;
  }
  // Los tipos que se aturden interrumpen lo que hacían, salvo un ataque ya lanzado.
  if (enemy.stats.staggerable && enemy.phase !== 'attack') setPhase(enemy, 'stagger', rules.stagger);
  return dealt;
}

/** Avanza un enemigo un paso fijo. */
export function updateEnemy(
  enemy: EnemyState,
  dt: number,
  ctx: EnemyContext,
  rules: EnemyRules = ENEMY_RULES,
): EnemyOutput {
  const out: EnemyOutput = { strike: null, projectile: null };
  enemy.prevX = enemy.x;
  enemy.prevZ = enemy.z;
  enemy.prevYaw = enemy.yaw;
  enemy.time += dt;
  enemy.sinceHit += dt;
  if (enemy.removed) return out;

  // Empuje recibido: se frena enseguida.
  if (enemy.knockVx !== 0 || enemy.knockVz !== 0) {
    step(enemy, enemy.knockVx, enemy.knockVz, dt, ctx);
    const damping = Math.exp(-rules.knockbackDamping * dt);
    enemy.knockVx *= damping;
    enemy.knockVz *= damping;
    if (Math.abs(enemy.knockVx) + Math.abs(enemy.knockVz) < 0.05) enemy.knockVx = enemy.knockVz = 0;
  }

  if (enemy.phase === 'dying') {
    if (enemy.time >= rules.dissolveTime) enemy.removed = true;
    finishStep(enemy, dt);
    return out;
  }
  if (enemy.phase === 'spawning') {
    if (enemy.time >= rules.spawnTime) setPhase(enemy, enemy.alerted ? 'chase' : 'idle');
    finishStep(enemy, dt);
    return out;
  }
  if (enemy.phase === 'stagger') {
    if (enemy.time >= enemy.phaseLength) setPhase(enemy, 'chase');
    finishStep(enemy, dt);
    return out;
  }

  const dx = ctx.player.x - enemy.x;
  const dz = ctx.player.z - enemy.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const stats = enemy.stats;

  // Sin jugador vivo: se quedan quietos mirando (no atacan a quien ya cayó).
  if (!ctx.playerAlive) {
    if (enemy.phase !== 'recover' && enemy.phase !== 'attack') setPhase(enemy, 'idle');
    if (enemy.phase === 'attack' || enemy.phase === 'recover')
      runAttackPhases(enemy, dt, ctx, dist, out, false);
    finishStep(enemy, dt);
    return out;
  }

  if (enemy.phase === 'idle') {
    if (enemy.alerted || dist <= stats.detectRange) {
      enemy.alerted = true;
      setPhase(enemy, 'chase');
    }
    finishStep(enemy, dt);
    return out;
  }

  if (enemy.phase === 'windup' || enemy.phase === 'attack' || enemy.phase === 'recover') {
    runAttackPhases(enemy, dt, ctx, dist, out, true);
    finishStep(enemy, dt);
    return out;
  }

  // Un enemigo de zona pierde de vista al jugador que se aleja y se queda donde está.
  if (enemy.roaming && dist > stats.detectRange * rules.loseInterestFactor) {
    enemy.alerted = false;
    setPhase(enemy, 'idle');
    finishStep(enemy, dt);
    return out;
  }

  // Moverse (perseguir, rodear o colocarse) según el tipo.
  switch (stats.behavior) {
    case 'charger':
    case 'brute': {
      faceTowards(enemy, ctx.player.x, ctx.player.z, dt, rules);
      if (dist <= stats.attackRange) {
        startWindup(enemy, ctx);
      } else {
        const keep = stats.attackRange * 0.8;
        if (dist > keep) step(enemy, (dx / dist) * stats.speed, (dz / dist) * stats.speed, dt, ctx);
      }
      break;
    }
    case 'circler': {
      faceTowards(enemy, ctx.player.x, ctx.player.z, dt, rules);
      if (enemy.phase === 'chase') {
        if (dist <= stats.circleRadius + 1) {
          enemy.orbit = ctx.rng.next() < 0.5 ? 1 : -1;
          setPhase(enemy, 'circle', ctx.rng.range(stats.circleTime[0], stats.circleTime[1]));
        } else {
          step(enemy, (dx / dist) * stats.speed, (dz / dist) * stats.speed, dt, ctx);
        }
        break;
      }
      // Rodear: avance tangencial y corrección hacia la distancia de rodeo.
      const nx = dist > 1e-6 ? dx / dist : 0;
      const nz = dist > 1e-6 ? dz / dist : 1;
      const tx = -nz * enemy.orbit;
      const tz = nx * enemy.orbit;
      const radial = Math.max(-1, Math.min(1, (dist - stats.circleRadius) / 1.5));
      const speed = stats.speed * 0.75;
      step(enemy, (tx + nx * radial) * speed, (tz + nz * radial) * speed, dt, ctx);
      if (enemy.time >= enemy.phaseLength && dist <= stats.attackRange) startWindup(enemy, ctx);
      else if (dist > stats.circleRadius * 2.2) setPhase(enemy, 'chase');
      break;
    }
    case 'shooter': {
      faceTowards(enemy, ctx.player.x, ctx.player.z, dt, rules);
      const [near, far] = stats.preferredRange;
      const nx = dist > 1e-6 ? dx / dist : 0;
      const nz = dist > 1e-6 ? dz / dist : 1;
      if (dist < near) step(enemy, -nx * stats.speed, -nz * stats.speed, dt, ctx);
      else if (dist > far) step(enemy, nx * stats.speed, nz * stats.speed, dt, ctx);
      else if (dist <= stats.attackRange && enemy.time >= 0.4) startWindup(enemy, ctx);
      break;
    }
  }

  finishStep(enemy, dt);
  return out;
}

function startWindup(enemy: EnemyState, ctx: EnemyContext): void {
  setPhase(enemy, 'windup');
  const stats = enemy.stats;
  if (stats.behavior === 'brute') {
    // El golpe cae delante del Coloso, donde estaba el jugador al empezar el aviso.
    const dx = ctx.player.x - enemy.x;
    const dz = ctx.player.z - enemy.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    enemy.yaw = Math.atan2(dx, dz);
    enemy.targetX = enemy.x + (dx / len) * stats.slamReach;
    enemy.targetZ = enemy.z + (dz / len) * stats.slamReach;
  }
}

function runAttackPhases(
  enemy: EnemyState,
  dt: number,
  ctx: EnemyContext,
  dist: number,
  out: EnemyOutput,
  canStrike: boolean,
): void {
  const stats = enemy.stats;
  if (enemy.phase === 'windup') {
    // Durante el aviso sigue mirando al jugador (salvo el Coloso, que ya marcó dónde golpea).
    if (stats.behavior !== 'brute') faceTowards(enemy, ctx.player.x, ctx.player.z, dt, ENEMY_RULES);
    if (enemy.time >= stats.windup) {
      const dx = ctx.player.x - enemy.x;
      const dz = ctx.player.z - enemy.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      if (stats.behavior === 'charger' || stats.behavior === 'circler') {
        enemy.dirX = dx / len;
        enemy.dirZ = dz / len;
        enemy.yaw = Math.atan2(dx, dz);
      }
      setPhase(enemy, 'attack');
      if (stats.behavior === 'shooter' && canStrike) {
        out.projectile = {
          x: enemy.x + (dx / len) * (stats.radius + 0.2),
          z: enemy.z + (dz / len) * (stats.radius + 0.2),
          dirX: dx / len,
          dirZ: dz / len,
          speed: stats.projectileSpeed,
          radius: stats.projectileRadius,
          lifetime: stats.projectileLifetime,
          damage: stats.damage,
        };
        enemy.hitDone = true;
      }
    }
    return;
  }
  if (enemy.phase === 'attack') {
    if (stats.behavior === 'charger')
      step(enemy, enemy.dirX * stats.lungeSpeed, enemy.dirZ * stats.lungeSpeed, dt, ctx);
    if (stats.behavior === 'circler')
      step(enemy, enemy.dirX * stats.dashSpeed, enemy.dirZ * stats.dashSpeed, dt, ctx);
    if (canStrike && !enemy.hitDone) {
      const hx = stats.behavior === 'brute' ? enemy.targetX : enemy.x;
      const hz = stats.behavior === 'brute' ? enemy.targetZ : enemy.z;
      const px = ctx.player.x - hx;
      const pz = ctx.player.z - hz;
      if (stats.hitRadius > 0 && Math.sqrt(px * px + pz * pz) <= stats.hitRadius + ctx.playerRadius) {
        out.strike = { damage: stats.damage, fromX: enemy.x, fromZ: enemy.z };
      }
    }
    if (enemy.time >= stats.active) setPhase(enemy, 'recover');
    return;
  }
  // recover
  if (enemy.time >= stats.recover) {
    if (stats.behavior === 'circler' && dist <= stats.circleRadius * 1.8) {
      setPhase(enemy, 'circle', ctx.rng.range(stats.circleTime[0], stats.circleTime[1]));
    } else {
      setPhase(enemy, 'chase');
    }
  }
}

function finishStep(enemy: EnemyState, dt: number): void {
  enemy.speed = dt > 0 ? Math.sqrt((enemy.x - enemy.prevX) ** 2 + (enemy.z - enemy.prevZ) ** 2) / dt : 0;
}

/** El ataque en curso ya alcanzó al jugador: no vuelve a hacer daño hasta el siguiente. */
export function markStrikeLanded(enemy: EnemyState): void {
  enemy.hitDone = true;
}

/**
 * Separa a los enemigos entre sí y del jugador (nadie se atraviesa). El jugador no se mueve:
 * los enemigos se apartan. Al final, nadie queda dentro de un muro.
 */
export function separate(
  enemies: readonly EnemyState[],
  player: Position2,
  playerRadius: number,
  blocks: readonly BlockData[],
): void {
  const solid = enemies.filter((e) => isAlive(e) && e.phase !== 'spawning');
  for (let i = 0; i < solid.length; i++) {
    const a = solid[i] as EnemyState;
    for (let j = i + 1; j < solid.length; j++) {
      const b = solid[j] as EnemyState;
      pushApart(a, a.stats.radius, b, b.stats.radius, 0.5);
    }
    pushApart(a, a.stats.radius, player, playerRadius, 1);
  }
  for (const e of solid) resolveCircle(e, e.stats.radius, blocks);
}

/** Aparta dos círculos que se tocan. `share` = parte del empuje que se lleva el primero. */
function pushApart(a: Position2, ra: number, b: Position2, rb: number, share: number): void {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const min = ra + rb;
  const distSq = dx * dx + dz * dz;
  if (distSq >= min * min) return;
  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-6 ? dx / dist : 1;
  const nz = dist > 1e-6 ? dz / dist : 0;
  const overlap = min - dist;
  a.x += nx * overlap * share;
  a.z += nz * overlap * share;
  if (share < 1) {
    b.x -= nx * overlap * (1 - share);
    b.z -= nz * overlap * (1 - share);
  }
}

/** Progreso del aviso (0..1) para dibujar el indicador; 0 fuera del aviso. */
export function windupProgress(enemy: EnemyState): number {
  return enemy.phase === 'windup' ? Math.min(enemy.time / enemy.stats.windup, 1) : 0;
}
