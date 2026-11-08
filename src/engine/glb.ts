/**
 * Lectura mínima del formato `.glb` (sin el motor gráfico), para conocer los materiales
 * de cada parte y comprobar los archivos en los tests.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export interface GltfJson {
  readonly asset?: { readonly version?: string };
  readonly extensionsUsed?: readonly string[];
  readonly extensionsRequired?: readonly string[];
  readonly materials?: readonly { readonly name?: string }[];
  readonly meshes?: readonly {
    readonly name?: string;
    readonly primitives: readonly {
      readonly material?: number;
      readonly attributes: Record<string, number>;
    }[];
  }[];
  readonly nodes?: readonly { readonly name?: string; readonly mesh?: number }[];
  readonly animations?: readonly { readonly name?: string }[];
  readonly skins?: readonly unknown[];
}

/** Extrae el bloque JSON de un `.glb`. Lanza un error si el archivo no es un glb válido. */
export function readGlbJson(bytes: Uint8Array): GltfJson {
  if (bytes.byteLength < 20) throw new Error('Archivo glb demasiado corto');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('No es un archivo glb');
  if (view.getUint32(4, true) !== 2) throw new Error('Versión de glb no admitida');
  const chunkLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON || 20 + chunkLength > bytes.byteLength) {
    throw new Error('Bloque JSON del glb no válido');
  }
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + chunkLength));
  return JSON.parse(text) as GltfJson;
}

/** Para cada malla del archivo, el nombre del material de cada una de sus partes. */
export function readGlbMaterialNames(bytes: Uint8Array): string[][] {
  const json = readGlbJson(bytes);
  const names = (json.materials ?? []).map((m) => m.name ?? '');
  return (json.meshes ?? []).map((mesh) =>
    mesh.primitives.map((p) => (p.material !== undefined ? (names[p.material] ?? '') : '')),
  );
}

/**
 * Material de Blender de una malla de Babylon a partir de su nombre. El cargador llama a cada parte
 * "<nodo>_primitive<n>" cuando una malla tiene varias, o solo "<nodo>" si tiene una. Sirve para las mallas
 * con esqueleto, que no guardan en sus metadatos de qué parte del archivo vienen.
 */
export function materialForMeshName(json: GltfJson, meshName: string): string | null {
  const match = /^(.*)_primitive(\d+)$/.exec(meshName);
  const base = match?.[1] ?? meshName;
  const primitive = match ? Number(match[2]) : 0;
  const fromNode = (json.nodes ?? []).find((n) => n.name === base && n.mesh !== undefined)?.mesh;
  const meshIndex = fromNode ?? (json.meshes ?? []).findIndex((m) => m.name === base);
  const material = json.meshes?.[meshIndex]?.primitives[primitive]?.material;
  if (material === undefined) return null;
  return json.materials?.[material]?.name ?? null;
}
