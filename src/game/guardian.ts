import { approach, wrapAngle } from '../core/math';
import { GUARDIAN, type GuardianAttack } from '../data/guardian';
import type { BossData } from '../data/zones';
import type { ProjectileSpawn } from './enemies';

export type GuardianPhase =
  | 'dormant'
  | 'awakening'
  | 'stalk'
  | 'windup'
  | 'strike'
  | 'recover'
  | 'shielding'
  | 'stagger'
  | 'dying'
  | 'defeated';

export interface SpikePoint {
  readonly x: number;
  readonly z: number;
}

/** El jefe: una máquina de estados pura. La partida le pasa la posición del jugador y atiende lo que devuelve. */
export interface GuardianState {
  readonly data: BossData;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  health: number;
  phase: GuardianPhase;
  /** Tiempo en la fase actual. */
  time: number;
  stage: 1 | 2;
  armored: boolean;
  /** Espera hasta volver a cubrirse tras romperle la coraza. */
  armorDown: number;
  patternIndex: number;
  attack: GuardianAttack;
  spikes: SpikePoint[];
  /** Último golpe recibido: un mismo tajo o disparo no cuenta dos veces. */
  lastHit: number;
  /** Ya se aplicó el daño de este ataque. */
  struck: boolean;
}

/** Lo que pasó en este paso: lo atienden el sonido, los efectos y la interfaz. */
export type GuardianEvent =
  | { readonly type: 'guardianAwake' }
  | { readonly type: 'guardianWindup'; readonly attack: GuardianAttack }
  | { readonly type: 'guardianStrike'; readonly attack: GuardianAttack }
  | { readonly type: 'guardianStage' }
  | { readonly type: 'guardianHit'; readonly damage: number }
  | { readonly type: 'guardianBlocked' }
  | { readonly type: 'guardianArmorBroken' }
  | { readonly type: 'guardianArmorBack' }
  | { readonly type: 'guardianDying' }
  | { readonly type: 'guardianDefeated' }
  | { readonly type: 'guardianReset' };

/** Un golpe del jefe al jugador: la partida decide si cuenta (esquiva, invulnerabilidad). */
export interface GuardianStrike {
  readonly damage: number;
  readonly fromX: number;
  readonly fromZ: number;
}

export interface GuardianOutput {
  readonly events: GuardianEvent[];
  readonly strike: GuardianStrike | null;
  readonly projectiles: ProjectileSpawn[];
}

export function createGuardian(data: BossData, defeated: boolean): GuardianState {
  return {
    data,
    x: data.x,
    z: data.z,
    prevX: data.x,
    prevZ: data.z,
    yaw: Math.PI,
    prevYaw: Math.PI,
    health: defeated ? 0 : GUARDIAN.maxHealth,
    phase: defeated ? 'defeated' : 'dormant',
    time: 0,
    stage: 1,
    armored: false,
    armorDown: 0,
    patternIndex: 0,
    attack: 'sweep',
    spikes: [],
    lastHit: -1,
    struck: false,
  };
}

function enter(state: GuardianState, phase: GuardianPhase): void {
  state.phase = phase;
  state.time = 0;
}

/** Vuelve a dormir, con toda la vida. Se llama si el jugador sale de la sala o reaparece. */
export function resetGuardian(state: GuardianState): void {
  if (state.phase === 'defeated') return;
  const fresh = createGuardian(state.data, false);
  Object.assign(state, fresh);
}

export function isGuardianActive(state: GuardianState): boolean {
  return state.phase !== 'dormant' && state.phase !== 'defeated';
}

/** Se puede golpear: despierto y sin estar en un cambio de fase ni deshaciéndose. */
export function isGuardianHittable(state: GuardianState): boolean {
  return ['stalk', 'windup', 'strike', 'recover', 'stagger'].includes(state.phase);
}

function insideRoom(data: BossData, x: number, z: number): boolean {
  return x >= data.minX && x <= data.maxX && z >= data.minZ && z <= data.maxZ;
}

/** Puntos donde saldrán las púas: uno donde está el jugador y el resto alrededor. Siempre dentro de la sala. */
export function spikePoints(
  data: BossData,
  x: number,
  z: number,
  count: number,
  spread: number,
): SpikePoint[] {
  const points: SpikePoint[] = [{ x, z }];
  for (let i = 1; i < count; i++) {
    const angle = (i / (count - 1)) * Math.PI * 2 + 0.6;
    const px = x + Math.cos(angle) * spread;
    const pz = z + Math.sin(angle) * spread;
    points.push({
      x: Math.min(Math.max(px, data.minX + 1), data.maxX - 1),
      z: Math.min(Math.max(pz, data.minZ + 1), data.maxZ - 1),
    });
  }
  return points;
}

