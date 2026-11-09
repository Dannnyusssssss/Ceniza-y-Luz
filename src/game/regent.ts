import { wrapAngle } from '../core/math';
import { REGENT, type RegentAttack, type RegentStage } from '../data/regent';
import type { Point2 } from '../data/arena';
import type { BossData } from '../data/zones';
import type { ProjectileSpawn } from './enemies';

export type RegentPhase =
  | 'dormant'
  | 'awakening'
  | 'stalk'
  | 'windup'
  | 'strike'
  | 'recover'
  | 'transition'
  | 'stagger'
  | 'dying'
  | 'defeated';

/** Anillo de ceniza que se ensancha desde donde estaba el Regente. Se cruza con la esquiva o el Impulso. */
export interface AshRing {
  readonly x: number;
  readonly z: number;
  radius: number;
  /** Ya tocó al jugador: un mismo anillo solo golpea una vez. */
  touched: boolean;
}

/** El jefe final: una máquina de estados pura. La partida le pasa la posición del jugador y atiende lo que devuelve. */
export interface RegentState {
  readonly data: BossData;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  health: number;
  phase: RegentPhase;
  /** Tiempo en la fase actual. */
  time: number;
  stage: RegentStage;
  /** Con el velo puesto no recibe daño. */
  veiled: boolean;
  /** Espera hasta que el velo vuelva. */
  veilDown: number;
  /** Qué braseros están encendidos. */
  braziers: boolean[];
  patternIndex: number;
  attack: RegentAttack;
  rings: AshRing[];
  ringsSpawned: number;
  /** Oscuridad de la sala, de 0 a 1. Cambia despacio: nunca es un parpadeo. */
  eclipse: number;
  /** Último golpe recibido: un mismo tajo o disparo no cuenta dos veces. */
  lastHit: number;
  /** Ya se aplicó el daño de este ataque. */
  struck: boolean;
}

/** Lo que pasó en este paso: lo atienden el sonido, los efectos y la interfaz. */
export type RegentEvent =
  | { readonly type: 'regentAwake' }
  | { readonly type: 'regentWindup'; readonly attack: RegentAttack }
  | { readonly type: 'regentStrike'; readonly attack: RegentAttack }
  | { readonly type: 'regentStage'; readonly stage: RegentStage }
  | { readonly type: 'regentHit'; readonly damage: number }
  | { readonly type: 'regentBlocked' }
  | { readonly type: 'regentBrazierLit'; readonly index: number; readonly lit: number }
  | { readonly type: 'regentVeilBroken' }
  | { readonly type: 'regentVeilBack' }
  | { readonly type: 'regentDying' }
  | { readonly type: 'regentDefeated' }
  | { readonly type: 'regentReset' };

/** Un golpe del jefe al jugador: la partida decide si cuenta (esquiva, invulnerabilidad). */
export interface RegentStrike {
  readonly damage: number;
  readonly fromX: number;
  readonly fromZ: number;
}

export interface RegentOutput {
  readonly events: RegentEvent[];
  readonly strike: RegentStrike | null;
  readonly projectiles: ProjectileSpawn[];
  /** Puntos donde aparecen Brumillas; la partida respeta el máximo a la vez. */
  readonly summons: Point2[];
}

function unlitBraziers(): boolean[] {
  return REGENT.braziers.map(() => false);
}

export function createRegent(data: BossData, defeated: boolean): RegentState {
  return {
    data,
    x: data.x,
    z: data.z,
    prevX: data.x,
    prevZ: data.z,
    yaw: Math.PI,
    prevYaw: Math.PI,
    health: defeated ? 0 : REGENT.maxHealth,
    phase: defeated ? 'defeated' : 'dormant',
    time: 0,
    stage: 1,
    veiled: false,
    veilDown: 0,
    braziers: unlitBraziers(),
    patternIndex: 0,
    attack: 'sweep',
    rings: [],
    ringsSpawned: 0,
    eclipse: 0,
    lastHit: -1,
    struck: false,
  };
}

function enter(state: RegentState, phase: RegentPhase): void {
  state.phase = phase;
  state.time = 0;
}

