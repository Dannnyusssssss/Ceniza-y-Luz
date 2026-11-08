import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Material } from '@babylonjs/core/Materials/material';
import '@babylonjs/core/Meshes/thinInstanceMesh';

/**
 * Muchas copias de una malla pequeña en una sola llamada de dibujo (instancias finas).
 * Cada fotograma se escriben las matrices de las copias visibles.
 */
export class InstancedPoints {
  private buffer: Float32Array;
  private count = 0;

  constructor(
    private readonly mesh: Mesh,
    material: Material,
    capacity: number,
  ) {
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    this.buffer = new Float32Array(capacity * 16);
    mesh.thinInstanceSetBuffer('matrix', this.buffer, 16, false);
    mesh.thinInstanceCount = 0;
    mesh.isVisible = false;
  }

  begin(): void {
    this.count = 0;
  }

  /** Añade una copia: posición, giro sobre el eje vertical y escala uniforme. */
  push(x: number, y: number, z: number, yaw: number, scale: number): void {
    if ((this.count + 1) * 16 > this.buffer.length) {
      const bigger = new Float32Array(this.buffer.length * 2);
      bigger.set(this.buffer);
      this.buffer = bigger;
      this.mesh.thinInstanceSetBuffer('matrix', this.buffer, 16, false);
    }
    const o = this.count * 16;
    const c = Math.cos(yaw) * scale;
    const s = Math.sin(yaw) * scale;
    const b = this.buffer;
    b[o] = c;
    b[o + 1] = 0;
    b[o + 2] = -s;
    b[o + 3] = 0;
    b[o + 4] = 0;
    b[o + 5] = scale;
    b[o + 6] = 0;
    b[o + 7] = 0;
    b[o + 8] = s;
    b[o + 9] = 0;
    b[o + 10] = c;
    b[o + 11] = 0;
    b[o + 12] = x;
    b[o + 13] = y;
    b[o + 14] = z;
    b[o + 15] = 1;
    this.count++;
  }

  end(): void {
    this.mesh.thinInstanceCount = this.count;
    this.mesh.isVisible = this.count > 0;
    if (this.count > 0) this.mesh.thinInstanceBufferUpdated('matrix');
  }

  dispose(): void {
    this.mesh.dispose();
  }
}

interface Ash {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  readonly maxLife: number;
  readonly size: number;
}

/** Ceniza que sube y se deshace (enemigos que se desvanecen, proyectiles que estallan). Sin destellos. */
export class AshParticles {
  private readonly items: Ash[] = [];
  private seed = 1;

  constructor(
    private readonly points: InstancedPoints,
    private readonly maxItems = 400,
  ) {}

  private random(): number {
    // Pseudoaleatorio propio y barato (solo es decoración).
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  emit(x: number, y: number, z: number, count: number, spread: number, height: number): void {
    for (let i = 0; i < count && this.items.length < this.maxItems; i++) {
      const a = this.random() * Math.PI * 2;
      const r = this.random() * spread;
      const life = 0.6 + this.random() * 0.7;
      this.items.push({
        x: x + Math.cos(a) * r,
        y: y + this.random() * height,
        z: z + Math.sin(a) * r,
        vx: Math.cos(a) * (0.3 + this.random() * 0.6),
        vy: 0.8 + this.random() * 1.2,
        vz: Math.sin(a) * (0.3 + this.random() * 0.6),
        life,
        maxLife: life,
        size: 0.5 + this.random() * 0.8,
      });
    }
  }

  update(dt: number): void {
    this.points.begin();
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i] as Ash;
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= 0.97;
      p.vz *= 0.97;
      const t = p.life / p.maxLife;
      this.points.push(p.x, p.y, p.z, p.life * 4, p.size * t);
    }
    this.points.end();
  }

  clear(): void {
    this.items.length = 0;
    this.points.begin();
    this.points.end();
  }
}