function pattern(state: GuardianState): readonly GuardianAttack[] {
  return GUARDIAN.patterns[state.stage];
}

function startAttack(state: GuardianState, px: number, pz: number, events: GuardianEvent[]): void {
  const list = pattern(state);
  const attack = list[state.patternIndex % list.length] as GuardianAttack;
  state.patternIndex++;
  state.attack = attack;
  state.struck = false;
  if (attack === 'spikes') {
    const { count, spread } = GUARDIAN.attacks.spikes;
    state.spikes = spikePoints(state.data, px, pz, count, spread);
  }
  enter(state, 'windup');
  events.push({ type: 'guardianWindup', attack });
}

function faceTowards(state: GuardianState, px: number, pz: number, dt: number, rate: number): void {
  const target = Math.atan2(px - state.x, pz - state.z);
  const diff = wrapAngle(target - state.yaw);
  state.yaw = wrapAngle(state.yaw + Math.max(-rate * dt, Math.min(rate * dt, diff)));
}

/** Aplica el daño del ataque, una sola vez, si el jugador está en la zona que se anunció. */
function resolveStrike(state: GuardianState, px: number, pz: number): GuardianStrike | null {
  if (state.attack === 'sweep') {
    const { damage, reach, halfArc } = GUARDIAN.attacks.sweep;
    const dx = px - state.x;
    const dz = pz - state.z;
    if (Math.hypot(dx, dz) > reach) return null;
    if (Math.abs(wrapAngle(Math.atan2(dx, dz) - state.yaw)) > halfArc) return null;
    return { damage, fromX: state.x, fromZ: state.z };
  }
  if (state.attack === 'spikes') {
    const { damage, radius } = GUARDIAN.attacks.spikes;
    for (const s of state.spikes) {
      if (Math.hypot(px - s.x, pz - s.z) <= radius) return { damage, fromX: s.x, fromZ: s.z };
    }
  }
  return null;
}

function shardVolley(state: GuardianState): ProjectileSpawn[] {
  const { count, arc, speed, radius, lifetime, damage } = GUARDIAN.attacks.shards;
  const list: ProjectileSpawn[] = [];
  for (let i = 0; i < count; i++) {
    const yaw = state.yaw + (i / (count - 1) - 0.5) * arc;
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    list.push({
      x: state.x + dirX * GUARDIAN.radius,
      z: state.z + dirZ * GUARDIAN.radius,
      dirX,
      dirZ,
      speed,
      radius,
      damage,
      lifetime,
    });
  }
  return list;
}

