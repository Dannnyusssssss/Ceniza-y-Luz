import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreatePolyhedron } from '@babylonjs/core/Meshes/Builders/polyhedronBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { lerp, lerpAngle } from '../core/math';
import { ENEMY_RULES, type EnemyKind } from '../data/enemies';
import { MODELS } from '../data/generated/models';
import type { LoadedModel } from '../engine/models';
import { windupProgress, type EnemyPhase, type EnemyState } from '../game/enemies';
import type { EncounterState } from '../game/encounter';
import { flashIntensity } from '../game/feedback';
import type { Projectile } from '../game/projectiles';
import { ClipEvaluator } from './clipEvaluator';
import { CLIP_FPS, type ClipSample, type ClipTable } from './clipMix';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import { AshParticles, InstancedPoints } from './particles';
import type { ToonMaterials } from './toon';

/** Clip que se muestra en cada fase del enemigo. */
const CLIP_FOR: Readonly<Record<EnemyPhase, string>> = {
  spawning: 'idle',
  idle: 'idle',
  chase: 'move',
  circle: 'move',
  windup: 'windup',
  attack: 'attack',
  recover: 'recover',
  stagger: 'hurt',
  dying: 'hurt',
};
const LOOPING = new Set(['idle', 'move']);
const CROSSFADE = 0.12;

/** Altura del aviso y de la barra de vida sobre cada tipo. */
const TOP: Readonly<Record<EnemyKind, number>> = {
  brumilla: 1.05,
  acechador: 1.4,
  coloso: 2.6,
  tirador: 2.05,
};
/** Tamaño a la vista de la ceniza al desvanecerse. */
const SIZE: Readonly<Record<EnemyKind, number>> = {
  brumilla: 0.5,
  acechador: 0.7,
  coloso: 1.4,
  tirador: 0.9,
};

const COLORS = {
  warn: '#ffc857',
  ring: '#ff8a4c',
  barBack: '#2a2233',
  barFill: '#e85d75',
  ember: '#ff9b4a',
  spark: '#ffd24a',
  ash: '#9a8fb4',
} as const;
const BAR_WIDTH = 0.8;

/** Materiales y mallas compartidos por todas las vistas de enemigos. */
interface Shared {
  readonly scene: Scene;
  readonly materials: ToonMaterials;
  readonly shadows: ShadowGenerator | null;
  readonly ringMaterial: StandardMaterial;
  readonly ringFillMaterial: StandardMaterial;
}

