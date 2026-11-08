import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { CHARACTERS, type CharacterId } from '../data/characters';
import type { EnemyKind } from '../data/enemies';
import { INTRO_SHOTS, type IntroShot } from '../data/intro';
import type { ZoneData } from '../data/zones';
import { CharacterView } from '../render/characterView';
import type { EncounterView } from '../render/encounterView';
import { createActor, type ActorView } from '../render/zoneProps';
import type { ToonMaterials } from '../render/toon';
import { groundHeight } from '../world/terrain';
import type { SessionAssets } from './assets';
import type { ThirdPersonCamera } from './thirdPersonCamera';

/** Velocidad a la que la Bruma arrastra al gemelo (m/s) y cuánto tarda en desvanecerse (s). */
const TAKEN_SPEED = 1.1;
const TAKEN_FADE = 5;
/** Criaturas de la Bruma en la intro. */
const CREATURES: readonly { kind: EnemyKind; x: number; z: number }[] = [
  { kind: 'coloso', x: 3, z: 1.5 },
  { kind: 'brumilla', x: -3, z: -0.5 },
  { kind: 'brumilla', x: 4, z: -1 },
  { kind: 'tirador', x: -5.5, z: 3 },
];

/**
 * La intro: una serie de planos fijos. La cámara no se mueve nunca durante un plano; solo cambia de uno
 * a otro cuando el jugador avanza el texto. Se anima a los personajes, no a la cámara.
 */
export class IntroDirector {
  private readonly sibling: CharacterView;
  private readonly creatures: ActorView[] = [];
  private shot: IntroShot = INTRO_SHOTS[0] as IntroShot;
  private time = 0;
  private ashDebt = 0;

  constructor(
    scene: Scene,
    private readonly zone: ZoneData,
    private readonly hero: CharacterView,
    private readonly camera: ThirdPersonCamera,
    private readonly encounterView: EncounterView,
    assets: SessionAssets,
    materials: ToonMaterials,
    shadows: ShadowGenerator,
    characterId: CharacterId,
  ) {
    const siblingId = CHARACTERS[characterId].siblingId;
    this.sibling = new CharacterView(
      scene,
      CHARACTERS[siblingId],
      assets.characters[siblingId],
      assets.blade,
      materials,
      shadows,
    );
    this.sibling.setBladeVisible(false);
    for (const c of CREATURES) {
      const yaw = Math.atan2(-c.x, -6 - c.z);
      const actor = createActor(
        scene,
        assets.enemies[c.kind],
        c.kind,
        materials,
        shadows,
        c.x,
        groundHeight(zone, c.x, c.z),
        c.z,
        yaw,
      );
      this.creatures.push(actor);
    }
    this.show(0);
  }

  /** Pasa a un plano: un corte limpio, sin movimiento de cámara. */
  show(index: number): void {
    const shot = INTRO_SHOTS[index];
    if (!shot) return;
    this.shot = shot;
    this.time = 0;
    const c = shot.camera;
    this.camera.setShake(0, 0);
    this.camera.apply({ x: c.x, y: c.y, z: c.z, targetX: c.tx, targetY: c.ty, targetZ: c.tz });
    for (const creature of this.creatures) creature.placed.pivot.setEnabled(shot.creatures);
    this.sibling.root.setEnabled(shot.sibling !== null);
    this.sibling.setVisibility(1);
  }

  update(dt: number, reduceMotion: boolean): void {
    const shot = this.shot;
    this.time += dt;
    const groundY = (x: number, z: number): number => groundHeight(this.zone, x, z);

    const hero = this.hero.root;
    hero.position.set(shot.player.x, groundY(shot.player.x, shot.player.z), shot.player.z);
    hero.rotation.y = shot.player.yaw;
    this.hero.update(
      {
        speed: 0,
        dodge: 0,
        attack: null,
        hurt: Number.POSITIVE_INFINITY,
        // Tumbado del todo: la animación de caer termina enseguida.
        dead: shot.playerDown ? this.time + 10 : null,
        reduceMotion,
      },
      dt,
    );

    if (shot.sibling) {
      const s = shot.sibling;
      const moved = shot.siblingTaken ? Math.min(this.time * TAKEN_SPEED, 6) : 0;
      const z = s.z + moved;
      this.sibling.root.position.set(s.x, groundY(s.x, z), z);
      this.sibling.root.rotation.y = s.yaw;
      this.sibling.update(
        {
          speed: 0,
          dodge: 0,
          attack: null,
          hurt: shot.siblingTaken ? Math.min(this.time, 0.15) : Number.POSITIVE_INFINITY,
          dead: null,
          reduceMotion,
        },
        dt,
      );
      if (shot.siblingTaken) this.sibling.setVisibility(Math.max(0.05, 1 - this.time / TAKEN_FADE));
    }

    if (shot.creatures) for (const creature of this.creatures) creature.update(dt);

    // Ceniza alrededor de la escena; con "Reducir movimiento", mucha menos.
    this.ashDebt += shot.ash * dt * (reduceMotion ? 0.3 : 1);
    const n = Math.floor(this.ashDebt);
    if (n > 0) {
      this.ashDebt -= n;
      this.encounterView.mist(0, -2, n, 9, 3);
    }
    this.encounterView.updateAsh(dt);
  }

  dispose(): void {
    this.sibling.dispose();
    for (const creature of this.creatures) creature.dispose();
    this.creatures.length = 0;
  }
}
