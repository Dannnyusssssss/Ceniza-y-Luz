import type { BlockData } from '../data/arena';
import { ABILITY_BALANCE } from '../data/items';
import { wrapAngle } from '../core/math';
import { resolveCircle, type Position2 } from '../world/collision';

/** Disparo del Pulso de Luz: vuela sobre las grietas y se detiene en los muros. */
export interface Pulse {
  readonly id: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  readonly dirX: number;
  readonly dirZ: number;
  travelled: number;
  alive: boolean;
}

/** Carrera del Impulso en curso: va en línea recta del origen al destino calculado al salir. */
export interface Dash {
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  time: number;
}

/** Estado de las dos habilidades. Solo tienen tiempo de espera: no gastan nada. */
export interface AbilityState {
  pulseCooldown: number;
  dashCooldown: number;
  dash: Dash | null;
  readonly pulses: Pulse[];
  nextPulseId: number;
}

export function createAbilities(): AbilityState {
  return { pulseCooldown: 0, dashCooldown: 0, dash: null, pulses: [], nextPulseId: 1 };
}

/** Vuelve al reposo (al cambiar de zona o reaparecer). */
export function resetAbilities(state: AbilityState): void {
  state.pulseCooldown = 0;
  state.dashCooldown = 0;
  state.dash = null;
  state.pulses.length = 0;
}

export function updateCooldowns(state: AbilityState, dt: number): void {
  state.pulseCooldown = Math.max(0, state.pulseCooldown - dt);
  state.dashCooldown = Math.max(0, state.dashCooldown - dt);
}

/** Solo los bloques que paran lo que va por el aire o a la carrera (las grietas no). */
export function withoutCracks(blocks: readonly BlockData[]): BlockData[] {
  return blocks.filter((b) => b.kind !== 'crack');
}

/**
 * Hacia dónde sale el disparo: donde se apunta o, si hay un objetivo cerca de esa línea y a su alcance, hacia él.
 * Con el ratón es difícil acertar a una antorcha lejana: el ajuste evita que apuntar sea el reto.
 */
export function aimYaw(
  x: number,
  z: number,
  yaw: number,
  targets: readonly { readonly x: number; readonly z: number }[],
  range: number = ABILITY_BALANCE.pulso.range,
  halfAngle: number = ABILITY_BALANCE.pulso.aimHalfAngle,
): number {
  let best = yaw;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    const distance = Math.hypot(t.x - x, t.z - z);
    if (distance > range || distance < 1e-3) continue;
    const toTarget = Math.atan2(t.x - x, t.z - z);
    const off = Math.abs(wrapAngle(toTarget - yaw));
    if (off > halfAngle || off >= bestScore) continue;
    bestScore = off;
    best = toTarget;
  }
  return best;
}

/** Lanza el Pulso desde (x, z) hacia `yaw`. Devuelve el disparo, o null si aún está en espera. */
export function firePulse(state: AbilityState, x: number, z: number, yaw: number): Pulse | null {
  if (state.pulseCooldown > 0) return null;
  state.pulseCooldown = ABILITY_BALANCE.pulso.cooldown;
  const pulse: Pulse = {
    id: state.nextPulseId++,
    x,
    z,
    prevX: x,
    prevZ: z,
    dirX: Math.sin(yaw),
    dirZ: Math.cos(yaw),
    travelled: 0,
    alive: true,
  };
  state.pulses.push(pulse);
  return pulse;
}

function overlapsAny(x: number, z: number, radius: number, blocks: readonly BlockData[]): boolean {
  for (const b of blocks) {
    const cx = Math.min(Math.max(x, b.x - b.halfX), b.x + b.halfX);
    const cz = Math.min(Math.max(z, b.z - b.halfZ), b.z + b.halfZ);
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
  }
  return false;
}

/**
 * Mueve los disparos un paso. Los que chocan con un muro o agotan el alcance dejan de estar vivos, pero siguen
 * en la lista este paso: quien llama comprueba antes qué objetivos alcanzó el tramo recorrido y luego los quita.
 */
export function movePulses(state: AbilityState, dt: number, blocks: readonly BlockData[]): void {
  const { speed, range, radius } = ABILITY_BALANCE.pulso;
  for (const p of state.pulses) {
    p.prevX = p.x;
    p.prevZ = p.z;
    p.x += p.dirX * speed * dt;
    p.z += p.dirZ * speed * dt;
    p.travelled += speed * dt;
    if (p.travelled >= range || overlapsAny(p.x, p.z, radius, blocks)) p.alive = false;
  }
}

