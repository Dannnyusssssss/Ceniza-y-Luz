import { describe, expect, it } from 'vitest';
import { moveCircle, raycastBlocks, resolveCircle } from '../src/world/collision';
import type { BlockData } from '../src/data/arena';
import { ARENA } from '../src/data/arena';

const wall: BlockData = { x: 0, z: 5, halfX: 5, halfZ: 0.5, height: 2, kind: 'wall' };
const R = 0.4;

describe('resolveCircle', () => {
  it('no toca nada si está lejos', () => {
    const p = { x: 0, z: 0 };
    expect(resolveCircle(p, R, [wall])).toBe(false);
    expect(p).toEqual({ x: 0, z: 0 });
  });

  it('empuja fuera de la pared por el lado más cercano', () => {
    const p = { x: 0, z: 4.3 };
    expect(resolveCircle(p, R, [wall])).toBe(true);
    expect(p.z).toBeCloseTo(4.5 - R, 6);
  });

  it('saca el centro si quedó dentro del bloque', () => {
    const p = { x: 4.9, z: 5 };
    resolveCircle(p, R, [wall]);
    expect(p.x).toBeCloseTo(5 + R, 6);
  });
});

describe('moveCircle', () => {
  it('la pared detiene al jugador', () => {
    const p = { x: 0, z: 3 };
    for (let i = 0; i < 60; i++) moveCircle(p, 0, 0.1, R, [wall]);
    expect(p.z).toBeCloseTo(4.5 - R, 5);
  });

  it('desliza por la pared al moverse en diagonal', () => {
    const p = { x: 0, z: 4.0 };
    for (let i = 0; i < 20; i++) moveCircle(p, 0.1, 0.1, R, [wall]);
    expect(p.z).toBeCloseTo(4.5 - R, 5);
    expect(p.x).toBeCloseTo(2, 5);
  });

  it('un movimiento rápido no atraviesa un muro delgado', () => {
    const thin: BlockData = { x: 0, z: 2, halfX: 5, halfZ: 0.1, height: 2, kind: 'wall' };
    const p = { x: 0, z: 0 };
    moveCircle(p, 0, 5, R, [thin]);
    expect(p.z).toBeLessThan(2);
  });

  it('en una esquina en L no queda atrapado: puede salir', () => {
    const a: BlockData = { x: 0, z: 2, halfX: 2, halfZ: 0.5, height: 2, kind: 'ruin' };
    const b: BlockData = { x: 1.5, z: 0, halfX: 0.5, halfZ: 2, height: 2, kind: 'ruin' };
    const p = { x: 0.5, z: 1 };
    // Empuja contra la esquina un buen rato.
    for (let i = 0; i < 60; i++) moveCircle(p, 0.1, 0.1, R, [a, b]);
    const stuck = { ...p };
    // Y luego intenta salir en dirección contraria.
    for (let i = 0; i < 20; i++) moveCircle(p, -0.1, -0.1, R, [a, b]);
    expect(p.x).toBeLessThan(stuck.x - 1);
    expect(p.z).toBeLessThan(stuck.z - 1);
  });

  it('con los bloques reales de la arena el jugador no sale del muro perimetral', () => {
    const p = { x: 0, z: 0 };
    for (let i = 0; i < 400; i++) moveCircle(p, 0.15, 0.2, R, ARENA.blocks);
    expect(Math.abs(p.x)).toBeLessThan(ARENA.halfSize);
    expect(Math.abs(p.z)).toBeLessThan(ARENA.halfSize);
  });
});

describe('raycastBlocks', () => {
  it('devuelve la distancia al primer bloque', () => {
    const d = raycastBlocks({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, 20, [wall]);
    expect(d).toBeCloseTo(4.5, 6);
  });

  it('devuelve la distancia máxima si no hay nada', () => {
    expect(raycastBlocks({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 7, [wall])).toBe(7);
  });

  it('pasa por encima de un muro bajo', () => {
    const d = raycastBlocks({ x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 1 }, 20, [wall]);
    expect(d).toBe(20);
  });
});