/** Vuelve a su sitio, con toda la vida. Se llama si el jugador sale de la sala o descansa. */
export function resetRegent(state: RegentState): void {
  if (state.phase === 'defeated') return;
  Object.assign(state, createRegent(state.data, false));
}

export function isRegentActive(state: RegentState): boolean {
  return state.phase !== 'dormant' && state.phase !== 'defeated';
}

/** Se le puede alcanzar: despierto y sin estar en un cambio de fase ni deshaciéndose. */
export function isRegentHittable(state: RegentState): boolean {
  return ['stalk', 'windup', 'strike', 'recover', 'stagger'].includes(state.phase);
}

function insideRoom(data: BossData, x: number, z: number): boolean {
  return x >= data.minX && x <= data.maxX && z >= data.minZ && z <= data.maxZ;
}

function clampToRoom(state: RegentState): void {
  const { minX, maxX, minZ, maxZ } = state.data;
  const margin = REGENT.radius;
  state.x = Math.min(Math.max(state.x, minX + margin), maxX - margin);
  state.z = Math.min(Math.max(state.z, minZ + margin), maxZ - margin);
}

function faceTowards(state: RegentState, px: number, pz: number, dt: number, rate: number): void {
  const target = Math.atan2(px - state.x, pz - state.z);
  const diff = wrapAngle(target - state.yaw);
  state.yaw = wrapAngle(state.yaw + Math.max(-rate * dt, Math.min(rate * dt, diff)));
}

function pattern(state: RegentState): readonly RegentAttack[] {
  return REGENT.patterns[state.stage];
}

function nextAttack(state: RegentState): RegentAttack {
  const list = pattern(state);
  return list[state.patternIndex % list.length] as RegentAttack;
}

