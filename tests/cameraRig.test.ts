import { describe, expect, it } from 'vitest';
import { applyLook, createCameraRig, updateCameraPose, type LookSettings } from '../src/world/cameraRig';
import { CAMERA_BALANCE } from '../src/data/balance';
import type { BlockData } from '../src/data/arena';

const SETTINGS: LookSettings = { sensitivity: 1, invertY: false, mouseSpeed: 0.01, arrowSpeed: 2 };
const NO_LOOK = { mouseX: 0, mouseY: 0, arrowX: 0, arrowY: 0 };

describe('applyLook', () => {
  it('sin entrada la cámara no se mueve (nunca gira sola)', () => {
    const rig = createCameraRig(0.7);
    const before = { ...rig };
    for (let i = 0; i < 600; i++) applyLook(rig, NO_LOOK, SETTINGS, 1 / 60);
    expect(rig).toEqual(before);
  });

  it('el ratón gira según la sensibilidad', () => {
    const a = createCameraRig(0);
    const b = createCameraRig(0);
    applyLook(a, { ...NO_LOOK, mouseX: 10 }, SETTINGS, 1 / 60);
    applyLook(b, { ...NO_LOOK, mouseX: 10 }, { ...SETTINGS, sensitivity: 2 }, 1 / 60);
    expect(a.yaw).toBeCloseTo(0.1, 6);
    expect(b.yaw).toBeCloseTo(0.2, 6);
  });

  it('las flechas giran por tiempo, no por fotograma', () => {
    const rig = createCameraRig(0);
    for (let i = 0; i < 60; i++) applyLook(rig, { ...NO_LOOK, arrowX: 1 }, SETTINGS, 1 / 60);
    expect(rig.yaw).toBeCloseTo(2, 4);
  });

  it('invertir Y cambia el sentido vertical', () => {
    const a = createCameraRig(0);
    const b = createCameraRig(0);
    applyLook(a, { ...NO_LOOK, mouseY: 5 }, SETTINGS, 1 / 60);
    applyLook(b, { ...NO_LOOK, mouseY: 5 }, { ...SETTINGS, invertY: true }, 1 / 60);
    expect(a.pitch - CAMERA_BALANCE.initialPitch).toBeCloseTo(-(b.pitch - CAMERA_BALANCE.initialPitch), 6);
  });

  it('la inclinación queda dentro de sus límites', () => {
    const rig = createCameraRig(0);
    applyLook(rig, { ...NO_LOOK, mouseY: 100000 }, SETTINGS, 1 / 60);
    expect(rig.pitch).toBe(CAMERA_BALANCE.maxPitch);
    applyLook(rig, { ...NO_LOOK, mouseY: -100000 }, SETTINGS, 1 / 60);
    expect(rig.pitch).toBe(CAMERA_BALANCE.minPitch);
  });
});

describe('updateCameraPose', () => {
  it('sin obstáculos queda a la distancia normal, detrás del personaje', () => {
    const rig = createCameraRig(0);
    const pose = updateCameraPose(rig, 0, 0, [], 1 / 60);
    expect(rig.distance).toBeCloseTo(CAMERA_BALANCE.distance, 6);
    expect(pose.z).toBeLessThan(0);
    expect(pose.targetY).toBe(CAMERA_BALANCE.targetHeight);
  });

  it('se acerca de inmediato si hay una pared detrás y se aleja con suavidad al quitarla', () => {
    const wallBehind: BlockData = { x: 0, z: -3, halfX: 5, halfZ: 0.5, height: 6, kind: 'wall' };
    const rig = createCameraRig(0);
    updateCameraPose(rig, 0, 0, [wallBehind], 1 / 60);
    expect(rig.distance).toBeLessThan(3);
    const near = rig.distance;
    updateCameraPose(rig, 0, 0, [], 1 / 60);
    expect(rig.distance).toBeGreaterThan(near);
    expect(rig.distance).toBeLessThan(CAMERA_BALANCE.distance - 1);
  });

  it('el giro no cambia por seguir al personaje', () => {
    const rig = createCameraRig(1.2);
    for (let i = 0; i < 100; i++) updateCameraPose(rig, i * 0.1, i * 0.05, [], 1 / 60);
    expect(rig.yaw).toBe(1.2);
  });
});