/** Vista de un enemigo: modelo animado, aviso de ataque, círculo del golpe del Coloso y barra de vida. */
class EnemyView {
  readonly root: TransformNode;
  /** Altura y tamaño al aparecer o desvanecerse. La raíz del glTF no se toca: su escala -1 en Z convierte los ejes. */
  private readonly pivot: TransformNode;
  private readonly model: ModelInstance;
  private readonly evaluator: ClipEvaluator;
  private readonly clips: ClipTable;
  private readonly marker: Mesh;
  private readonly barRoot: TransformNode;
  private readonly barFill: Mesh;
  private readonly ring: Mesh | null = null;
  private readonly ringFill: Mesh | null = null;
  private loopTime = 0;
  private current: ClipSample | null = null;
  private previous: ClipSample | null = null;
  private fade = 0;
  private time = 0;
  private flashStart = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly enemy: EnemyState,
    model: LoadedModel,
    shared: Shared,
  ) {
    const { scene, materials } = shared;
    this.root = new TransformNode(`enemy-${enemy.id}`, scene);
    this.pivot = new TransformNode(`enemyPivot-${enemy.id}`, scene);
    this.pivot.parent = this.root;
    this.model = instantiateModel(model, materials, shared.shadows);
    this.model.root.parent = this.pivot;
    this.evaluator = new ClipEvaluator(this.model.animations);
    this.clips = MODELS[enemy.kind].clips;
    for (const mesh of this.model.meshes) mesh.overlayColor = Color3.White();

    // Aviso de ataque: un rombo de luz que crece sobre la cabeza (no parpadea).
    this.marker = CreatePolyhedron(`warn-${enemy.id}`, { type: 1, size: 0.11 }, scene);
    this.marker.scaling.y = 1.6;
    this.marker.material = materials.get(COLORS.warn, { unlit: true });
    this.marker.parent = this.root;
    this.marker.position.y = TOP[enemy.kind] + 0.35;
    this.marker.isPickable = false;
    this.marker.setEnabled(false);

    // Barra de vida (solo cuando ya recibió daño). El número no hace falta: lo marca su longitud y el HUD cuenta enemigos.
    this.barRoot = new TransformNode(`bar-${enemy.id}`, scene);
    this.barRoot.parent = this.root;
    this.barRoot.position.y = TOP[enemy.kind];
    this.barRoot.billboardMode = TransformNode.BILLBOARDMODE_ALL;
    const back = CreateBox(
      `barBack-${enemy.id}`,
      { width: BAR_WIDTH + 0.05, height: 0.09, depth: 0.02 },
      scene,
    );
    back.material = materials.get(COLORS.barBack, { unlit: true });
    back.parent = this.barRoot;
    this.barFill = CreateBox(`barFill-${enemy.id}`, { width: BAR_WIDTH, height: 0.055, depth: 0.03 }, scene);
    this.barFill.material = materials.get(COLORS.barFill, { unlit: true });
    this.barFill.parent = this.barRoot;
    this.barFill.position.z = -0.01;
    for (const m of [back, this.barFill]) {
      m.isPickable = false;
      m.applyFog = false;
    }
    this.barRoot.setEnabled(false);

    if (enemy.stats.behavior === 'brute') {
      // Círculo en el suelo donde caerá el golpe; se llena durante el aviso.
      const r = enemy.stats.hitRadius;
      this.ring = CreateTorus(
        `ring-${enemy.id}`,
        { diameter: r * 2, thickness: 0.08, tessellation: 48 },
        scene,
      );
      this.ring.material = shared.ringMaterial;
      this.ringFill = CreateDisc(`ringFill-${enemy.id}`, { radius: r, tessellation: 48 }, scene);
      this.ringFill.rotation.x = Math.PI / 2;
      this.ringFill.material = shared.ringFillMaterial;
      for (const m of [this.ring, this.ringFill]) {
        m.isPickable = false;
        m.setEnabled(false);
      }
    }
  }

  /** Empieza el destello de golpe. */
  flash(): void {
    this.flashStart = this.time;
  }

  update(alpha: number, dt: number, reduceFlashing: boolean, reduceMotion: boolean): void {
    const e = this.enemy;
    this.time += dt;
    this.root.position.set(lerp(e.prevX, e.x, alpha), 0, lerp(e.prevZ, e.z, alpha));
    this.root.rotation.y = lerpAngle(e.prevYaw, e.yaw, alpha);

    // Animación: el clip de la fase, en el fotograma que marca la lógica (los ciclos corren por su cuenta).
    const clip = CLIP_FOR[e.phase];
    const info = this.clips[clip];
    let frame = 0;
    if (info) {
      if (LOOPING.has(clip)) {
        const rate = clip === 'move' ? Math.max(0.6, e.speed / Math.max(e.stats.speed, 0.1)) : 1;
        this.loopTime = (this.loopTime + dt * rate) % info.seconds;
        frame = this.loopTime * CLIP_FPS;
      } else {
        frame = Math.min(e.time * CLIP_FPS, info.frames);
      }
    }
    const sample: ClipSample = { clip, frame, weight: 1 };
    if (this.current && this.current.clip !== clip) {
      this.previous = this.current;
      this.fade = 1;
    }
    this.current = sample;
    if (this.previous && this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt / CROSSFADE);
      this.evaluator.apply([
        { ...this.previous, weight: this.fade },
        { ...sample, weight: 1 - this.fade },
      ]);
    } else {
      this.evaluator.apply([sample]);
    }

    // Aparecer y desvanecerse: surge de la bruma y se deshace en ceniza (cambios suaves, sin parpadeo).
    let visibility = 1;
    let y = 0;
    let scale = 1;
    if (e.phase === 'spawning') {
      const t = Math.min(e.time / ENEMY_RULES.spawnTime, 1);
      visibility = t;
      scale = 0.4 + 0.6 * (1 - (1 - t) * (1 - t));
      y = -0.3 * (1 - t);
    } else if (e.phase === 'dying') {
      const t = Math.min(e.time / ENEMY_RULES.dissolveTime, 1);
      visibility = 1 - t;
      y = -0.35 * t;
      scale = 1 - 0.15 * t;
    }
    this.pivot.position.y = y;
    this.pivot.scaling.setAll(scale);
    const flash = reduceFlashing ? 0 : flashIntensity(this.time - this.flashStart);
    for (const mesh of this.model.meshes) {
      mesh.visibility = visibility;
      mesh.renderOverlay = flash > 0;
      mesh.overlayAlpha = 0.6 * flash;
    }

    // Aviso de ataque.
    const warn = windupProgress(e);
    this.marker.setEnabled(e.phase === 'windup');
    if (warn > 0) {
      const s = 0.5 + 0.9 * warn;
      this.marker.scaling.set(s, s * 1.6, s);
      this.marker.rotation.y += dt * (reduceMotion ? 1 : 3);
      this.marker.position.y = TOP[e.kind] + 0.35 + (reduceMotion ? 0 : Math.sin(this.time * 6) * 0.04);
    }
    if (this.ring && this.ringFill) {
      const show = e.phase === 'windup' || (e.phase === 'attack' && e.time < 0.25);
      this.ring.setEnabled(show);
      this.ringFill.setEnabled(show);
      if (show) {
        this.ring.position.set(e.targetX, 0.05, e.targetZ);
        this.ringFill.position.set(e.targetX, 0.04, e.targetZ);
        const fill = e.phase === 'windup' ? Math.max(0.05, warn) : 1;
        this.ringFill.scaling.set(fill, fill, 1);
      }
    }

    // Barra de vida.
    const alive = e.phase !== 'dying';
    const damaged = e.health < e.maxHealth;
    this.barRoot.setEnabled(alive && damaged && e.phase !== 'spawning');
    if (alive && damaged) {
      const ratio = Math.max(0, e.health / e.maxHealth);
      this.barFill.scaling.x = Math.max(ratio, 0.0001);
      this.barFill.position.x = -(BAR_WIDTH * (1 - ratio)) / 2;
    }
  }

  dispose(): void {
    this.ring?.dispose();
    this.ringFill?.dispose();
    this.model.dispose();
    this.root.dispose();
  }
}

