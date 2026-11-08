import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CellMaterial } from '@babylonjs/materials/cell/cellMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import '@babylonjs/core/Rendering/outlineRenderer';

/** Intensidad de los materiales emisivos. */
const UNLIT_GLOW = 1.25;

export interface ToonOptions {
  /** Sin iluminación: el color se ve tal cual (cristales y objetos que brillan). */
  readonly unlit?: boolean;
  /** Bandas de luz extra (brillo en las zonas más iluminadas). */
  readonly highlights?: boolean;
}

/**
 * Materiales de sombreado plano (bandas de luz tipo anime), compartidos por color.
 * Se crean una vez y se reutilizan, nunca por fotograma.
 */
export class ToonMaterials {
  private readonly cache = new Map<string, Material>();

  constructor(private readonly scene: Scene) {}

  get(hex: string, options: ToonOptions = {}): Material {
    const key = `${hex}|${options.unlit ? 1 : 0}|${options.highlights ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = options.unlit ? this.createUnlit(key, hex) : this.createCell(key, hex, options);
    this.cache.set(key, material);
    return material;
  }

  private createCell(key: string, hex: string, options: ToonOptions): CellMaterial {
    const material = new CellMaterial(`toon-${key}`, this.scene);
    material.diffuseColor = Color3.FromHexString(hex);
    material.computeHighLevel = options.highlights ?? false;
    return material;
  }

  /** Material emisivo: color plano que no depende de la luz y alimenta el bloom. */
  private createUnlit(key: string, hex: string): StandardMaterial {
    const material = new StandardMaterial(`unlit-${key}`, this.scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    // Por encima de 1 para que el bloom lo haga brillar (el pipeline trabaja en HDR).
    material.emissiveColor = Color3.FromHexString(hex).scale(UNLIT_GLOW);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
  }
}

/** Contorno oscuro alrededor de la malla, parte del look anime. */
export function applyOutline(mesh: AbstractMesh, color: string, width: number): void {
  mesh.renderOutline = true;
  mesh.outlineColor = Color3.FromHexString(color);
  mesh.outlineWidth = width;
}
