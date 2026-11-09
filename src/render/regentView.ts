import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { lerp, lerpAngle } from '../core/math';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { MODELS } from '../data/generated/models';
import { REGENT } from '../data/regent';
import type { BossData } from '../data/zones';
import type { SessionAssets } from '../engine/assets';
import { flashIntensity } from '../game/feedback';
import { regentWindupProgress, type RegentState } from '../game/regent';
import { CharacterView } from './characterView';
import { ClipEvaluator } from './clipEvaluator';
import { CLIP_FPS, type ClipSample, type ClipTable } from './clipMix';
import { unlitMaterial } from './guardianView';
import { MeshBuilder } from './meshBuilder';
import { instantiateModel, type ModelInstance } from './modelMaterials';
import type { ToonMaterials } from './toon';

const COLORS = {
  danger: '#ff8a4c',
  ring: '#ffb45a',
  veil: '#c0506a',
  flame: '#ffd98a',
  mark: '#ffe2a0',
  prison: '#5a4656',
} as const;
const CROSSFADE = 0.14;
/** El modelo mide unos 2,7 m: se ve bastante más alto que el jugador. */
const SCALE = 1.15;
const RING_HEIGHT = 1;
const MAX_RINGS = REGENT.attacks.rings.count * 2;
/** Dónde espera el gemelo y dónde está el trono. */
const PRISON = { x: 0, z: 40.6 };
const THRONE = { x: 0, z: 42.2 };
/** Segundos en los que se deshace la Bruma que retiene al gemelo. */
const PRISON_FADE = 2.5;

interface PlacedProp {
  readonly pivot: TransformNode;
  readonly model: ModelInstance;
}

/**
 * Lo que se ve de la sala del trono: el Regente con sus zonas de aviso, los braseros, el trono y el gemelo
 * retenido por la Bruma. Lee el estado; nunca lo cambia.
 */
export class RegentView {
  private readonly root: TransformNode;
  private readonly pivot: TransformNode;
  private readonly model: ModelInstance;
  private readonly evaluator: ClipEvaluator;
  private readonly clips: ClipTable = MODELS.regente.clips;
  private readonly veil: Mesh;
  private readonly sweepPivot: TransformNode;
  private readonly sweepFill: Mesh;
  private readonly linePivot: TransformNode;
  private readonly lineFill: Mesh;
  private readonly rings: Mesh[] = [];
  private readonly props: PlacedProp[] = [];
  private readonly flames: Mesh[] = [];
  private readonly marks: Mesh[] = [];
  private readonly owned: StandardMaterial[];
  private readonly sibling: CharacterView;
  private readonly prison: Mesh;
  private readonly prisonMaterial: StandardMaterial;
  private prisonAlpha = 0.55;
  private loopTime = 0;
  private current: ClipSample | null = null;
  private previous: ClipSample | null = null;
  private fade = 0;
  private time = 0;
  private flashStart = Number.NEGATIVE_INFINITY;

  constructor(
    scene: Scene,
    assets: SessionAssets,
    materials: ToonMaterials,
    shadows: ShadowGenerator,
    private readonly groundAt: (x: number, z: number) => number,
    siblingId: CharacterId,
    boss: BossData,
  ) {
    this.root = new TransformNode('regent', scene);
    this.root.position.set(boss.x, groundAt(boss.x, boss.z), boss.z);
    this.pivot = new TransformNode('regentPivot', scene);
    this.pivot.parent = this.root;
    this.pivot.scaling.setAll(SCALE);
    this.model = instantiateModel(assets.regente, materials, shadows);
    this.model.root.parent = this.pivot;
    this.evaluator = new ClipEvaluator(this.model.animations);
    for (const mesh of this.model.meshes) mesh.overlayColor = Color3.White();

    const fillMaterial = unlitMaterial('regentFill', COLORS.danger, scene, 0.36);
    fillMaterial.zOffset = -2;
    const areaMaterial = unlitMaterial('regentArea', COLORS.danger, scene, 0.15);
    areaMaterial.zOffset = -1;
    const veilMaterial = unlitMaterial('regentVeil', COLORS.veil, scene, 0.3);
    const ringMaterial = unlitMaterial('regentRing', COLORS.ring, scene, 0.62);
    const markMaterial = unlitMaterial('regentMark', COLORS.mark, scene, 0.28);
    markMaterial.zOffset = -1;
    this.prisonMaterial = unlitMaterial('regentPrison', COLORS.prison, scene, this.prisonAlpha);
    this.owned = [fillMaterial, areaMaterial, veilMaterial, ringMaterial, markMaterial, this.prisonMaterial];

    this.veil = CreateIcoSphere('regentVeilMesh', { radius: 1.75, subdivisions: 2, flat: true }, scene);
    this.veil.scaling.y = 1.55;
    this.veil.position.y = 1.7;
    this.veil.parent = this.root;
    this.veil.material = veilMaterial;
    this.veil.isPickable = false;
    this.veil.setEnabled(false);

    // Tajo: un sector delante del Regente, que se llena durante el aviso.
    const { reach, halfArc } = REGENT.attacks.sweep;
    const arc = (halfArc * 2) / (Math.PI * 2);
    this.sweepPivot = new TransformNode('regentSweep', scene);
    const sweepArea = CreateDisc('regentSweepArea', { radius: reach, arc, tessellation: 48 }, scene);
    this.sweepFill = CreateDisc('regentSweepFill', { radius: reach, arc, tessellation: 48 }, scene);
    sweepArea.material = areaMaterial;
    this.sweepFill.material = fillMaterial;
    for (const m of [sweepArea, this.sweepFill]) {
      m.parent = this.sweepPivot;
      m.rotation.x = Math.PI / 2;
      m.isPickable = false;
    }
    this.sweepPivot.setEnabled(false);

    // Estocada: una franja recta desde el Regente; es la línea exacta por la que pasará.
    const { length, halfWidth } = REGENT.attacks.lunge;
    this.linePivot = new TransformNode('regentLine', scene);
    const makeLine = (name: string): Mesh => {
      const line = CreateGround(name, { width: halfWidth * 2, height: length }, scene);
      line.position.z = length / 2;
      line.bakeCurrentTransformIntoVertices();
      line.parent = this.linePivot;
      line.isPickable = false;
      return line;
    };
    makeLine('regentLineArea').material = areaMaterial;
    this.lineFill = makeLine('regentLineFill');
    this.lineFill.material = fillMaterial;
    this.lineFill.position.y = 0.01;
    this.linePivot.setEnabled(false);

    // Anillos: un muro bajo de ceniza encendida, de la misma anchura que su golpe.
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = CreateCylinder(
        `regentRing${i}`,
        { height: RING_HEIGHT, diameter: 2, tessellation: 56, cap: 0 },
        scene,
      );
      ring.position.y = RING_HEIGHT / 2;
      ring.bakeCurrentTransformIntoVertices();
      ring.material = ringMaterial;
      ring.isPickable = false;
      ring.setEnabled(false);
      this.rings.push(ring);
    }

