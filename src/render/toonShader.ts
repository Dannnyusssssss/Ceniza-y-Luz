import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
// Se cargan aquí los sombreadores de CellMaterial para poder corregirlos antes de que se compilen.
// CellMaterial los importa después de forma diferida; como ya están registrados, usa estas versiones.
import '@babylonjs/materials/cell/cell.fragment';
import '@babylonjs/materials/cell/wgsl/cell.fragment';

const SHADER_NAME = 'cellPixelShader';

/** Color por el que se multiplica la zona en sombra: algo frío y violeta, como en la animación. */
const SHADOW_TINT = '0.62,0.58,0.74';
/** Borde entre luz y sombra: estrecho para que sea nítido, con un pequeño suavizado contra los dientes de sierra. */
const EDGE = '0.42,0.5';

/** Un cambio en el código del sombreador: texto original y texto nuevo. */
export interface ShaderPatch {
  readonly from: string;
  readonly to: string;
}

/**
 * Cambios en el sombreador de CellMaterial, en GLSL (WebGL2) y WGSL (WebGPU):
 * 1. Modo de dos tonos (sin `computeHighLevel`): en GLSL la multiplicación no se asignaba, así que en WebGL2
 *    no hacía nada; en WGSL usaba un gris plano. Ahora: luz plena o sombra teñida, con borde nítido.
 * 2. Normal segura: en piezas finas (puntas de mechones, bordes de tela) la normal interpolada puede quedar
 *    casi en cero y `normalize` da un valor no numérico; el brillo (bloom) lo esparcía en rectángulos que
 *    parpadeaban. Se normaliza con un mínimo.
 * 3. Color final sin valores no numéricos ni desmedidos, como segunda protección para el brillo.
 */
export const TOON_PATCHES: { readonly glsl: readonly ShaderPatch[]; readonly wgsl: readonly ShaderPatch[] } =
  {
    glsl: [
      {
        from: 'float level=1.0;if (info.ndl<0.5)\nlevel=0.5;diffuseBase.rgb*vec3(level,level,level);',
        to: `float level=smoothstep(${EDGE},info.ndl);diffuseBase*=mix(vec3(${SHADOW_TINT}),vec3(1.0),level);`,
      },
      {
        from: 'vec3 normalW=normalize(vNormalW);',
        to: 'vec3 normalW=vNormalW*inversesqrt(max(dot(vNormalW,vNormalW),1e-8));',
      },
      {
        from: 'gl_FragColor=color;',
        to: 'if (any(isnan(color))) {color=vec4(0.0,0.0,0.0,1.0);}\ncolor=clamp(color,0.0,16.0);\ngl_FragColor=color;',
      },
    ],
    wgsl: [
      {
        from: 'var level: f32=1.0;if (info.ndl<0.5) {level=0.5;}\ndiffuseBase=diffuseBase.rgb* vec3f(level,level,level);',
        to: `var level: f32=smoothstep(${EDGE},info.ndl);diffuseBase=diffuseBase*mix(vec3f(${SHADOW_TINT}),vec3f(1.0),level);`,
      },
      {
        from: 'var normalW: vec3f=normalize(fragmentInputs.vNormalW);',
        to: 'var normalW: vec3f=fragmentInputs.vNormalW*inverseSqrt(max(dot(fragmentInputs.vNormalW,fragmentInputs.vNormalW),1e-8));',
      },
      {
        from: 'fragmentOutputs.color=color;',
        to: 'color=clamp(color,vec4f(0.0),vec4f(16.0));\nfragmentOutputs.color=color;',
      },
    ],
  };

function applyPatches(source: string | undefined, patches: readonly ShaderPatch[]): string | null {
  if (!source || !patches.every((p) => source.includes(p.from))) return null;
  return patches.reduce((code, p) => code.replace(p.from, p.to), source);
}

let installed = false;

/**
 * Aplica los cambios de `TOON_PATCHES` en los dos lenguajes.
 * Devuelve true si se aplicó a los dos lenguajes (es idempotente).
 */
export function installToonShading(): boolean {
  if (installed) return true;
  const glsl = applyPatches(ShaderStore.ShadersStore[SHADER_NAME], TOON_PATCHES.glsl);
  const wgsl = applyPatches(ShaderStore.ShadersStoreWGSL[SHADER_NAME], TOON_PATCHES.wgsl);
  if (glsl === null || wgsl === null) return false;
  ShaderStore.ShadersStore[SHADER_NAME] = glsl;
  ShaderStore.ShadersStoreWGSL[SHADER_NAME] = wgsl;
  installed = true;
  return true;
}
