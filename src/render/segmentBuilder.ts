import type { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import type { Material } from '@babylonjs/core/Materials/material';

export interface Placement {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly sx?: number;
  readonly sy?: number;
  readonly sz?: number;
}

/** Junta primitivas coloreadas y las fusiona en una sola malla (una llamada de dibujo por segmento). */
export class SegmentBuilder {
  private readonly parts: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly name: string,
  ) {}

  box(w: number, h: number, d: number, color: string, at: Placement = {}): this {
    return this.add(CreateBox(`${this.name}-box`, { width: w, height: h, depth: d }, this.scene), color, at);
  }

  cylinder(
    h: number,
    top: number,
    bottom: number,
    color: string,
    at: Placement = {},
    tessellation = 6,
  ): this {
    const mesh = CreateCylinder(
      `${this.name}-cyl`,
      { height: h, diameterTop: top, diameterBottom: bottom, tessellation },
      this.scene,
    );
    return this.add(mesh, color, at);
  }

  ico(radius: number, color: string, at: Placement = {}): this {
    return this.add(CreateIcoSphere(`${this.name}-ico`, { radius, subdivisions: 1 }, this.scene), color, at);
  }

  private add(mesh: Mesh, color: string, at: Placement): this {
    mesh.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
    mesh.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0);
    mesh.scaling.set(at.sx ?? 1, at.sy ?? 1, at.sz ?? 1);
    mesh.bakeCurrentTransformIntoVertices();
    const c = Color3.FromHexString(color);
    const count = mesh.getTotalVertices();
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    this.parts.push(mesh);
    return this;
  }

  build(parent: TransformNode, material: Material): Mesh {
    const merged = Mesh.MergeMeshes(this.parts, true, true);
    if (!merged) throw new Error(`No se pudo crear el segmento ${this.name}`);
    merged.convertToFlatShadedMesh();
    merged.name = this.name;
    merged.material = material;
    merged.parent = parent;
    merged.isPickable = false;
    return merged;
  }
}
