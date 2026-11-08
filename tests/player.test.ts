import { describe, expect, it } from 'vitest';
import { cameraRelativeDirection, createPlayer, updatePlayer, type PlayerIntent } from '../src/game/player';
import {
  createDodge,
  dodgeProgress,
  dodgeSpeed,
  isInvulnerable,
  startDodge,
  updateDodge,
} from '../src/game/dodge';
import { DODGE_BALANCE, PLAYER_BALANCE } from '../src/data/balance';

const DT = 1 / 60;
const IDLE: PlayerIntent = { moveX: 0, moveZ: 0, walk: false, dodge: false };
const FORWARD: PlayerIntent = { moveX: 0, moveZ: 1, walk: false, dodge: false };

function run(steps: number, fn: () => void): void {
  for (let i = 0; i < steps; i++) fn();
}

describe('cameraRelativeDirection', () => {
  it('adelante sigue a la cámara', () => {
    const d0 = cameraRelativeDirection(0, 1, 0);
    expect(d0.x).toBeCloseTo(0, 6);
    expect(d0.z).toBeCloseTo(1, 6);
    const d90 = cameraRelativeDirection(0, 1, Math.PI / 2);
    expect(d90.x).toBeCloseTo(1, 6);
    expect(d90.z).toBeCloseTo(0, 6);
  });

  it('derecha es perpendicular a adelante', () => {
    const r = cameraRelativeDirection(1, 0, 0);
    expect(r.x).toBeCloseTo(1, 6);
    expect(r.z).toBeCloseTo(0, 6);
  });

  it('la diagonal no es más rápida y sin entrada no hay dirección', () => {
    const d = cameraRelativeDirection(1, 1, 0.3);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 6);
    expect(cameraRelativeDirection(0, 0, 1)).toEqual({ x: 0, z: 0 });
  });
});

describe('updatePlayer', () => {
  it('acelera hasta la velocidad de carrera y gira hacia donde se mueve', () => {
    const p = createPlayer(0, 0, Math.PI);
    run(60, () => updatePlayer(p, FORWARD, 0, DT, []));
    expect(p.speed).toBeCloseTo(PLAYER_BALANCE.runSpeed, 3);
    expect(p.z).toBeGreaterThan(4);
    expect(Math.abs(p.yaw)).toBeLessThan(0.01);
  });

  it('con Mayús camina más despacio', () => {
    const p = createPlayer(0, 0, 0);
    run(60, () => updatePlayer(p, { ...FORWARD, walk: true }, 0, DT, []));
    expect(p.speed).toBeCloseTo(PLAYER_BALANCE.walkSpeed, 3);
  });

  it('frena al soltar las teclas', () => {
    const p = createPlayer(0, 0, 0);
    run(30, () => updatePlayer(p, FORWARD, 0, DT, []));
    run(30, () => updatePlayer(p, IDLE, 0, DT, []));
    expect(p.speed).toBe(0);
  });

  it('guarda la posición anterior para interpolar', () => {
    const p = createPlayer(0, 0, 0);
    run(10, () => updatePlayer(p, FORWARD, 0, DT, []));
    const before = p.z;
    updatePlayer(p, FORWARD, 0, DT, []);
    expect(p.prevZ).toBe(before);
  });

  it('la esquiva sin dirección va hacia donde mira el personaje', () => {
    const p = createPlayer(0, 0, Math.PI / 2);
    updatePlayer(p, { ...IDLE, dodge: true }, 0, DT, []);
    expect(p.dodge.phase).toBe('dodging');
    run(30, () => updatePlayer(p, IDLE, 0, DT, []));
    expect(p.x).toBeGreaterThan(2);
    expect(Math.abs(p.z)).toBeLessThan(0.01);
  });

  it('el multiplicador de movimiento del combate reduce la velocidad', () => {
    const p = createPlayer(0, 0, 0);
    run(60, () => updatePlayer(p, FORWARD, 0, DT, [], { moveFactor: 0.25, lunge: 0, canTurn: true }));
    expect(p.speed).toBeCloseTo(PLAYER_BALANCE.runSpeed * 0.25, 3);
  });
});

describe('dodge', () => {
  it('no empieza sin dirección ni dos veces seguidas', () => {
    const d = createDodge();
    expect(startDodge(d, 0, 0)).toBe(false);
    expect(startDodge(d, 1, 0)).toBe(true);
    expect(startDodge(d, 1, 0)).toBe(false);
  });

  it('normaliza la dirección', () => {
    const d = createDodge();
    startDodge(d, 3, 4);
    expect(Math.hypot(d.dirX, d.dirZ)).toBeCloseTo(1, 6);
  });

  it('la invulnerabilidad dura solo su ventana', () => {
    const d = createDodge();
    startDodge(d, 0, 1);
    expect(isInvulnerable(d)).toBe(false);
    updateDodge(d, DODGE_BALANCE.invulnerableFrom + 0.001);
    expect(isInvulnerable(d)).toBe(true);
    updateDodge(d, DODGE_BALANCE.invulnerableTo - DODGE_BALANCE.invulnerableFrom);
    expect(isInvulnerable(d)).toBe(false);
  });

  it('pasa por esquiva, espera y vuelve a estar lista', () => {
    const d = createDodge();
    startDodge(d, 0, 1);
    updateDodge(d, DODGE_BALANCE.duration + 0.001);
    expect(d.phase).toBe('cooldown');
    expect(startDodge(d, 0, 1)).toBe(false);
    updateDodge(d, DODGE_BALANCE.cooldown);
    expect(d.phase).toBe('ready');
    expect(startDodge(d, 0, 1)).toBe(true);
  });

  it('la velocidad baja de inicio a fin y vale 0 fuera de la esquiva', () => {
    const d = createDodge();
    expect(dodgeSpeed(d)).toBe(0);
    startDodge(d, 0, 1);
    const first = dodgeSpeed(d);
    updateDodge(d, DODGE_BALANCE.duration * 0.9);
    expect(dodgeSpeed(d)).toBeLessThan(first);
    expect(first).toBeCloseTo(DODGE_BALANCE.startSpeed, 6);
    expect(dodgeProgress(d)).toBeCloseTo(0.9, 6);
  });
});