function volley(state: RegentState): ProjectileSpawn[] {
  const { count, arc, speed, radius, lifetime, damage } = REGENT.attacks.volley;
  const list: ProjectileSpawn[] = [];
  for (let i = 0; i < count; i++) {
    const yaw = state.yaw + (i / (count - 1) - 0.5) * arc;
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    list.push({
      x: state.x + dirX * REGENT.radius,
      z: state.z + dirZ * REGENT.radius,
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

function summonPoints(state: RegentState): Point2[] {
  const d = REGENT.summonDistance;
  const { minX, maxX, minZ, maxZ } = state.data;
  return [-1, 1].map((side) => ({
    x: Math.min(Math.max(state.x + Math.cos(state.yaw) * d * side, minX + 1), maxX - 1),
    z: Math.min(Math.max(state.z - Math.sin(state.yaw) * d * side, minZ + 1), maxZ - 1),
  }));
}

/** El tajo: un sector delante de él, el mismo que se dibuja durante el aviso. */
function sweepHit(state: RegentState, px: number, pz: number): RegentStrike | null {
  const { damage, reach, halfArc } = REGENT.attacks.sweep;
  const dx = px - state.x;
  const dz = pz - state.z;
  if (Math.hypot(dx, dz) > reach) return null;
  if (Math.abs(wrapAngle(Math.atan2(dx, dz) - state.yaw)) > halfArc) return null;
  return { damage, fromX: state.x, fromZ: state.z };
}

/** Mueve los anillos y devuelve el golpe si uno alcanza al jugador. */
function updateRings(
  state: RegentState,
  dt: number,
  px: number,
  pz: number,
  alive: boolean,
): RegentStrike | null {
  const { speed, thickness, maxRadius, damage } = REGENT.attacks.rings;
  let strike: RegentStrike | null = null;
  for (const ring of state.rings) {
    ring.radius += speed * dt;
    if (ring.touched || !alive) continue;
    if (Math.abs(Math.hypot(px - ring.x, pz - ring.z) - ring.radius) <= thickness / 2) {
      ring.touched = true;
      strike = { damage, fromX: ring.x, fromZ: ring.z };
    }
  }
  state.rings = state.rings.filter((r) => r.radius <= maxRadius);
  return strike;
}

/** Avanza un paso. `px, pz`: el jugador. Un jugador caído no recibe más ataques. */
export function updateRegent(
  state: RegentState,
  dt: number,
  px: number,
  pz: number,
  playerAlive: boolean,
): RegentOutput {
  const events: RegentEvent[] = [];
  const projectiles: ProjectileSpawn[] = [];
  const summons: Point2[] = [];
  let strike: RegentStrike | null = null;
  const output = (): RegentOutput => ({ events, strike, projectiles, summons });
  state.prevX = state.x;
  state.prevZ = state.z;
  state.prevYaw = state.yaw;
  state.time += dt;
  const inside = insideRoom(state.data, px, pz);

  if (state.phase === 'defeated') return output();
  if (state.phase === 'dormant') {
    if (inside && playerAlive) {
      enter(state, 'awakening');
      events.push({ type: 'regentAwake' });
    }
    return output();
  }
  if (state.phase === 'dying') {
    // Al caer, la oscuridad se va tan despacio como llegó.
    state.eclipse = Math.max(0, state.eclipse - dt / REGENT.eclipseFade);
    if (state.time >= REGENT.dissolve) {
      enter(state, 'defeated');
      events.push({ type: 'regentDefeated' });
    }
    return output();
  }
  // Salir de la sala lo devuelve a su sitio: no se le gana de lejos ni entrando y saliendo.
  if (!inside && playerAlive) {
    resetRegent(state);
    events.push({ type: 'regentReset' });
    return output();
  }

  if (state.stage === 3) state.eclipse = Math.min(1, state.eclipse + dt / REGENT.eclipseFade);
  strike = updateRings(state, dt, px, pz, playerAlive);

  // El velo vuelve con el tiempo, pero no en medio de un aturdimiento.
  if (state.stage === 2 && !state.veiled && state.phase !== 'stagger' && state.phase !== 'transition') {
    state.veilDown = Math.max(0, state.veilDown - dt);
    if (state.veilDown === 0) {
      state.veiled = true;
      state.braziers = unlitBraziers();
      events.push({ type: 'regentVeilBack' });
    }
  }

  switch (state.phase) {
    case 'awakening':
      if (state.time >= REGENT.awaken) enter(state, 'stalk');
      break;
    case 'transition':
      if (state.time >= REGENT.transition) enter(state, 'stalk');
      break;
    case 'stagger':
      if (state.time >= REGENT.stagger) enter(state, 'stalk');
      break;
    case 'stalk': {
      if (!playerAlive) break;
      faceTowards(state, px, pz, dt, 2.6);
      const next = nextAttack(state);
      const distance = Math.hypot(px - state.x, pz - state.z);
      const wanted =
        next === 'sweep'
          ? REGENT.attacks.sweep.reach - 0.8
          : next === 'lunge'
            ? REGENT.attacks.lunge.length - 2
            : 9;
      if (distance > wanted) {
        const step = REGENT.speed * dt;
        state.x += ((px - state.x) / distance) * step;
        state.z += ((pz - state.z) / distance) * step;
        clampToRoom(state);
      }
      if (state.time >= REGENT.stalk && (distance <= wanted || state.time >= REGENT.stalk * 3)) {
        state.attack = next;
        state.patternIndex++;
        state.struck = false;
        state.ringsSpawned = 0;
        enter(state, 'windup');
        events.push({ type: 'regentWindup', attack: next });
      }
      break;
    }
    case 'windup': {
      const { windup } = REGENT.attacks[state.attack];
      // Se orienta mientras avisa, salvo al final: el último momento es la ventana para esquivar.
      if (state.time < windup * 0.6) faceTowards(state, px, pz, dt, 2.2);
      if (state.time >= windup) {
        enter(state, 'strike');
        events.push({ type: 'regentStrike', attack: state.attack });
      }
      break;
    }
    case 'strike': {
      const { active } = REGENT.attacks[state.attack];
      if (state.attack === 'sweep' && !state.struck && playerAlive) {
        const hit = sweepHit(state, px, pz);
        if (hit) {
          state.struck = true;
          strike = hit;
        }
      } else if (state.attack === 'lunge') {
        const { length, damage, halfWidth } = REGENT.attacks.lunge;
        const step = (length / active) * dt;
        state.x += Math.sin(state.yaw) * step;
        state.z += Math.cos(state.yaw) * step;
        clampToRoom(state);
        if (!state.struck && playerAlive && Math.hypot(px - state.x, pz - state.z) <= halfWidth) {
          state.struck = true;
          strike = { damage, fromX: state.x, fromZ: state.z };
        }
      } else if (state.attack === 'volley' && !state.struck) {
        state.struck = true;
        projectiles.push(...volley(state));
      } else if (state.attack === 'summon' && !state.struck) {
        state.struck = true;
        summons.push(...summonPoints(state));
      } else if (state.attack === 'rings') {
        const { count, gap } = REGENT.attacks.rings;
        if (state.ringsSpawned < count && state.time >= state.ringsSpawned * gap) {
          state.ringsSpawned++;
          state.rings.push({ x: state.x, z: state.z, radius: REGENT.radius, touched: false });
        }
      }
      if (state.time >= active) enter(state, 'recover');
      break;
    }
    case 'recover':
      if (state.time >= REGENT.attacks[state.attack].recover) enter(state, 'stalk');
      break;
  }
  return output();
}

/** Un golpe del jugador. `id` distingue cada tajo o disparo. Con el velo no hace daño, pero se avisa. */
export function hitRegent(state: RegentState, damage: number, id: number): RegentEvent[] {
  if (!isRegentHittable(state) || state.lastHit === id) return [];
  state.lastHit = id;
  if (state.veiled) return [{ type: 'regentBlocked' }];
  const factor = state.phase === 'stagger' ? REGENT.staggerDamageFactor : 1;
  const dealt = Math.round(damage * factor);
  state.health = Math.max(0, state.health - dealt);
  const events: RegentEvent[] = [{ type: 'regentHit', damage: dealt }];
  if (state.health <= 0) {
    state.rings = [];
    state.veiled = false;
    enter(state, 'dying');
    events.push({ type: 'regentDying' });
    return events;
  }
  const fraction = state.health / REGENT.maxHealth;
  if (state.stage === 1 && fraction <= REGENT.stageAt[2]) {
    state.stage = 2;
    state.veiled = true;
    state.braziers = unlitBraziers();
    state.patternIndex = 0;
    enter(state, 'transition');
    events.push({ type: 'regentStage', stage: 2 });
  } else if (state.stage === 2 && fraction <= REGENT.stageAt[3]) {
    state.stage = 3;
    state.veiled = false;
    state.patternIndex = 0;
    enter(state, 'transition');
    events.push({ type: 'regentStage', stage: 3 });
  }
  return events;
}

/** El Pulso alcanzó un brasero. Con los tres encendidos el velo se rompe y el Regente queda aturdido. */
export function lightBrazier(state: RegentState, index: number): RegentEvent[] {
  if (!state.veiled || !isRegentHittable(state) || state.braziers[index] !== false) return [];
  state.braziers[index] = true;
  const lit = state.braziers.filter(Boolean).length;
  const events: RegentEvent[] = [{ type: 'regentBrazierLit', index, lit }];
  if (lit === state.braziers.length) {
    state.veiled = false;
    state.veilDown = REGENT.veilBack;
    enter(state, 'stagger');
    events.push({ type: 'regentVeilBroken' });
  }
  return events;
}

/** Los braseros que aún responden al Pulso. */
export function pendingBraziers(state: RegentState): { index: number; x: number; z: number }[] {
  if (!state.veiled || !isRegentHittable(state)) return [];
  const list: { index: number; x: number; z: number }[] = [];
  REGENT.braziers.forEach((b, index) => {
    if (!state.braziers[index]) list.push({ index, x: b.x, z: b.z });
  });
  return list;
}

/** Fracción del aviso transcurrida (0 a 1); 0 fuera del aviso. */
export function regentWindupProgress(state: RegentState): number {
  if (state.phase !== 'windup') return 0;
  return Math.min(state.time / REGENT.attacks[state.attack].windup, 1);
}
