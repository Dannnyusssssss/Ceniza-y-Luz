import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { lerp, lerpAngle } from '../core/math';
import { MODELS } from '../data/generated/models';
import { GUARDIAN } from '../data/guardian';
import type { LoadedModel } from '../engine/models';
import { flashIntensity } from '../game/feedback';
import { guardianWindupProgress, type GuardianState } from '../game/guardian';
import { ClipEvaluator } from './clipEvaluator';
import { CLIP_FPS, type ClipSample, type ClipTable } from './clipMix';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import type { ToonMaterials } from './toon';

const COLORS = { danger: '#ff8a4c', crystal: '#8f74e0', shell: '#a98bff' } as const;
const CROSSFADE = 0.14;
/** El modelo mide unos 2,3 m: se ve bastante más grande que un Coloso. */
const SCALE = 1.45;
/** Lo que tardan las púas en salir y volver a hundirse (s). */
const SPIKE_RISE = 0.14;
const SPIKE_HEIGHT = 2.6;
const MAX_SPIKES = GUARDIAN.attacks.spikes.count;

/** Material sin luz para zonas de aviso y envolturas: siempre se ve igual, haya la luz que haya. */
export function unlitMaterial(name: string, hex: string, scene: Scene, alpha: number): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.emissiveColor = Color3.FromHexString(hex);
  material.alpha = alpha;
  material.backFaceCulling = false;
  return material;
}

/** Lo que se ve del Guardián: modelo animado, coraza, zona del barrido y púas. Lee el estado; nunca lo cambia. */
export class GuardianView {
  private readonly root: TransformNode;
  private readonly pivot: TransformNode;
  private readonly model: ModelInstance;
  private readonly evaluator: ClipEvaluator;
  private readonly clips: ClipTable = MODELS.guardian.clips;
  private readonly shell: Mesh;
  private readonly sweepPivot: TransformNode;
  private readonly sweepArea: Mesh;
  private readonly sweepFill: Mesh;
  private readonly spikeRings: Mesh[] = [];
  private readonly spikeFills: Mesh[] = [];
  private readonly spikeMeshes: Mesh[] = [];
  private readonly materialsOwned: StandardMaterial[];
  private loopTime = 0;
  private current: ClipSample | null = null;
  private previous: ClipSample | null = null;
  private fade = 0;
  private time = 0;
  private flashStart = Number.NEGATIVE_INFINITY;

  constructor(
    scene: Scene,
    source: LoadedModel,
    materials: ToonMaterials,
    shadows: ShadowGenerator | null,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.root = new TransformNode('guardian', scene);
    this.pivot = new TransformNode('guardianPivot', scene);
    this.pivot.parent = this.root;
    this.pivot.scaling.setAll(SCALE);
    this.model = instantiateModel(source, materials, shadows);
    this.model.root.parent = this.pivot;
    this.evaluator = new ClipEvaluator(this.model.animations);
    for (const mesh of this.model.meshes) mesh.overlayColor = Color3.White();

    const fillMaterial = unlitMaterial('guardianFill', COLORS.danger, scene, 0.34);
    fillMaterial.zOffset = -2;
    const areaMaterial = unlitMaterial('guardianArea', COLORS.danger, scene, 0.14);
    areaMaterial.zOffset = -1;
    const shellMaterial = unlitMaterial('guardianShell', COLORS.shell, scene, 0.28);
    this.materialsOwned = [fillMaterial, areaMaterial, shellMaterial];

    this.shell = CreateIcoSphere('guardianShell', { radius: 1.85, subdivisions: 1, flat: true }, scene);
    this.shell.scaling.y = 1.45;
    this.shell.position.y = 1.7;
    this.shell.parent = this.root;
    this.shell.material = shellMaterial;
    this.shell.isPickable = false;
    this.shell.setEnabled(false);

    // Zona del barrido: un sector delante del jefe, que se llena durante el aviso.
    const { reach, halfArc } = GUARDIAN.attacks.sweep;
    const arc = (halfArc * 2) / (Math.PI * 2);
    this.sweepPivot = new TransformNode('guardianSweep', scene);
    this.sweepArea = CreateDisc('sweepArea', { radius: reach, arc, tessellation: 48 }, scene);
    this.sweepFill = CreateDisc('sweepFill', { radius: reach, arc, tessellation: 48 }, scene);
    this.sweepArea.material = areaMaterial;
    this.sweepFill.material = fillMaterial;
    for (const m of [this.sweepArea, this.sweepFill]) {
      m.parent = this.sweepPivot;
      m.rotation.x = Math.PI / 2;
      m.isPickable = false;
    }
    this.sweepPivot.setEnabled(false);

    // Zonas de las púas: un círculo fijo y otro que crece; las púas salen al terminar el aviso.
    const r = GUARDIAN.attacks.spikes.radius;
    for (let i = 0; i < MAX_SPIKES; i++) {
      const ring = CreateDisc(`spikeRing${i}`, { radius: r, tessellation: 32 }, scene);
      ring.rotation.x = Math.PI / 2;
      ring.material = areaMaterial;
      const fill = CreateDisc(`spikeFill${i}`, { radius: r, tessellation: 32 }, scene);
      fill.rotation.x = Math.PI / 2;
      fill.material = fillMaterial;
      const spike = CreateCylinder(
        `spike${i}`,
        { height: SPIKE_HEIGHT, diameterTop: 0, diameterBottom: r * 1.1, tessellation: 5 },
        scene,
      );
      spike.convertToFlatShadedMesh();
      spike.material = materials.get(COLORS.crystal, { unlit: true });
      for (const m of [ring, fill, spike]) {
        m.isPickable = false;
        m.setEnabled(false);
      }
      this.spikeRings.push(ring);
      this.spikeFills.push(fill);
      this.spikeMeshes.push(spike);
    }
  }