/** Avanza un paso. `px, pz`: el jugador. Un jugador caído no recibe más ataques. */
export function updateGuardian(
  state: GuardianState,
  dt: number,
  px: number,
  pz: number,
  playerAlive: boolean,
): GuardianOutput {
  const events: GuardianEvent[] = [];
  const projectiles: ProjectileSpawn[] = [];
  let strike: GuardianStrike | null = null;
  state.prevX = state.x;
  state.prevZ = state.z;
  state.prevYaw = state.yaw;
  state.time += dt;
  const inside = insideRoom(state.data, px, pz);

  if (state.phase === 'defeated') return { events, strike, projectiles };
  if (state.phase === 'dormant') {
    if (inside && playerAlive) {
      enter(state, 'awakening');
      events.push({ type: 'guardianAwake' });
    }
    return { events, strike, projectiles };
  }
  if (state.phase === 'dying') {
    if (state.time >= GUARDIAN.dissolve) {
      enter(state, 'defeated');
      events.push({ type: 'guardianDefeated' });
    }
    return { events, strike, projectiles };
  }
  // Salir de la sala lo devuelve a su sitio: no se le gana de lejos ni entrando y saliendo.
  if (!inside && playerAlive) {
    resetGuardian(state);
    events.push({ type: 'guardianReset' });
    return { events, strike, projectiles };
  }

  // La coraza vuelve con el tiempo, pero no en medio de un aturdimiento.
  if (state.stage === 2 && !state.armored && state.phase !== 'stagger') {
    state.armorDown = Math.max(0, state.armorDown - dt);
    if (state.armorDown === 0) {
      state.armored = true;
      events.push({ type: 'guardianArmorBack' });
    }
  }

  switch (state.phase) {
    case 'awakening':
      if (state.time >= GUARDIAN.awaken) enter(state, 'stalk');
      break;
    case 'shielding':
      if (state.time >= GUARDIAN.shielding) enter(state, 'stalk');
      break;
    case 'stagger':
      if (state.time >= GUARDIAN.stagger) enter(state, 'stalk');
      break;
    case 'stalk': {
      if (!playerAlive) break;
      faceTowards(state, px, pz, dt, 2.4);
      const next = pattern(state)[state.patternIndex % pattern(state).length] as GuardianAttack;
      const distance = Math.hypot(px - state.x, pz - state.z);
      const wanted = next === 'sweep' ? GUARDIAN.attacks.sweep.reach - 0.8 : 7;
      if (distance > wanted) {
        const step = GUARDIAN.speed * dt;
        state.x = approach(state.x, state.x + ((px - state.x) / distance) * step, step);
        state.z = approach(state.z, state.z + ((pz - state.z) / distance) * step, step);
      }
      if (state.time >= GUARDIAN.stalk && (distance <= wanted || state.time >= GUARDIAN.stalk * 3)) {
        startAttack(state, px, pz, events);
      }
      break;
    }
    case 'windup': {
      const data = GUARDIAN.attacks[state.attack];
      // Se orienta mientras avisa, salvo al final: el último momento es la ventana para esquivar.
      if (state.time < data.windup * 0.6) faceTowards(state, px, pz, dt, 2);
      if (state.time >= data.windup) {
        enter(state, 'strike');
        events.push({ type: 'guardianStrike', attack: state.attack });
      }
      break;
    }
    case 'strike': {
      const data = GUARDIAN.attacks[state.attack];
      if (state.attack === 'shards' && !state.struck) {
        state.struck = true;
        projectiles.push(...shardVolley(state));
      } else if (!state.struck && playerAlive) {
        const hit = resolveStrike(state, px, pz);
        if (hit) {
          state.struck = true;
          strike = hit;
        }
      }
      if (state.time >= data.active) enter(state, 'recover');
      break;
    }
    case 'recover':
      if (state.time >= GUARDIAN.attacks[state.attack].recover) enter(state, 'stalk');
      break;
  }
  return { events, strike, projectiles };
}

/** Un golpe del jugador. `id` distingue cada tajo o disparo. Con coraza no hace daño, pero se avisa. */
export function hitGuardian(state: GuardianState, damage: number, id: number): GuardianEvent[] {
  if (!isGuardianHittable(state) || state.lastHit === id) return [];
  state.lastHit = id;
  if (state.armored) return [{ type: 'guardianBlocked' }];
  const factor = state.phase === 'stagger' ? GUARDIAN.staggerDamageFactor : 1;
  const dealt = Math.round(damage * factor);
  state.health = Math.max(0, state.health - dealt);
  const events: GuardianEvent[] = [{ type: 'guardianHit', damage: dealt }];
  if (state.health <= 0) {
    enter(state, 'dying');
    state.spikes = [];
    events.push({ type: 'guardianDying' });
  } else if (state.stage === 1 && state.health <= GUARDIAN.maxHealth * GUARDIAN.secondStageAt) {
    state.stage = 2;
    state.armored = true;
    state.patternIndex = 0;
    state.spikes = [];
    enter(state, 'shielding');
    events.push({ type: 'guardianStage' });
  }
  return events;
}

/** La carrera del Impulso le rompe la coraza si pasa cerca. Solo cuenta si la lleva puesta. */
export function dashAgainstGuardian(state: GuardianState, x: number, z: number): GuardianEvent[] {
  if (!state.armored || !isGuardianHittable(state)) return [];
  if (Math.hypot(x - state.x, z - state.z) > GUARDIAN.radius + GUARDIAN.dashHitMargin) return [];
  state.armored = false;
  state.armorDown = GUARDIAN.armorDownTime;
  state.spikes = [];
  enter(state, 'stagger');
  return [{ type: 'guardianArmorBroken' }];
}

/** Fracción del aviso transcurrida (0 a 1); 0 fuera del aviso. */
export function guardianWindupProgress(state: GuardianState): number {
  if (state.phase !== 'windup') return 0;
  return Math.min(state.time / GUARDIAN.attacks[state.attack].windup, 1);
}
