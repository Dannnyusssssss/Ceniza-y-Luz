import type { BlockData } from '../data/arena';
import { PLAYER_BALANCE } from '../data/balance';
import { approach, wrapAngle } from '../core/math';
import { createDodge, dodgeSpeed, startDodge, updateDodge, type DodgeState } from './dodge';
import { moveCircle } from '../world/collision';

export type PlayerBalance = typeof PLAYER_BALANCE;

/** Estado del jugador en la lógica. `yaw` 0 mira hacia +z; crece girando hacia +x. */
export interface PlayerState {
  x: number;
  z: number;
  /** Posición del paso anterior, para interpolar el render. */
  prevX: number;
  prevZ: number;
  yaw: number;
  prevYaw: number;
  vx: number;
  vz: number;
  /** Velocidad horizontal actual (m/s), para elegir la animación. */
  speed: number;
  walking: boolean;
  dodge: DodgeState;
}

/** Lo que el jugador quiere hacer en este paso, ya traducido desde el teclado. */
export interface PlayerIntent {
  /** Eje local: x = derecha, z = adelante, en [-1, 1]. */
  readonly moveX: number;
  readonly moveZ: number;
  readonly walk: boolean;
  readonly dodge: boolean;
}

/** Modificadores que impone otro sistema (el combate) en este paso. */
export interface PlayerModifiers {
  /** Multiplica la velocidad de movimiento (p. ej. al atacar). */
  readonly moveFactor: number;
  /** Avance hacia donde mira el personaje (m/s), p. ej. el impulso de un golpe. */
  readonly lunge: number;
  /** Si es false, el personaje no gira hacia el movimiento (mantiene la dirección del golpe). */
  readonly canTurn: boolean;
}

export const NO_MODIFIERS: PlayerModifiers = { moveFactor: 1, lunge: 0, canTurn: true };

export function createPlayer(x: number, z: number, yaw: number): PlayerState {
  return {
    x,
    z,
    prevX: x,
    prevZ: z,
    yaw,
    prevYaw: yaw,
    vx: 0,
    vz: 0,
    speed: 0,
    walking: false,
    dodge: createDodge(),
  };
}

/** Convierte el eje local del teclado en una dirección del mundo según hacia dónde mira la cámara. */
export function cameraRelativeDirection(
  moveX: number,
  moveZ: number,
  cameraYaw: number,
): { x: number; z: number } {
  const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
  if (len < 1e-6) return { x: 0, z: 0 };
  const lx = moveX / len;
  const lz = moveZ / len;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // Adelante de la cámara = (sin, cos); derecha de la cámara = (cos, -sin).
  return { x: lz * sin + lx * cos, z: lz * cos - lx * sin };
}

/** Avanza un paso fijo: esquiva, movimiento relativo a la cámara, giro y colisión. */
export function updatePlayer(
  player: PlayerState,
  intent: PlayerIntent,
  cameraYaw: number,
  dt: number,
  blocks: readonly BlockData[],
  modifiers: PlayerModifiers = NO_MODIFIERS,
  balance: PlayerBalance = PLAYER_BALANCE,
): void {
  player.prevX = player.x;
  player.prevZ = player.z;
  player.prevYaw = player.yaw;

  const dir = cameraRelativeDirection(intent.moveX, intent.moveZ, cameraYaw);
  const hasInput = dir.x !== 0 || dir.z !== 0;
  player.walking = intent.walk;

  if (intent.dodge) {
    // Se esquiva hacia donde se pulsa o, sin dirección, hacia donde mira el personaje.
    const dx = hasInput ? dir.x : Math.sin(player.yaw);
    const dz = hasInput ? dir.z : Math.cos(player.yaw);
    if (startDodge(player.dodge, dx, dz)) player.yaw = Math.atan2(dx, dz);
  }
  updateDodge(player.dodge, dt);

  if (player.dodge.phase === 'dodging') {
    const speed = dodgeSpeed(player.dodge);
    player.vx = player.dodge.dirX * speed;
    player.vz = player.dodge.dirZ * speed;
  } else {
    const maxSpeed = (intent.walk ? balance.walkSpeed : balance.runSpeed) * modifiers.moveFactor;
    const targetVx = dir.x * maxSpeed;
    const targetVz = dir.z * maxSpeed;
    const rate = (hasInput ? balance.acceleration : balance.deceleration) * dt;
    player.vx = approach(player.vx, targetVx, rate);
    player.vz = approach(player.vz, targetVz, rate);
    if (hasInput && modifiers.canTurn) {
      const targetYaw = Math.atan2(dir.x, dir.z);
      const diff = wrapAngle(targetYaw - player.yaw);
      const maxTurn = balance.turnRate * dt;
      player.yaw = wrapAngle(player.yaw + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    }
  }

  let moveX = player.vx * dt;
  let moveZ = player.vz * dt;
  if (modifiers.lunge > 0 && player.dodge.phase !== 'dodging') {
    moveX += Math.sin(player.yaw) * modifiers.lunge * dt;
    moveZ += Math.cos(player.yaw) * modifiers.lunge * dt;
  }
  const beforeX = player.x;
  const beforeZ = player.z;
  moveCircle(player, moveX, moveZ, balance.radius, blocks);
  // La velocidad real tras chocar (si una pared frena, la animación también).
  player.speed = Math.sqrt((player.x - beforeX) ** 2 + (player.z - beforeZ) ** 2) / dt;
}
