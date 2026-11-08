import { DODGE_BALANCE } from '../data/balance';

export type DodgeBalance = typeof DODGE_BALANCE;

/** Estado de la esquiva. `time` cuenta desde que empezó la fase actual. */
export interface DodgeState {
  phase: 'ready' | 'dodging' | 'cooldown';
  time: number;
  dirX: number;
  dirZ: number;
}

export function createDodge(): DodgeState {
  return { phase: 'ready', time: 0, dirX: 0, dirZ: 1 };
}

/** Intenta empezar una esquiva en la dirección dada (se normaliza). Devuelve false si no está lista. */
export function startDodge(state: DodgeState, dirX: number, dirZ: number): boolean {
  if (state.phase !== 'ready') return false;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (len < 1e-6) return false;
  state.phase = 'dodging';
  state.time = 0;
  state.dirX = dirX / len;
  state.dirZ = dirZ / len;
  return true;
}

/** Avanza el tiempo de la esquiva y cambia de fase al terminar cada una. */
export function updateDodge(state: DodgeState, dt: number, balance: DodgeBalance = DODGE_BALANCE): void {
  if (state.phase === 'ready') return;
  state.time += dt;
  if (state.phase === 'dodging' && state.time >= balance.duration) {
    state.phase = 'cooldown';
    state.time -= balance.duration;
  }
  if (state.phase === 'cooldown' && state.time >= balance.cooldown) {
    state.phase = 'ready';
    state.time = 0;
  }
}

/** Velocidad actual de la esquiva: empieza rápida y frena hacia el final. 0 si no está esquivando. */
export function dodgeSpeed(state: DodgeState, balance: DodgeBalance = DODGE_BALANCE): number {
  if (state.phase !== 'dodging') return 0;
  const t = Math.min(state.time / balance.duration, 1);
  const eased = 1 - (1 - t) * (1 - t);
  return balance.startSpeed + (balance.endSpeed - balance.startSpeed) * eased;
}

/** True durante la ventana de invulnerabilidad de la esquiva. */
export function isInvulnerable(state: DodgeState, balance: DodgeBalance = DODGE_BALANCE): boolean {
  return (
    state.phase === 'dodging' && state.time >= balance.invulnerableFrom && state.time < balance.invulnerableTo
  );
}

/** Progreso de la esquiva en [0, 1] para la animación. */
export function dodgeProgress(state: DodgeState, balance: DodgeBalance = DODGE_BALANCE): number {
  return state.phase === 'dodging' ? Math.min(state.time / balance.duration, 1) : 0;
}