/** Bola de ceniza del Tirador: núcleo brillante y halo. Late de tamaño (no de brillo). */
class ProjectileView {
  private readonly core: Mesh;
  private readonly halo: Mesh;
  private time = 0;

  constructor(
    private readonly projectile: Projectile,
    shared: Shared,
    haloMaterial: StandardMaterial,
  ) {
    const d = projectile.radius * 2;
    this.core = CreateSphere(`shot-${projectile.id}`, { diameter: d, segments: 8 }, shared.scene);
    this.core.material = shared.materials.get(COLORS.ember, { unlit: true });
    this.halo = CreateSphere(`shotHalo-${projectile.id}`, { diameter: d * 1.7, segments: 8 }, shared.scene);
    this.halo.material = haloMaterial;
    this.halo.parent = this.core;
    for (const m of [this.core, this.halo]) m.isPickable = false;
  }

  update(alpha: number, dt: number): void {
    const p = this.projectile;
    this.time += dt;
    this.core.position.set(lerp(p.prevX, p.x, alpha), 1.0, lerp(p.prevZ, p.z, alpha));
    this.core.scaling.setAll(1 + 0.08 * Math.sin(this.time * 7));
  }

  dispose(): void {
    this.core.dispose();
  }
}

/** Todo lo que se ve del combate: enemigos, proyectiles, chispas y ceniza. */
export class EncounterView {
  private readonly shared: Shared;
  private readonly enemies = new Map<number, EnemyView>();
  private readonly projectiles = new Map<number, ProjectileView>();
  private readonly haloMaterial: StandardMaterial;
  private readonly sparks: InstancedPoints;
  private readonly ash: AshParticles;
  private time = 0;