    const ground = (x: number, z: number): number => groundAt(x, z);
    REGENT.braziers.forEach((b, i) => {
      const y = ground(b.x, b.z);
      this.placeProp(assets.brazier, materials, shadows, b.x, y, b.z, 0);
      const builder = new MeshBuilder();
      builder.sphere(0.42, '#ffffff', { x: b.x, y: y + 1.72, z: b.z, sy: 1.3 });
      const flame = builder.build(`regentFlame${i}`, scene, materials.get(COLORS.flame, { unlit: true }));
      if (flame) {
        flame.setEnabled(false);
        this.flames.push(flame);
      }
      const mark = CreateDisc(`regentMark${i}`, { radius: 1.5, tessellation: 24 }, scene);
      mark.rotation.x = Math.PI / 2;
      mark.position.set(b.x, y + 0.05, b.z);
      mark.material = markMaterial;
      mark.isPickable = false;
      mark.setEnabled(false);
      this.marks.push(mark);
    });
    this.placeProp(
      assets.throne,
      materials,
      shadows,
      THRONE.x,
      ground(THRONE.x, THRONE.z),
      THRONE.z,
      Math.PI,
    );

    this.sibling = new CharacterView(
      scene,
      CHARACTERS[siblingId],
      assets.characters[siblingId],
      assets.blade,
      materials,
      shadows,
    );
    this.sibling.setBladeVisible(false);
    this.sibling.root.position.set(PRISON.x, ground(PRISON.x, PRISON.z), PRISON.z);
    this.sibling.root.rotation.y = Math.PI;
    this.prison = CreateIcoSphere('regentPrisonMesh', { radius: 1.05, subdivisions: 2, flat: true }, scene);
    this.prison.scaling.y = 1.25;
    this.prison.position.set(PRISON.x, ground(PRISON.x, PRISON.z) + 1, PRISON.z);
    this.prison.material = this.prisonMaterial;
    this.prison.isPickable = false;
  }

  private placeProp(
    source: SessionAssets['brazier'],
    materials: ToonMaterials,
    shadows: ShadowGenerator,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ): void {
    const pivot = new TransformNode('regentProp', this.root.getScene());
    pivot.position.set(x, y, z);
    pivot.rotation.y = yaw;
    const model = instantiateModel(source, materials, shadows);
    model.root.parent = pivot;
    this.props.push({ pivot, model });
  }

  /** Destello al recibir un golpe (quien llama respeta el límite de 3 por segundo). */
  flash(): void {
    this.flashStart = this.time;
  }

  private clipFor(r: RegentState): string {
    switch (r.phase) {
      case 'stalk':
        return 'move';
      case 'windup':
        return r.attack === 'sweep' ? 'sweepWindup' : r.attack === 'lunge' ? 'lungeWindup' : 'castWindup';
      case 'strike':
        return r.attack === 'sweep' ? 'sweep' : r.attack === 'lunge' ? 'lunge' : 'cast';
      case 'transition':
        return 'castWindup';
      case 'stagger':
      case 'dying':
        return 'stagger';
      default:
        return 'idle';
    }
  }

  private animate(r: RegentState, dt: number): void {
    const clip = this.clipFor(r);
    const info = this.clips[clip];
    let frame = 0;
    if (info) {
      if (clip === 'idle' || clip === 'move') {
        this.loopTime = (this.loopTime + dt) % info.seconds;
        frame = this.loopTime * CLIP_FPS;
      } else {
        frame = Math.min(r.time * CLIP_FPS, info.frames);
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

  private updateWarnings(r: RegentState, x: number, z: number, y: number): void {
    const warned = r.phase === 'windup';
    const fill = warned ? Math.max(0.05, regentWindupProgress(r)) : 1;
    const showSweep = r.attack === 'sweep' && (warned || (r.phase === 'strike' && r.time < 0.2));
    this.sweepPivot.setEnabled(showSweep);
    if (showSweep) {
      this.sweepPivot.position.set(x, y + 0.06, z);
      // El disco nace en +X y gira hacia +Z: esto centra el sector en la dirección del Regente.
      this.sweepPivot.rotation.y = r.yaw + REGENT.attacks.sweep.halfArc - Math.PI / 2;
      this.sweepFill.scaling.set(fill, fill, 1);
    }
    const showLine = r.attack === 'lunge' && warned;
    this.linePivot.setEnabled(showLine);
    if (showLine) {
      this.linePivot.position.set(x, y + 0.06, z);
      this.linePivot.rotation.y = r.yaw;
      this.lineFill.scaling.z = fill;
    }
  }

  private updateRings(r: RegentState): void {
    this.rings.forEach((mesh, i) => {
      const ring = r.rings[i];
      mesh.setEnabled(ring !== undefined);
      if (!ring) return;
      mesh.position.set(ring.x, this.groundAt(ring.x, ring.z), ring.z);
      mesh.scaling.set(ring.radius, 1, ring.radius);
    });
  }

  /** Dibuja la sala. `rescued`: el gemelo ya no está en la sala. */
  update(
    r: RegentState,
    alpha: number,
    dt: number,
    reduceFlashing: boolean,
    reduceMotion: boolean,
    rescued: boolean,
  ): void {
    this.time += dt;
    const defeated = r.phase === 'defeated';
    this.flames.forEach((flame, i) => flame.setEnabled(defeated || r.braziers[i] === true));
    const veiled = r.veiled && r.phase !== 'transition';
    this.marks.forEach((mark, i) => mark.setEnabled(veiled && r.braziers[i] !== true));
    this.updateRings(r);
    this.updatePrison(defeated, rescued, dt, reduceMotion);
    this.root.setEnabled(!defeated);
    if (defeated) {
      this.sweepPivot.setEnabled(false);
      this.linePivot.setEnabled(false);
      return;
    }
    const x = lerp(r.prevX, r.x, alpha);
    const z = lerp(r.prevZ, r.z, alpha);
    const y = this.groundAt(x, z);
    this.root.position.set(x, y, z);
    this.root.rotation.y = lerpAngle(r.prevYaw, r.yaw, alpha);
    this.animate(r, dt);
    this.updateWarnings(r, x, z, y);
    // Al caer se deshace: cambios suaves, sin parpadeo.
    const visibility = r.phase === 'dying' ? Math.max(0, 1 - r.time / REGENT.dissolve) : 1;
    const flash = reduceFlashing ? 0 : flashIntensity(this.time - this.flashStart);
    for (const mesh of this.model.meshes) {
      mesh.visibility = visibility;
      mesh.renderOverlay = flash > 0;
      mesh.overlayAlpha = 0.5 * flash;
    }
    this.veil.setEnabled(r.veiled && r.phase !== 'dying');
    const grow = r.phase === 'transition' ? Math.min(r.time / REGENT.transition, 1) : 1;
    this.veil.scaling.set(0.7 + 0.3 * grow, (0.7 + 0.3 * grow) * 1.55, 0.7 + 0.3 * grow);
  }

  private updatePrison(defeated: boolean, rescued: boolean, dt: number, reduceMotion: boolean): void {
    this.sibling.root.setEnabled(!rescued);
    if (rescued) {
      this.prison.setEnabled(false);
      return;
    }
    this.sibling.update(
      { speed: 0, dodge: 0, attack: null, hurt: Number.POSITIVE_INFINITY, dead: null, reduceMotion },
      dt,
    );
    if (defeated && this.prisonAlpha > 0) {
      this.prisonAlpha = Math.max(0, this.prisonAlpha - (dt * 0.55) / PRISON_FADE);
      this.prisonMaterial.alpha = this.prisonAlpha;
    }
    this.prison.setEnabled(this.prisonAlpha > 0);
  }

  dispose(): void {
    this.sibling.dispose();
    this.prison.dispose();
    for (const prop of this.props) {
      prop.model.dispose();
      prop.pivot.dispose();
    }
    for (const m of [...this.flames, ...this.marks, ...this.rings]) m.dispose();
    this.sweepPivot.dispose(false, true);
    this.linePivot.dispose(false, true);
    this.veil.dispose();
    this.model.dispose();
    this.root.dispose();
    for (const material of this.owned) material.dispose();
  }
}
