import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CellMaterial } from '@babylonjs/materials/cell/cellMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Material } from '@babylonjs/core/Materials/material';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import '@babylonjs/core/Rendering/outlineRenderer';
import { installToonShading } from './toonShader';

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

  constructor(private readonly scene: Scene) {
    installToonShading();
  }

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

  /**
   * Material de los modelos de Blender: dos tonos (luz y sombra teñida) con el color real en cada vértice.
   * Admite mallas con esqueleto.
   */
  modelToon(): Material {
    return this.get('#ffffff');
  }

  /**
   * Material de la cara de un personaje: la textura (ojos, cejas, boca) con recorte por transparencia y
   * el mismo sombreado de dos tonos que el resto del cuerpo. Uno por textura.
   */
  modelFace(url: string): Material {
    const key = `face|${url}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = new CutoutCellMaterial(key, this.scene);
    // Las coordenadas vienen del glTF (origen arriba a la izquierda): la textura no se invierte.
    const texture = new Texture(url, this.scene, {
      invertY: false,
      samplingMode: Texture.TRILINEAR_SAMPLINGMODE,
    });
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    material.diffuseTexture = texture;
    this.cache.set(key, material);
    return material;
  }

  /**
   * Material sin luz que muestra el color por vértice tal cual: contornos de casco invertido
   * (pintados del color del contorno en Blender) y partes que brillan, como la Hoja.
   */
  modelUnlit(): Material {
    const key = 'model-unlit';
    const cached = this.cache.get(key);
    if (cached) return cached;
    const material = new StandardMaterial(key, this.scene);
    material.disableLighting = true;
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.emissiveColor = Color3.White();
    this.cache.set(key, material);
    return material;
  }

  dispose(): void {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
  }
}

/** CellMaterial que descarta los píxeles transparentes de su textura (la original no admite recorte). */
class CutoutCellMaterial extends CellMaterial {
  override needAlphaTesting(): boolean {
    return true;
  }

  override getAlphaTestTexture(): BaseTexture | null {
    return this.diffuseTexture;
  }
}

/** Contorno oscuro alrededor de la malla, parte del look anime. */
export function applyOutline(mesh: AbstractMesh, color: string, width: number): void {
  mesh.renderOutline = true;
  mesh.outlineColor = Color3.FromHexString(color);
  mesh.outlineWidth = width;
}