/** Quita los disparos que ya terminaron. Devuelve dónde acabó cada uno (para el efecto). */
export function prunePulses(state: AbilityState): Position2[] {
  const ended: Position2[] = [];
  for (let i = state.pulses.length - 1; i >= 0; i--) {
    const p = state.pulses[i] as Pulse;
    if (p.alive) continue;
    ended.push({ x: p.x, z: p.z });
    state.pulses.splice(i, 1);
  }
  return ended;
}

/** True si el tramo recorrido por el disparo en este paso toca un círculo. */
export function pulseTouches(pulse: Pulse, x: number, z: number, radius: number): boolean {
  const dx = pulse.x - pulse.prevX;
  const dz = pulse.z - pulse.prevZ;
  const len = dx * dx + dz * dz;
  const t = len > 0 ? Math.min(Math.max(((x - pulse.prevX) * dx + (z - pulse.prevZ) * dz) / len, 0), 1) : 0;
  const reach = radius + ABILITY_BALANCE.pulso.radius;
  return (pulse.prevX + dx * t - x) ** 2 + (pulse.prevZ + dz * t - z) ** 2 <= reach * reach;
}

/** Hasta dónde llega una carrera: se detiene en los muros y nunca termina sobre una grieta. */
export function planDash(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  radius: number,
  blocks: readonly BlockData[],
  distance: number = ABILITY_BALANCE.impulso.distance,
): Position2 {
  const cracks = blocks.filter((b) => b.kind === 'crack');
  const solids = withoutCracks(blocks);
  const step = radius * 0.4;
  const pos = { x, z };
  let safe = { x, z };
  for (let travelled = step; travelled <= distance + 1e-6; travelled += step) {
    const nextX = x + dirX * travelled;
    const nextZ = z + dirZ * travelled;
    const probe = { x: nextX, z: nextZ };
    // Un muro detiene la carrera en seco: no se desliza por él.
    if (resolveCircle(probe, radius, solids)) break;
    pos.x = nextX;
    pos.z = nextZ;
    if (!overlapsAny(nextX, nextZ, radius, cracks)) safe = { x: nextX, z: nextZ };
  }
  return safe;
}

/**
 * Empieza una carrera hacia (dirX, dirZ) normalizada. Devuelve false si está en espera o no hay sitio adonde ir:
 * en ese caso no se gasta la espera.
 */
export function startDash(
  state: AbilityState,
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  radius: number,
  blocks: readonly BlockData[],
): boolean {
  if (state.dashCooldown > 0 || state.dash) return false;
  const to = planDash(x, z, dirX, dirZ, radius, blocks);
  if (Math.hypot(to.x - x, to.z - z) < ABILITY_BALANCE.impulso.minDistance) return false;
  state.dash = { fromX: x, fromZ: z, toX: to.x, toZ: to.z, time: 0 };
  state.dashCooldown = ABILITY_BALANCE.impulso.cooldown;
  return true;
}

/** Avanza la carrera y coloca a `pos` en su punto. Devuelve true mientras siga. */
export function updateDash(state: AbilityState, pos: Position2, dt: number): boolean {
  const dash = state.dash;
  if (!dash) return false;
  dash.time += dt;
  const t = Math.min(dash.time / ABILITY_BALANCE.impulso.duration, 1);
  pos.x = dash.fromX + (dash.toX - dash.fromX) * t;
  pos.z = dash.fromZ + (dash.toZ - dash.fromZ) * t;
  if (t >= 1) state.dash = null;
  return true;
}

/** Progreso de la carrera (0 a 1), para la animación; null si no hay. */
export function dashProgress(state: AbilityState): number | null {
  return state.dash ? Math.min(state.dash.time / ABILITY_BALANCE.impulso.duration, 1) : null;
}

/** Barreras que toca un segmento de carrera (x, z) → (x + dir·distancia): rectángulos con margen del radio. */
export function dashCrosses(
  x: number,
  z: number,
  dirX: number,
  dirZ: number,
  radius: number,
  block: BlockData,
  distance: number = ABILITY_BALANCE.impulso.distance,
): boolean {
  const steps = Math.ceil(distance / (radius * 0.4));
  for (let i = 0; i <= steps; i++) {
    const t = (distance * i) / steps;
    if (overlapsAny(x + dirX * t, z + dirZ * t, radius, [block])) return true;
  }
  return false;
}
