import { describe, expect, it } from 'vitest';
import { SystemRegistry } from '../src/core/systems';
import { InputState, actionForCode } from '../src/core/inputState';
import { EventBus } from '../src/core/events';
import { approach, clamp, damp, lerpAngle, wrapAngle } from '../src/core/math';
import { KEY_BINDINGS } from '../src/data/controls';

describe('SystemRegistry', () => {
  it('ejecuta los sistemas en su orden, no en el de registro', () => {
    const registry = new SystemRegistry();
    const calls: string[] = [];
    registry.register({ name: 'b', order: 20, fixedUpdate: () => calls.push('b') });
    registry.register({ name: 'a', order: 10, fixedUpdate: () => calls.push('a') });
    registry.register({ name: 'c', order: 30, frameUpdate: () => calls.push('c') });
    registry.fixedUpdate(1 / 60);
    registry.frameUpdate(1 / 60, 0.5);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(registry.names()).toEqual(['a', 'b', 'c']);
  });

  it('rechaza nombres duplicados y permite quitar sistemas', () => {
    const registry = new SystemRegistry();
    registry.register({ name: 'a', order: 1 });
    expect(() => registry.register({ name: 'a', order: 2 })).toThrow();
    registry.unregister('a');
    expect(registry.names()).toEqual([]);
  });
});

describe('InputState', () => {
  it('traduce códigos a acciones y nunca usa Ctrl ni Tab', () => {
    expect(actionForCode('KeyW')).toBe('forward');
    expect(actionForCode('Space')).toBe('dodge');
    expect(actionForCode('Tab')).toBeNull();
    const all = Object.values(KEY_BINDINGS).flat();
    expect(all.some((c) => c === 'Tab' || c.startsWith('Control'))).toBe(false);
  });

  it('una pulsación se lee una sola vez y las repeticiones no cuentan', () => {
    const input = new InputState();
    input.keyDown('Space');
    expect(input.takePressed('dodge')).toBe(true);
    expect(input.takePressed('dodge')).toBe(false);
    input.keyDown('Space', true);
    expect(input.takePressed('dodge')).toBe(false);
    expect(input.isDown('dodge')).toBe(true);
  });

  it('un toque corto entre dos pasos no se pierde', () => {
    const input = new InputState();
    input.keyDown('KeyJ');
    input.keyUp('KeyJ');
    expect(input.isDown('attack')).toBe(false);
    expect(input.takePressed('attack')).toBe(true);
  });

  it('calcula el eje de movimiento y anula direcciones opuestas', () => {
    const input = new InputState();
    input.keyDown('KeyW');
    input.keyDown('KeyD');
    expect(input.moveAxis()).toEqual({ x: 1, z: 1 });
    input.keyDown('KeyS');
    expect(input.moveAxis()).toEqual({ x: 1, z: 0 });
  });

  it('acumula el ratón, lo vacía al leer y descarta valores no finitos', () => {
    const input = new InputState();
    input.addMouseDelta(3, -2);
    input.addMouseDelta(1, 1);
    input.addMouseDelta(Number.NaN, 5);
    expect(input.takeMouseDelta()).toEqual({ x: 4, y: -1 });
    expect(input.takeMouseDelta()).toEqual({ x: 0, y: 0 });
  });

  it('clear suelta todas las teclas (al perder el foco)', () => {
    const input = new InputState();
    input.keyDown('KeyW');
    input.setForced('attack', true);
    input.clear();
    expect(input.isDown('forward')).toBe(false);
    expect(input.isDown('attack')).toBe(false);
    expect(input.takePressed('forward')).toBe(false);
  });
});

describe('EventBus', () => {
  it('entrega eventos y permite darse de baja', () => {
    const bus = new EventBus<{ hit: number }>();
    const got: number[] = [];
    const off = bus.on('hit', (n) => got.push(n));
    bus.emit('hit', 1);
    off();
    bus.emit('hit', 2);
    expect(got).toEqual([1]);
  });
});

describe('math', () => {
  it('clamp, approach y damp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(approach(0, 10, 3)).toBe(3);
    expect(approach(9, 10, 3)).toBe(10);
    expect(approach(10, 0, 4)).toBe(6);
    expect(damp(0, 10, 1000, 1)).toBeCloseTo(10, 5);
    expect(damp(0, 10, 5, 0)).toBe(0);
  });

  it('wrapAngle y lerpAngle toman el camino más corto', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 6);
    const a = Math.PI - 0.1;
    const b = -Math.PI + 0.1;
    expect(Math.abs(wrapAngle(lerpAngle(a, b, 0.5)))).toBeCloseTo(Math.PI, 6);
  });
});
