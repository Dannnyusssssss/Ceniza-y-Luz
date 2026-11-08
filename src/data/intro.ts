import type { Dialogue } from './texts';
import { INTRO_LINES } from './texts';

/** Dónde está y hacia dónde mira alguien en un plano. */
export interface IntroActor {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/**
 * Un plano de la intro. La cámara queda quieta: solo cambia de un plano al siguiente cuando el jugador avanza
 * (nunca se mueve sola). Lo que se anima son los personajes.
 */
export interface IntroShot {
  readonly camera: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly tx: number;
    readonly ty: number;
    readonly tz: number;
  };
  readonly player: IntroActor;
  /** El protagonista está caído. */
  readonly playerDown: boolean;
  /** El gemelo; null si ya no está. */
  readonly sibling: IntroActor | null;
  /** El gemelo es arrastrado hacia la Bruma durante este plano. */
  readonly siblingTaken: boolean;
  /** Criaturas de la Bruma a la vista. */
  readonly creatures: boolean;
  /** Ceniza por segundo. */
  readonly ash: number;
  readonly lines: Dialogue;
}

const PLAYER: IntroActor = { x: -1, z: -6, yaw: 0.5 };
const SIBLING: IntroActor = { x: 1, z: -6, yaw: -0.5 };
const WIDE = { x: -0.8, y: 2.2, z: -12.5, tx: 0, ty: 1.1, tz: -3 };
const CLOSE = { x: 0, y: 1.5, z: -9.2, tx: 0, ty: 1.2, tz: -5.6 };
const THREAT = { x: -2.5, y: 1.6, z: -11, tx: 0.6, ty: 1.6, tz: 1 };
const LOW = { x: 2.4, y: 1, z: -9, tx: -0.8, ty: 0.7, tz: -5.5 };

export const INTRO_SHOTS: readonly IntroShot[] = [
  {
    camera: WIDE,
    player: PLAYER,
    playerDown: false,
    sibling: SIBLING,
    siblingTaken: false,
    creatures: false,
    ash: 3,
    lines: INTRO_LINES.night,
  },
  {
    camera: CLOSE,
    player: { ...PLAYER, yaw: 1.2 },
    playerDown: false,
    sibling: { ...SIBLING, yaw: -1.2 },
    siblingTaken: false,
    creatures: false,
    ash: 8,
    lines: INTRO_LINES.smell,
  },
  {
    camera: THREAT,
    player: { ...PLAYER, yaw: 0 },
    playerDown: false,
    sibling: { ...SIBLING, yaw: 0 },
    siblingTaken: false,
    creatures: true,
    ash: 40,
    lines: INTRO_LINES.attack,
  },
  {
    camera: WIDE,
    player: { x: -1.6, z: -6.5, yaw: 0.3 },
    playerDown: true,
    sibling: { x: 1, z: -4.5, yaw: Math.PI },
    siblingTaken: true,
    creatures: true,
    ash: 50,
    lines: INTRO_LINES.taken,
  },
  {
    camera: LOW,
    player: { x: -1.6, z: -6.5, yaw: 0.3 },
    playerDown: true,
    sibling: null,
    siblingTaken: false,
    creatures: false,
    ash: 6,
    lines: INTRO_LINES.after,
  },
];