  constructor(
    scene: Scene,
    private readonly models: Readonly<Record<EnemyKind, LoadedModel>>,
    materials: ToonMaterials,
    shadows: ShadowGenerator | null,
  ) {
    const ringMaterial = unlitMaterial('dangerRing', COLORS.ring, scene, 0.9);
    const ringFillMaterial = unlitMaterial('dangerFill', COLORS.ring, scene, 0.28);
    ringFillMaterial.zOffset = -2;
    this.shared = { scene, materials, shadows, ringMaterial, ringFillMaterial };
    this.haloMaterial = unlitMaterial('shotHalo', COLORS.ember, scene, 0.3);
    const sparkMesh = CreatePolyhedron('sparks', { type: 1, size: 0.07 }, scene);
    sparkMesh.scaling.y = 1.4;
    this.sparks = new InstancedPoints(sparkMesh, materials.get(COLORS.spark, { unlit: true }), 64);
    const ashMesh = CreateBox('ash', { size: 0.07 }, scene);
    this.ash = new AshParticles(
      new InstancedPoints(ashMesh, unlitMaterial('ash', COLORS.ash, scene, 1), 256),
    );
  }

  /** Destello blanco sobre un enemigo golpeado (quien llama respeta el límite de 3 por segundo). */
  flashEnemy(id: number): void {
    this.enemies.get(id)?.flash();
  }

  /** Nube de ceniza en un punto (proyectil que estalla o se corta). */
  burst(x: number, z: number, reduceMotion: boolean): void {
    this.ash.emit(x, 0.9, z, reduceMotion ? 5 : 10, 0.25, 0.2);
  }

  update(
    state: EncounterState,
    alpha: number,
    dt: number,
    reduceFlashing: boolean,
    reduceMotion: boolean,
  ): void {
    this.time += dt;
    // Enemigos: crear las vistas nuevas, actualizar y quitar las de los que ya no están.
    const present = new Set<number>();
    for (const enemy of state.enemies) {
      present.add(enemy.id);
      let view = this.enemies.get(enemy.id);
      if (!view) {
        view = new EnemyView(enemy, this.models[enemy.kind], this.shared);
        this.enemies.set(enemy.id, view);
      }
      view.update(alpha, dt, reduceFlashing, reduceMotion);
      if (enemy.phase === 'dying' && dt > 0) {
        // Ceniza mientras se deshace.
        const size = SIZE[enemy.kind];
        const rate = (reduceMotion ? 20 : 45) * size;
        const n = Math.floor(rate * dt + Math.random());
        this.ash.emit(enemy.x, 0.1, enemy.z, n, enemy.stats.radius, TOP[enemy.kind] * 0.8);
      }
    }
    for (const [id, view] of this.enemies) {
      if (!present.has(id)) {
        view.dispose();
        this.enemies.delete(id);
      }
    }

    const shots = new Set<number>();
    for (const p of state.projectiles) {
      shots.add(p.id);
      let view = this.projectiles.get(p.id);
      if (!view) {
        view = new ProjectileView(p, this.shared, this.haloMaterial);
        this.projectiles.set(p.id, view);
      }
      view.update(alpha, dt);
    }
    for (const [id, view] of this.projectiles) {
      if (!shots.has(id)) {
        view.dispose();
        this.projectiles.delete(id);
      }
    }

    // Chispas: giran y flotan un poco.
    this.sparks.begin();
    for (const s of state.sparks) {
      const bob = reduceMotion ? 0 : Math.sin(this.time * 3 + s.x) * 0.04;
      this.sparks.push(s.x, s.y + bob, s.z, this.time * 2.5 + s.z, 1);
    }
    this.sparks.end();
    this.ash.update(dt);
  }

  /** Quita todo (reintentar o volver al inicio). */
  clear(): void {
    for (const view of this.enemies.values()) view.dispose();
    this.enemies.clear();
    for (const view of this.projectiles.values()) view.dispose();
    this.projectiles.clear();
    this.ash.clear();
    this.sparks.begin();
    this.sparks.end();
  }
}

function unlitMaterial(name: string, hex: string, scene: Scene, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.FromHexString(hex);
  material.alpha = alpha;
  material.backFaceCulling = false;
  return material;
}
