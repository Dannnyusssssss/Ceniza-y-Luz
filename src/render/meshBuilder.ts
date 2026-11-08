import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphereVertexData } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Material } from '@babylonjs/core/Materials/material';
import type { SwitchSymbol } from '../data/puzzles';

/** Transformación de una pieza: posición, giro y escala opcionales. */
export interface PieceTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
}

/**
 * Prisma de un tejado a dos aguas. El orden de los índices sigue el de las cajas del motor:
 * al revés, las caras exteriores no se dibujarían y se vería el interior del tejado.
 */
export function roofVertexData(w: number, h: number, d: number): VertexData {
  const x = w / 2;
  const z = d / 2;
  const data = new VertexData();
  data.positions = [-x, 0, -z, x, 0, -z, x, h, 0, -x, h, 0, -x, 0, z, x, 0, z];
  data.indices = [0, 1, 2, 0, 2, 3, 4, 2, 5, 4, 3, 2, 0, 3, 4, 1, 5, 2, 0, 5, 1, 0, 4, 5];
  const normals: number[] = [];
  VertexData.ComputeNormals(data.positions, data.indices, normals);
  data.normals = normals;
  return data;
}

/**
 * Junta muchas piezas simples con color por vértice en una sola malla (una llamada de dibujo).
 * Las construcciones de las zonas se hacen así: caben decenas de piezas sin coste por fotograma.
 */
export class MeshBuilder {
  private readonly parts: VertexData[] = [];

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  private add(data: VertexData, color: string, t: PieceTransform): void {
    const matrix = Matrix.Compose(
      new Vector3(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1),
      Quaternion.RotationYawPitchRoll(t.yaw ?? 0, t.pitch ?? 0, t.roll ?? 0),
      new Vector3(t.x, t.y, t.z),
    );
    data.transform(matrix);
    data.uvs = null;
    const c = Color3.FromHexString(color);
    const count = (data.positions?.length ?? 0) / 3;
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      colors[i * 4] = c.r;
      colors[i * 4 + 1] = c.g;
      colors[i * 4 + 2] = c.b;
      colors[i * 4 + 3] = 1;
    }
    data.colors = colors;
    this.parts.push(data);
  }

  /** Caja centrada en (x, y, z). */
  box(w: number, h: number, d: number, color: string, t: PieceTransform): void {
    this.add(CreateBoxVertexData({ width: w, height: h, depth: d }), color, t);
  }

  /** Cilindro o cono truncado, con el eje vertical y centrado en (x, y, z). */
  cylinder(
    height: number,
    top: number,
    bottom: number,
    sides: number,
    color: string,
    t: PieceTransform,
  ): void {
    this.add(
      CreateCylinderVertexData({ height, diameterTop: top, diameterBottom: bottom, tessellation: sides }),
      color,
      t,
    );
  }

  sphere(radius: number, color: string, t: PieceTransform, subdivisions = 1): void {
    this.add(CreateIcoSphereVertexData({ radius, subdivisions, flat: true }), color, t);
  }

  /** Tejado a dos aguas: prisma de ancho `w` y fondo `d` con la cumbrera a lo largo de X. */
  roof(w: number, h: number, d: number, color: string, t: PieceTransform): void {
    this.add(roofVertexData(w, h, d), color, t);
  }

  /** Símbolo de un interruptor: se distinguen por la forma, no solo por el color. */
  symbol(
    symbol: SwitchSymbol,
    size: number,
    color: string,
    t: { x: number; y: number; z: number; yaw?: number },
  ): void {
    const yaw = t.yaw ?? 0;
    if (symbol === 'sol') {
      // Disco con rayos.
      this.sphere(size * 0.55, color, t);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = size * 0.85;
        const lx = Math.cos(a) * r;
        this.box(size * 0.14, size * 0.42, size * 0.14, color, {
          x: t.x + lx * Math.cos(yaw),
          y: t.y + Math.sin(a) * r,
          z: t.z - lx * Math.sin(yaw),
          yaw,
          roll: a - Math.PI / 2,
        });
      }
    } else if (symbol === 'luna') {
      // Media luna: una fila de bolas que se afinan hacia las puntas.
      for (let i = 0; i <= 8; i++) {
        const k = i / 8;
        const a = Math.PI * 0.2 + k * Math.PI * 1.6;
        const r = size * 0.72;
        const lx = -Math.sin(a) * r;
        const radius = size * (0.13 + 0.26 * Math.sin(k * Math.PI));
        this.sphere(radius, color, {
          x: t.x + lx * Math.cos(yaw),
          y: t.y + Math.cos(a) * r,
          z: t.z - lx * Math.sin(yaw),
        });
      }
    } else {
      // Estrella de cuatro puntas: dos rombos alargados cruzados.
      for (const roll of [0, Math.PI / 2]) {
        this.cylinder(size * 2.1, 0, size * 0.42, 4, color, { ...t, yaw, roll, y: t.y, sy: 0.5 });
        this.cylinder(size * 2.1, 0, size * 0.42, 4, color, {
          ...t,
          yaw,
          roll: roll + Math.PI,
          y: t.y,
          sy: 0.5,
        });
      }
    }
  }

  /** Crea la malla. `flat` da caras planas (estilo low-poly). */
  build(name: string, scene: Scene, material: Material, flat = true): Mesh | null {
    const [first, ...rest] = this.parts;
    if (!first) return null;
    const merged = rest.length > 0 ? first.merge(rest, true) : first;
    const mesh = new Mesh(name, scene);
    merged.applyToMesh(mesh, false);
    if (flat) mesh.convertToFlatShadedMesh();
    mesh.material = material;
    mesh.hasVertexAlpha = false;
    mesh.isPickable = false;
    this.parts.length = 0;
    return mesh;
  }
}
