import { COMBO_BALANCE, PLAYER_BALANCE, type ComboStep } from '../data/balance';
import { wrapAngle } from '../core/math';
import type { PlayerModifiers } from './player';

export type ComboBalance = typeof COMBO_BALANCE;

/** Estado del combo. `step` -1 = sin atacar. Cada golpe tiene un identificador para golpear una sola vez. */
export interface ComboState {
  step: number;
  time: number;
  /** Tiempo que queda de la pulsación recordada (≤ 0 = ninguna). */
  buffer: number;
  /** Espera tras el último golpe. */
  recovery: number;
  /** Aumenta con cada golpe: un objetivo solo recibe daño una vez por golpe. */
  swingId: number;
}

export function createCombo(): ComboState {
  return { step: -1, time: 0, buffer: 0, recovery: 0, swingId: 0 };
}

export function currentStep(state: ComboState, balance: ComboBalance = COMBO_BALANCE): ComboStep | null {
  return state.step >= 0 ? (balance.steps[state.step] ?? null) : null;
}

function begin(state: ComboState, step: number): void {
  state.step = step;
  state.time = 0;
  state.buffer = 0;
  state.swingId++;
}

/**
 * Avanza el combo un paso fijo. Una pulsación durante un golpe se recuerda (`inputBuffer`) y
 * encadena el siguiente cuando termina la ventana de daño del actual. Devuelve el golpe que empezó, o null.
 */
export function updateCombo(
  state: ComboState,
  attackPressed: boolean,
  dt: number,
  balance: ComboBalance = COMBO_BALANCE,
): number | null {
  if (state.recovery > 0) state.recovery = Math.max(0, state.recovery - dt);

  if (state.step < 0) {
    if (attackPressed && state.recovery <= 0) {
      begin(state, 0);
      return 0;
    }
    return null;
  }

  const step = currentStep(state, balance);
  if (!step) {
    state.step = -1;
    return null;
  }
  state.time += dt;
  if (attackPressed) state.buffer = balance.inputBuffer;
  else if (state.buffer > 0) state.buffer = Math.max(0, state.buffer - dt);

  const isLast = state.step >= balance.steps.length - 1;
  const chainAt = Math.max(step.chainFrom, step.hitTo);
  if (!isLast && state.buffer > 0 && state.time >= chainAt) {
    const next = state.step + 1;
    begin(state, next);
    return next;
  }
  if (state.time >= step.duration) {
    if (isLast) state.recovery = balance.recovery;
    state.step = -1;
    state.time = 0;
    state.buffer = 0;
  }
  return null;
}

/** Corta el combo (por ejemplo, al esquivar). */
export function cancelCombo(state: ComboState): void {
  state.step = -1;
  state.time = 0;
  state.buffer = 0;
}

export function isAttacking(state: ComboState): boolean {
  return state.step >= 0;
}

/** True mientras el golpe actual puede hacer daño. */
export function inHitWindow(state: ComboState, balance: ComboBalance = COMBO_BALANCE): boolean {
  const step = currentStep(state, balance);
  return !!step && state.time >= step.hitFrom && state.time < step.hitTo;
}

/** Cómo afecta el combo al movimiento: más lento al atacar, impulso en la ventana de daño y giro solo al preparar. */
export function comboModifiers(state: ComboState, balance: ComboBalance = COMBO_BALANCE): PlayerModifiers {
  const step = currentStep(state, balance);
  if (!step) return { moveFactor: 1, lunge: 0, canTurn: true };
  return {
    moveFactor: PLAYER_BALANCE.attackMoveFactor,
    lunge: inHitWindow(state, balance) ? step.lunge : 0,
    canTurn: state.time < step.hitFrom,
  };
}

/**
 * True si un objetivo circular en (tx, tz) con radio `targetRadius` está dentro del arco del golpe:
 * a menos de `range` del atacante y dentro de `halfArc` a cada lado de hacia donde mira.
 */
export function isInArc(
  px: number,
  pz: number,
  yaw: number,
  tx: number,
  tz: number,
  targetRadius: number,
  range: number,
  halfArc: number,
): boolean {
  const dx = tx - px;
  const dz = tz - pz;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > range + targetRadius) return false;
  if (dist < targetRadius) return true;
  const angleTo = Math.atan2(dx, dz);
  // El radio del objetivo ensancha un poco el arco (se le puede rozar por el borde).
  const widen = Math.asin(Math.min(1, targetRadius / dist));
  return Math.abs(wrapAngle(angleTo - yaw)) <= halfArc + widen;
}
