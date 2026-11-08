import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materialForMeshName, readGlbJson, readGlbMaterialNames } from '../src/engine/glb';
import { MODEL_MATERIALS } from '../src/render/modelMaterials';
import { MODELS } from '../src/data/generated/models';

const DIR = join(__dirname, '..', 'public', 'models');
const files = readdirSync(DIR).filter((f) => f.endsWith('.glb'));
/** Extensiones que Babylon interpreta sin descargar nada de fuera. */
const ALLOWED_EXTENSIONS = ['KHR_materials_emissive_strength'];
/** Peso máximo por modelo (los .glb van sin compresión). */
const MAX_BYTES = 1.5 * 1024 * 1024;

describe('modelos exportados', () => {
  it('hay modelos', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const bytes = new Uint8Array(readFileSync(join(DIR, file)));
      const json = readGlbJson(bytes);

      it('no necesita extensiones que descarguen algo de fuera', () => {
        expect(json.extensionsRequired ?? []).toEqual([]);
        for (const ext of json.extensionsUsed ?? []) expect(ALLOWED_EXTENSIONS).toContain(ext);
      });

      it('solo usa los materiales que el juego reconoce y lleva colores por vértice', () => {
        for (const names of readGlbMaterialNames(bytes)) {
          for (const name of names) expect(MODEL_MATERIALS as readonly string[]).toContain(name);
        }
        // Todo lleva color por vértice, salvo las piezas con textura (la cara), que llevan coordenadas de textura.
        for (const mesh of json.meshes ?? []) {
          for (const p of mesh.primitives) {
            const textured = p.attributes['TEXCOORD_0'] !== undefined;
            expect(textured || p.attributes['COLOR_0'] !== undefined).toBe(true);
          }
        }
      });

      it('no supera el peso máximo y está en el manifiesto', () => {
        expect(statSync(join(DIR, file)).size).toBeLessThanOrEqual(MAX_BYTES);
        expect(Object.keys(MODELS)).toContain(file.replace('.glb', ''));
      });
    });
  }
});

describe('texturas de los modelos', () => {
  /** Peso máximo de cada textura (la de la cara es un PNG pequeño). */
  const MAX_TEXTURE_BYTES = 100 * 1024;
  for (const [model, manifest] of Object.entries(MODELS)) {
    const textures: readonly string[] = 'textures' in manifest ? manifest.textures : [];
    for (const texture of textures) {
      it(`${model}: ${texture} existe y es pequeña`, () => {
        const path = join(DIR, texture);
        expect(existsSync(path)).toBe(true);
        expect(statSync(path).size).toBeLessThanOrEqual(MAX_TEXTURE_BYTES);
      });
    }
  }
});

describe('readGlbJson', () => {
  it('rechaza archivos que no son glb', () => {
    expect(() => readGlbJson(new Uint8Array(4))).toThrow();
    expect(() => readGlbJson(new Uint8Array(40))).toThrow();
  });
});

describe('materialForMeshName', () => {
  const json = {
    materials: [{ name: 'toon' }, { name: 'outline' }, { name: 'face' }],
    meshes: [
      {
        name: 'alba',
        primitives: [
          { material: 0, attributes: {} },
          { material: 1, attributes: {} },
        ],
      },
      { name: 'albaFace', primitives: [{ material: 2, attributes: {} }] },
    ],
    nodes: [
      { name: 'alba', mesh: 0 },
      { name: 'albaFace', mesh: 1 },
    ],
  };

  it('reconoce las partes "<nodo>_primitive<n>" y las mallas de una sola parte', () => {
    expect(materialForMeshName(json, 'alba_primitive0')).toBe('toon');
    expect(materialForMeshName(json, 'alba_primitive1')).toBe('outline');
    expect(materialForMeshName(json, 'albaFace')).toBe('face');
  });

  it('devuelve null si no encuentra la malla o la parte', () => {
    expect(materialForMeshName(json, 'otra')).toBeNull();
    expect(materialForMeshName(json, 'alba_primitive7')).toBeNull();
  });

  it('encuentra el material de cada parte de los gemelos exportados', () => {
    for (const id of ['alba', 'ciro']) {
      const real = readGlbJson(new Uint8Array(readFileSync(join(DIR, `${id}.glb`))));
      expect(materialForMeshName(real, `${id}_primitive0`)).toBe('toon');
      expect(materialForMeshName(real, `${id}Face`)).toBe('face');
    }
  });
});
