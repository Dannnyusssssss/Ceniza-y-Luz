import type { Scene } from '@babylonjs/core/scene';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
// Solo el cargador glTF 2.0: sin Draco ni meshopt (sus decodificadores se descargarían de fuera).
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { materialForMeshName, readGlbJson, readGlbMaterialNames } from './glb';

/**
 * Modelo cargado (sin añadir a la escena): sirve de molde para crear copias.
 * `materialByMesh` da el material de Blender ("toon", "outline", "glow") por nombre de malla;
 * las copias conservan el nombre, así sirve también para ellas.
 */
export interface LoadedModel {
  readonly container: AssetContainer;
  readonly materialByMesh: ReadonlyMap<string, string>;
}

/** Carpeta de los modelos dentro de `dist/` (ruta relativa: funciona en cualquier hosting o subcarpeta). */
export const MODELS_URL = 'models/';

/**
 * Carga un `.glb` sin crear sus materiales (el juego pone los suyos de estilo anime).
 * Cada malla con varias partes se divide en una malla por parte; aquí se averigua qué material
 * de Blender le correspondía leyendo el propio archivo.
 */
export async function loadModel(scene: Scene, file: string): Promise<LoadedModel> {
  const response = await fetch(MODELS_URL + file);
  if (!response.ok) throw new Error(`No se pudo cargar el modelo ${file}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const primitiveMaterials = readGlbMaterialNames(bytes);

  const container = await LoadAssetContainerAsync(bytes, scene, {
    pluginExtension: '.glb',
    pluginOptions: { gltf: { skipMaterials: true, animationStartMode: 0 } },
  });

  for (const mesh of container.meshes) colorsToGammaSpace(mesh);
  const json = readGlbJson(bytes);
  const materialByMesh = new Map<string, string>();
  for (const mesh of container.meshes) {
    const pointer = primitivePointer(mesh);
    // Las mallas con esqueleto no traen el puntero: se averigua por el nombre.
    const name = pointer
      ? primitiveMaterials[pointer.mesh]?.[pointer.primitive]
      : materialForMeshName(json, mesh.name);
    if (name) materialByMesh.set(mesh.name, name);
  }
  return { container, materialByMesh };
}

/**
 * El glTF guarda los colores por vértice en espacio lineal; los materiales del juego trabajan con colores
 * tal como se escriben (espacio gamma, igual que los colores de los datos). Se convierten una vez al cargar;
 * las copias comparten la geometría ya convertida.
 */
function colorsToGammaSpace(mesh: AbstractMesh): void {
  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  if (!colors) return;
  const out = new Float32Array(colors.length);
  for (let i = 0; i < colors.length; i++) {
    // El canal alfa (cada cuarto valor) no se convierte.
    out[i] = i % 4 === 3 ? (colors[i] ?? 1) : linearToGamma(colors[i] ?? 0);
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, out, false, 4);
}

/** Conversión estándar sRGB de un canal de color (0..1). */
export function linearToGamma(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** El cargador glTF guarda en los metadatos de cada malla de qué malla y parte del archivo viene. */
function primitivePointer(mesh: AbstractMesh): { mesh: number; primitive: number } | null {
  const pointers = (mesh.metadata as { gltf?: { pointers?: string[] } } | null)?.gltf?.pointers ?? [];
  for (const p of pointers) {
    const match = /^\/meshes\/(\d+)\/primitives\/(\d+)$/.exec(p);
    if (match) return { mesh: Number(match[1]), primitive: Number(match[2]) };
  }
  return null;
}
