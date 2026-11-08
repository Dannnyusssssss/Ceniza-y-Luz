import { SPARK_BALANCE } from '../data/balance';
import type { Rng } from '../core/rng';
import type { Position2 } from '../world/collision';

export type SparkBalance = typeof SPARK_BALANCE;

/** Altura del suelo para las chispas (flotan un poco). */
const REST_HEIGHT = 0.25;
const GRAVITY = 14;

/** Una chispa suelta: salta, cae, flota y vuela hacia el jugador cuando está cerca. */
export interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  collected: boolean;
  expired: boolean;
}

/** Suelta `count` chispas desde un punto, en direcciones repartidas. */
export function spawnSparks(
  list: Spark[],
  x: number,
  z: number,
  count: number,
  rng: Rng,
  balance: SparkBalance = SPARK_BALANCE,
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const speed = balance.burstSpeed * rng.range(0.6, 1.2);
    list.push({
      x,
      y: 0.8,
      z,
      vx: Math.sin(angle) * speed,
      vy: rng.range(3, 5),
      vz: Math.cos(angle) * speed,
      age: 0,
      collected: false,
      expired: false,
    });
  }
}

/** Avanza las chispas y devuelve cuántas recogió el jugador en este paso. */
export function updateSparks(
  list: Spark[],
  dt: number,
  player: Position2,
  balance: SparkBalance = SPARK_BALANCE,
): number {
  let collected = 0;
  for (const s of list) {
    if (s.collected || s.expired) continue;
    s.age += dt;
    if (s.age >= balance.lifetime) {
      s.expired = true;
      continue;
    }
    const dx = player.x - s.x;
    const dz = player.z - s.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (s.age >= balance.settleTime && dist <= balance.magnetRadius) {
      // Vuela hacia el jugador, más rápido cuanto más cerca.
      const pull = balance.magnetSpeed * (1.4 - dist / balance.magnetRadius);
      const len = dist || 1;
      s.vx = (dx / len) * pull;
      s.vz = (dz / len) * pull;
      s.vy = (0.9 - s.y) * 6;
    } else {
      // Salto y caída hasta flotar sobre el suelo, con rozamiento.
      s.vy -= GRAVITY * dt;
      const drag = Math.exp(-3 * dt);
      s.vx *= drag;
      s.vz *= drag;
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    if (s.y < REST_HEIGHT) {
      s.y = REST_HEIGHT;
      s.vy = Math.abs(s.vy) * 0.35;
      if (s.vy < 0.4) s.vy = 0;
    }
    if (s.age >= balance.settleTime && dist <= balance.pickupRadius) {
      s.collected = true;
      collected++;
    }
  }
  return collected;
}

/** Quita de la lista las chispas recogidas o caducadas. */
export function pruneSparks(list: Spark[]): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i] as Spark;
    if (s.collected || s.expired) list.splice(i, 1);
  }
}
