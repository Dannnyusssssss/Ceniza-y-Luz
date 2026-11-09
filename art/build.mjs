// Genera y exporta los modelos del juego con Blender en segundo plano.
//
// Uso:
//   npm run art                         genera o exporta todos los modelos
//   npm run art -- alba ciro            solo esos modelos
//   npm run art -- --regenerate alba    vuelve a generar aunque el .blend se haya retocado a mano
//   npm run art -- --no-previews        sin renders de vista previa
//
// La ruta de Blender se toma de la variable BLENDER_PATH o de la instalación por defecto.
// Si un .blend se retocó a mano (su huella no coincide con la registrada), solo se exporta.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMBO_BALANCE, DODGE_BALANCE } from '../src/data/balance.ts';
import { BLADE_COLORS, CHARACTERS } from '../src/data/characters.ts';
import { LUMBRE_PALETTE } from '../src/data/palettes.ts';
import { ENEMIES } from '../src/data/enemies.ts';
import { GUARDIAN } from '../src/data/guardian.ts';
import { REGENT } from '../src/data/regent.ts';
import { NPCS } from '../src/data/npcs.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = [
  'blade',
  'dummy',
  'alba',
  'ciro',
  'brumilla',
  'acechador',
  'coloso',
  'tirador',
  'chest',
  'beacon',
  'switch',
  'pushblock',
  'plate',
  'gate',
  'torch',
  'prism',
  'shrine',
  'crystalwall',
  'guardian',
  'regente',
  'brazier',
  'throne',
  'ilse',
  'oren',
  'teo',
];
const DEFAULT_BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const REGISTRY = join(ROOT, 'art', 'blend', 'generated.json');
const GENERATED_TS = join(ROOT, 'src', 'data', 'generated', 'models.ts');

function parseArgs(argv) {
  const options = { models: [], regenerate: new Set(), previews: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--regenerate') options.regenerate.add(argv[++i]);
    else if (arg === '--no-previews') options.previews = false;
    else if (MODELS.includes(arg)) options.models.push(arg);
    else throw new Error(`Argumento desconocido: ${arg}`);
  }
  if (options.models.length === 0) options.models = [...MODELS];
  return options;
}

function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Datos del juego que necesita Blender: colores y tiempos de animación (una sola fuente de verdad). */
function gameData() {
  return {
    outline: LUMBRE_PALETTE.outline,
    blade: BLADE_COLORS,
    characters: CHARACTERS,
    enemies: ENEMIES,
    guardian: GUARDIAN,
    regent: REGENT,
    npcs: NPCS,
    timings: {
      dodge: DODGE_BALANCE.duration,
      attacks: COMBO_BALANCE.steps.map((s) => ({ duration: s.duration, hitFrom: s.hitFrom, hitTo: s.hitTo })),
    },
  };
}

function runBlender(blender, model, mode, options) {
  const work = join(tmpdir(), `art-${model}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const args = {
    model,
    mode,
    blend: join(ROOT, 'art', 'blend', `${model}.blend`),
    glb: join(ROOT, 'public', 'models', `${model}.glb`),
    previews: options.previews ? join(ROOT, 'art', 'previews') : null,
    manifest: join(work, 'manifest.json'),
    data: gameData(),
  };
  const argsPath = join(work, 'args.json');
  writeFileSync(argsPath, JSON.stringify(args));
  const script = join(ROOT, 'art', 'blender', 'build_model.py');
  const result = spawnSync(
    blender,
    ['--background', '--factory-startup', '--python-exit-code', '1', '--python', script, '--', argsPath],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0 || !output.includes(`MODEL_OK ${model}`)) {
    console.error(output.split('\n').slice(-40).join('\n'));
    throw new Error(`Blender falló con el modelo ${model}`);
  }
  const manifest = JSON.parse(readFileSync(args.manifest, 'utf8'));
  rmSync(work, { recursive: true, force: true });
  return { manifest, blend: args.blend };
}

function writeGeneratedModule(manifests) {
  mkdirSync(dirname(GENERATED_TS), { recursive: true });
  const body = JSON.stringify(manifests, null, 2);
  const content = `// Archivo generado por \`npm run art\`. No editar a mano.\n// Clips de animación, huesos y triángulos de cada modelo exportado desde Blender.\n\nexport const MODELS = ${body} as const;\n`;
  writeFileSync(GENERATED_TS, content);
  const prettier = join(ROOT, 'node_modules', 'prettier', 'bin', 'prettier.cjs');
  spawnSync(process.execPath, [prettier, '--write', GENERATED_TS], { encoding: 'utf8' });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const blender = process.env.BLENDER_PATH ?? DEFAULT_BLENDER;
  if (!existsSync(blender)) {
    throw new Error(`No se encontró Blender en "${blender}". Indica la ruta con la variable BLENDER_PATH.`);
  }
  const registry = readJson(REGISTRY, {});
  const previous = readJson(join(ROOT, 'art', 'blend', 'manifests.json'), {});
  const manifests = { ...previous };

  for (const model of options.models) {
    const blendPath = join(ROOT, 'art', 'blend', `${model}.blend`);
    const handEdited =
      existsSync(blendPath) && registry[model] !== undefined && hashFile(blendPath) !== registry[model];
    const mode = handEdited && !options.regenerate.has(model) ? 'export' : 'generate';
    console.log(`${model}: ${mode === 'export' ? 'solo exportar (retocado a mano)' : 'generar'}`);
    const { manifest, blend } = runBlender(blender, model, mode, options);
    if (mode === 'generate') registry[model] = hashFile(blend);
    manifests[model] = manifest;
  }

  writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
  writeFileSync(join(ROOT, 'art', 'blend', 'manifests.json'), `${JSON.stringify(manifests, null, 2)}\n`);
  writeGeneratedModule(manifests);
  console.log('Modelos listos:', options.models.join(', '));
}

main();
