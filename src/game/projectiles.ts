import type { BlockData } from '../data/arena';
import type { ProjectileSpawn } from './enemies';
import type { Position2 } from '../world/collision';
import { isInArc } from './combat';

/** Bola de ceniza del Tirador: lenta, visible, choca con los muros y se puede cortar con la Hoja. */
export interface Projectile {
  readonly id: number;
  x: number;
  z: number;
  prevX: number;
  prevZ: number;
  readonly vx: number;
  readonly vz: number;
  readonly radius: number;
  readonly damage: number;
  /** Tiempo de vida que le queda. */
  life: number;
  age: number;
  /** Cómo terminó (para el efecto): sigue volando, chocó, alcanzó al jugador o fue cortada. */
  state: 'flying' | 'blocked' | 'hit' | 'cut' | 'expired';
}

export function createProjectile(id: number, spawn: ProjectileSpawn): Projectile {
  return {
    id,
    x: spawn.x,
    z: spawn.z,
    prevX: spawn.x,
    prevZ: spawn.z,
    vx: spawn.dirX * spawn.speed,
    vz: spawn.dirZ * spawn.speed,
    radius: spawn.radius,
    damage: spawn.damage,
    life: spawn.lifetime,
    age: 0,
    state: 'flying',
  };
}

function overlapsBlock(x: number, z: number, radius: number, blocks: readonly BlockData[]): boolean {
  for (const b of blocks) {
    // Lo que vuela pasa por encima de las grietas.
    if (b.kind === 'crack') continue;
    const cx = Math.min(Math.max(x, b.x - b.halfX), b.x + b.halfX);
    const cz = Math.min(Math.max(z, b.z - b.halfZ), b.z + b.halfZ);
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return true;
  }
  return false;
}

/** Proyectil que toca al jugador en este paso (el juego decide si hace daño). */
export interface ProjectileContact {
  readonly projectile: Projectile;
}

/** Avanza los proyectiles: se mueven, chocan con los muros, caducan o tocan al jugador. */
export function updateProjectiles(
  list: readonly Projectile[],
  dt: number,
  blocks: readonly BlockData[],
  player: Position2,
  playerRadius: number,
): ProjectileContact[] {
  const contacts: ProjectileContact[] = [];
  for (const p of list) {
    if (p.state !== 'flying') continue;
    p.prevX = p.x;
    p.prevZ = p.z;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.age += dt;
    p.life -= dt;
    if (overlapsBlock(p.x, p.z, p.radius, blocks)) {
      p.state = 'blocked';
      continue;
    }
    if (p.life <= 0) {
      p.state = 'expired';
      continue;
    }
    const dx = player.x - p.x;
    const dz = player.z - p.z;
    if (dx * dx + dz * dz <= (p.radius + playerRadius) ** 2) contacts.push({ projectile: p });
  }
  return contacts;
}

/** Corta con la Hoja los proyectiles que estén en el arco del golpe. Devuelve cuántos cortó. */
export function slashProjectiles(
  list: readonly Projectile[],
  px: number,
  pz: number,
  yaw: number,
  range: number,
  halfArc: number,
): number {
  let cut = 0;
  for (const p of list) {
    if (p.state !== 'flying') continue;
    if (isInArc(px, pz, yaw, p.x, p.z, p.radius, range, halfArc)) {
      p.state = 'cut';
      cut++;
    }
  }
  return cut;
}