  /** Destello blanco al recibir un golpe (quien llama respeta el límite de 3 por segundo). */
  flash(): void {
    this.flashStart = this.time;
  }

  private clipFor(g: GuardianState): string {
    switch (g.phase) {
      case 'stalk':
        return 'move';
      case 'windup':
        return g.attack === 'sweep' ? 'sweepWindup' : 'slamWindup';
      case 'strike':
        return g.attack === 'sweep' ? 'sweep' : 'slam';
      case 'shielding':
        return 'slamWindup';
      case 'stagger':
      case 'dying':
        return 'stagger';
      default:
        return 'idle';
    }
  }

  private animate(g: GuardianState, dt: number): void {
    const clip = this.clipFor(g);
    const info = this.clips[clip];
    let frame = 0;
    if (info) {
      if (clip === 'idle' || clip === 'move') {
        this.loopTime = (this.loopTime + dt) % info.seconds;
        frame = this.loopTime * CLIP_FPS;
      } else {
        frame = Math.min(g.time * CLIP_FPS, info.frames);
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
  }

  private updateSweep(g: GuardianState, x: number, z: number, y: number): void {
    const show = g.attack === 'sweep' && (g.phase === 'windup' || (g.phase === 'strike' && g.time < 0.2));
    this.sweepPivot.setEnabled(show);
    if (!show) return;
    const { halfArc } = GUARDIAN.attacks.sweep;
    this.sweepPivot.position.set(x, y + 0.06, z);
    // El disco nace en +X y gira hacia +Z: esto centra el sector en la dirección del jefe.
    this.sweepPivot.rotation.y = g.yaw + halfArc - Math.PI / 2;
    const fill = g.phase === 'windup' ? Math.max(0.05, guardianWindupProgress(g)) : 1;
    this.sweepFill.scaling.set(fill, fill, 1);
  }

  private updateSpikes(g: GuardianState): void {
    const warned = g.attack === 'spikes' && g.phase === 'windup';
    const out = g.attack === 'spikes' && (g.phase === 'strike' || g.phase === 'recover');
    const progress = guardianWindupProgress(g);
    for (let i = 0; i < MAX_SPIKES; i++) {
      const point = g.spikes[i];
      const ring = this.spikeRings[i] as Mesh;
      const fill = this.spikeFills[i] as Mesh;
      const spike = this.spikeMeshes[i] as Mesh;
      const showWarn = warned && point !== undefined;
      ring.setEnabled(showWarn);
      fill.setEnabled(showWarn);
      if (showWarn) {
        const y = this.groundAt(point.x, point.z) + 0.06;
        ring.position.set(point.x, y, point.z);
        fill.position.set(point.x, y + 0.01, point.z);
        const f = Math.max(0.05, progress);
        fill.scaling.set(f, f, 1);
      }
      let height = 0;
      if (out && point) {
        if (g.phase === 'strike') height = Math.min(g.time / SPIKE_RISE, 1);
        else height = Math.max(0, 1 - g.time / GUARDIAN.attacks.spikes.recover);
      }
      spike.setEnabled(height > 0.01);
      if (height > 0.01 && point) {
        const y = this.groundAt(point.x, point.z);
        spike.scaling.y = height;
        spike.position.set(point.x, y + (SPIKE_HEIGHT * height) / 2 - 0.05, point.z);
      }
    }
  }

  update(g: GuardianState, alpha: number, dt: number, reduceFlashing: boolean): void {
    this.time += dt;
    const defeated = g.phase === 'defeated';
    this.root.setEnabled(!defeated);
    if (defeated) {
      this.sweepPivot.setEnabled(false);
      this.updateSpikes(g);
      return;
    }
    const x = lerp(g.prevX, g.x, alpha);
    const z = lerp(g.prevZ, g.z, alpha);
    const y = this.groundAt(x, z);
    this.root.position.set(x, y, z);
    this.root.rotation.y = lerpAngle(g.prevYaw, g.yaw, alpha);
    this.animate(g, dt);
    this.updateSweep(g, x, z, y);
    this.updateSpikes(g);

    // Dormido se ve apagado; al caer se deshace (cambios suaves, sin parpadeo).
    const visibility = g.phase === 'dying' ? Math.max(0, 1 - g.time / GUARDIAN.dissolve) : 1;
    const flash = reduceFlashing ? 0 : flashIntensity(this.time - this.flashStart);
    for (const mesh of this.model.meshes) {
      mesh.visibility = visibility;
      mesh.renderOverlay = flash > 0;
      mesh.overlayAlpha = 0.5 * flash;
    }
    const shielding = g.phase === 'shielding' ? Math.min(g.time / GUARDIAN.shielding, 1) : 1;
    this.shell.setEnabled(g.armored && g.phase !== 'dying');
    this.shell.scaling.x = 0.7 + 0.3 * shielding;
    this.shell.scaling.z = 0.7 + 0.3 * shielding;
    this.shell.scaling.y = (0.7 + 0.3 * shielding) * 1.45;
  }

  dispose(): void {
    for (const m of [...this.spikeRings, ...this.spikeFills, ...this.spikeMeshes]) m.dispose();
    this.sweepPivot.dispose(false, true);
    this.shell.dispose();
    this.model.dispose();
    this.root.dispose();
    for (const material of this.materialsOwned) material.dispose();
  }
}
