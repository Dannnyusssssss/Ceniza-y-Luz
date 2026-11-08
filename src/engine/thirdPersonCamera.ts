import type { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Camera } from '@babylonjs/core/Cameras/camera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { degToRad } from '../core/math';
import type { CameraPose } from '../world/cameraRig';

/**
 * Cámara del juego. No tiene controles propios de Babylon: su posición la decide solo
 * `world/cameraRig.ts` a partir de lo que hace el jugador.
 */
export class ThirdPersonCamera {
  readonly camera: FreeCamera;
  private readonly target = new Vector3();
  private shakeX = 0;
  private shakeY = 0;

  constructor(scene: Scene, fovDegrees: number) {
    this.camera = new FreeCamera('playerCamera', new Vector3(0, 3, -6), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.1;
    this.camera.maxZ = 500;
    this.camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;
    this.setFov(fovDegrees);
    scene.activeCamera = this.camera;
  }

  setFov(fovDegrees: number): void {
    this.camera.fov = degToRad(fovDegrees);
  }

  /** Desplazamiento temporal de la sacudida de golpe (0 si "Reducir movimiento" está activo). */
  setShake(x: number, y: number): void {
    this.shakeX = x;
    this.shakeY = y;
  }

  apply(pose: CameraPose): void {
    this.camera.position.set(pose.x + this.shakeX, pose.y + this.shakeY, pose.z);
    this.target.set(pose.targetX + this.shakeX, pose.targetY + this.shakeY, pose.targetZ);
    this.camera.setTarget(this.target);
  }
}
