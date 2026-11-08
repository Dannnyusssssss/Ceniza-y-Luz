import type { BlockData } from '../data/arena';
import { CAMERA_BALANCE } from '../data/balance';
import { clamp, wrapAngle } from '../core/math';
import { raycastBlocks } from './collision';

export type CameraBalance = typeof CAMERA_BALANCE;

/**
 * Cámara de tercera persona en órbita alrededor del personaje.
 * Solo gira por acción del jugador (ratón o flechas): nunca gira ni se recoloca sola.
 */
export interface CameraRig {
  /** Hacia dónde mira la cámara en el plano (0 = +z). */
  yaw: number;
  /** Inclinación: positivo = la cámara está por encima del personaje mirando hacia abajo. */
  pitch: number;
  /** Distancia actual (se acerca si hay una pared detrás). */
  distance: number;
}

export interface LookInput {
  /** Píxeles de ratón acumulados. */
  readonly mouseX: number;
  readonly mouseY: number;
  /** Flechas: -1, 0 o 1 en cada eje. */
  readonly arrowX: number;
  readonly arrowY: number;
}

export interface LookSettings {
  readonly sensitivity: number;
  readonly invertY: boolean;
  /** Radianes por píxel con sensibilidad 1. */
  readonly mouseSpeed: number;
  /** Radianes por segundo con flechas y sensibilidad 1. */
  readonly arrowSpeed: number;
}

export function createCameraRig(yaw: number, balance: CameraBalance = CAMERA_BALANCE): CameraRig {
  return { yaw, pitch: balance.initialPitch, distance: balance.distance };
}

/** Aplica el giro pedido por el jugador. Sin entrada, no cambia nada. */
export function applyLook(
  rig: CameraRig,
  input: LookInput,
  settings: LookSettings,
  frameSeconds: number,
  balance: CameraBalance = CAMERA_BALANCE,
): void {
  const ySign = settings.invertY ? -1 : 1;
  const yawDelta =
    (input.mouseX * settings.mouseSpeed + input.arrowX * settings.arrowSpeed * frameSeconds) *
    settings.sensitivity;
  // Ratón hacia arriba (y negativo) = mirar más arriba = la cámara baja (menos inclinación).
  const pitchDelta =
    (input.mouseY * settings.mouseSpeed - input.arrowY * settings.arrowSpeed * frameSeconds) *
    settings.sensitivity *
    ySign;
  rig.yaw = wrapAngle(rig.yaw + yawDelta);
  rig.pitch = clamp(rig.pitch + pitchDelta, balance.minPitch, balance.maxPitch);
}

export interface CameraPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly targetX: number;
  readonly targetY: number;
  readonly targetZ: number;
}

/**
 * Calcula la posición de la cámara para el personaje en (px, pz). Si una pared se interpone,
 * la cámara se acerca rápido (para no ver a través) y vuelve a alejarse con suavidad.
 */
export function updateCameraPose(
  rig: CameraRig,
  px: number,
  pz: number,
  blocks: readonly BlockData[],
  frameSeconds: number,
  balance: CameraBalance = CAMERA_BALANCE,
  groundAt: (x: number, z: number) => number = () => 0,
): CameraPose {
  const target = { x: px, y: balance.targetHeight + groundAt(px, pz), z: pz };
  const cosPitch = Math.cos(rig.pitch);
  // Dirección desde el objetivo hacia la cámara (detrás del personaje respecto a donde mira la cámara).
  const back = {
    x: -Math.sin(rig.yaw) * cosPitch,
    y: Math.sin(rig.pitch),
    z: -Math.cos(rig.yaw) * cosPitch,
  };
  const hit = raycastBlocks(target, back, balance.distance + balance.collisionMargin, blocks);
  const allowed = clamp(hit - balance.collisionMargin, balance.minDistance, balance.distance);
  const rate = allowed < rig.distance ? balance.zoomInRate : balance.zoomOutRate;
  const t = 1 - Math.exp(-rate * Math.max(frameSeconds, 0));
  rig.distance = rig.distance + (allowed - rig.distance) * t;
  // Nunca más lejos de lo permitido en este fotograma: así no se asoma tras la pared.
  rig.distance = Math.min(rig.distance, Math.max(allowed, balance.minDistance));
  const camX = target.x + back.x * rig.distance;
  const camZ = target.z + back.z * rig.distance;
  return {
    x: camX,
    // Nunca por debajo del suelo, también en las elevaciones del terreno.
    y: Math.max(target.y + back.y * rig.distance, groundAt(camX, camZ) + 0.3),
    z: camZ,
    targetX: target.x,
    targetY: target.y,
    targetZ: target.z,
  };
}
