import { clamp, damp, lerp } from '../core/math';
import { PLAYER_BALANCE, type ComboStep } from '../data/balance';
import type { CharacterRig } from './characterModel';

/** Datos de un fotograma para posar al personaje. */
export interface PoseInput {
  /** Velocidad horizontal (m/s). */
  readonly speed: number;
  /** Progreso de la esquiva (0 = no esquiva, hasta 1). */
  readonly dodge: number;
  /** Golpe en curso del combo, o null. */
  readonly attack: { readonly step: number; readonly time: number; readonly data: ComboStep } | null;
  /** "Reducir movimiento": atenúa balanceos secundarios (pelo, capa, respiración). */
  readonly reduceMotion: boolean;
}

/** Postura de la espada en reposo: la hoja apunta adelante y algo hacia abajo. */
const SWORD_REST_X = 1.9;
const TAU = Math.PI * 2;
/** Radianes de ciclo de paso por metro recorrido. */
const STEP_RATE = 2.4;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Anima al personaje por código: reposo, caminar, correr, esquivar (voltereta) y los tres golpes.
 * Convención de Babylon: `rotation.x` positivo lleva la punta de un miembro hacia atrás si cuelga hacia abajo.
 */
export class CharacterAnimator {
  private phase = 0;
  private time = 0;
  private lean = 0;
  private clothLag = 0;

  constructor(private readonly rig: CharacterRig) {}

  update(input: PoseInput, dt: number): void {
    const r = this.rig;
    this.time += dt;
    const secondary = input.reduceMotion ? 0.3 : 1;
    const { walkSpeed, runSpeed } = PLAYER_BALANCE;
    const move = clamp(input.speed / walkSpeed, 0, 1);
    const run = clamp((input.speed - walkSpeed) / (runSpeed - walkSpeed), 0, 1);
    this.phase = (this.phase + input.speed * STEP_RATE * dt) % TAU;
    this.lean = damp(this.lean, 0.06 * move + 0.2 * run, 10, dt);
    this.clothLag = damp(this.clothLag, input.speed / runSpeed, 6, dt);

    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const breathe = Math.sin(this.time * 1.8) * (1 - move) * secondary;

    // Piernas: balanceo opuesto y rodilla que se dobla al recoger el pie.
    const legAmp = lerp(0.42, 0.85, run) * move;
    r.hipL.rotation.set(-s * legAmp, 0, 0);
    r.hipR.rotation.set(s * legAmp, 0, 0);
    const kneeBase = 0.05 + 0.1 * move;
    const kneeAmp = lerp(0.45, 1.1, run) * move;
    r.kneeL.rotation.set(kneeBase + Math.max(0, s) * kneeAmp, 0, 0);
    r.kneeR.rotation.set(kneeBase + Math.max(0, -s) * kneeAmp, 0, 0);

    // Cuerpo: rebote al pisar, inclinación al correr y giro de cadera.
    const bob = lerp(0.025, 0.06, run) * move;
    r.body.position.set(0, 0.55, 0);
    r.body.rotation.set(0, 0, 0);
    r.hips.position.y = 0.33 - bob * 0.5 + Math.abs(c) * bob;
    r.torso.rotation.set(this.lean + breathe * 0.02, s * 0.14 * move, 0);
    r.head.rotation.set(-this.lean * 0.6 - breathe * 0.015, -s * 0.08 * move, 0);

    // Brazos: balanceo opuesto a las piernas; el derecho lleva la espada y se mueve menos.
    const armAmp = lerp(0.35, 0.8, run) * move;
    r.shoulderL.rotation.set(s * armAmp + breathe * 0.03, 0, -0.12);
    r.elbowL.rotation.set(-0.2 - 0.9 * run * move, 0, 0);
    r.shoulderR.rotation.set(-s * armAmp * 0.6 - 0.15, 0, 0.14);
    r.elbowR.rotation.set(-0.45 - 0.6 * run * move, 0, 0);
    r.sword.rotation.set(SWORD_REST_X, 0, 0);

    // Pelo y capa: se van hacia atrás con la velocidad y ondean un poco.
    const flutter =
      Math.sin(this.time * 2.3) * 0.04 * secondary + Math.sin(this.phase * 2) * 0.05 * move * secondary;
    if (r.hair) r.hair.rotation.set(0.12 + this.clothLag * 0.55 + flutter, 0, 0);
    r.cloth.rotation.set(0.1 + this.clothLag * 0.85 + flutter * 1.3, 0, 0);

    if (input.attack) this.applyAttack(input.attack);
    if (input.dodge > 0) this.applyDodge(input.dodge);
  }

  /**
   * Voltereta hacia delante con las piernas y los brazos recogidos. El centro de giro sube a mitad
   * de la voltereta para que la cabeza nunca atraviese el suelo.
   */
  private applyDodge(progress: number): void {
    const r = this.rig;
    const eased = smoothstep(0, 1, progress);
    const tuck = Math.sin(progress * Math.PI);
    r.body.rotation.x = eased * TAU;
    r.body.position.y = 0.55 + 0.7 * tuck;
    r.hipL.rotation.x = -1.5 * tuck;
    r.hipR.rotation.x = -1.4 * tuck;
    r.kneeL.rotation.x = 2.1 * tuck;
    r.kneeR.rotation.x = 2.0 * tuck;
    r.shoulderL.rotation.x = -1.1 * tuck;
    r.shoulderR.rotation.x = -1.1 * tuck;
    r.elbowL.rotation.x = -1.3 * tuck;
    r.elbowR.rotation.x = -1.3 * tuck;
    r.torso.rotation.x = 0.85 * tuck;
    r.head.rotation.x = 0.5 * tuck;
  }

  /** Golpes del combo: corte de derecha a izquierda, revés y golpe vertical. */
  private applyAttack(attack: NonNullable<PoseInput['attack']>): void {
    const r = this.rig;
    const { step, time, data } = attack;
    // 0 → 1: preparación hasta el inicio de la ventana de daño, barrido durante la ventana.
    const windup = smoothstep(0, data.hitFrom, time);
    const swing = smoothstep(data.hitFrom * 0.8, data.hitTo, time);
    const recover = smoothstep(data.hitTo, data.duration, time);
    const settle = 1 - recover * 0.6;

    if (step === 2) {
      // Golpe vertical: el brazo sube por encima de la cabeza y baja.
      const armX = lerp(lerp(-0.4, -2.9, windup), -0.7, swing);
      r.shoulderR.rotation.set(armX * settle, 0, 0.1);
      r.elbowR.rotation.set(lerp(-0.6, -0.15, swing), 0, 0);
      r.shoulderL.rotation.set(armX * 0.7 * settle, 0, -0.25);
      r.torso.rotation.x = lerp(-0.15 * windup, 0.35, swing) * settle;
      r.sword.rotation.set(lerp(SWORD_REST_X, 1.55, windup), 0, 0);
      return;
    }
    // Cortes horizontales: el torso gira y el brazo barre de un lado a otro.
    const dir = step === 0 ? 1 : -1;
    const sweep = lerp(lerp(0, dir * 1.0, windup), -dir * 0.9, swing) * settle;
    r.torso.rotation.y = sweep * 0.55;
    r.shoulderR.rotation.set(-1.35 * settle - 0.15, 0, 0.2 + sweep * 0.9);
    r.elbowR.rotation.set(-0.25, 0, 0);
    r.sword.rotation.set(1.57, 0, -sweep * 0.3);
    r.shoulderL.rotation.set(-0.5 * settle, 0, -0.35);
  }
}
