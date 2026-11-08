import { describe, expect, it } from 'vitest';
import {
  cancelCombo,
  comboModifiers,
  createCombo,
  inHitWindow,
  isAttacking,
  isInArc,
  updateCombo,
} from '../src/game/combat';
import { createDummy, hitDummy, isDefeated, updateDummy } from '../src/game/dummy';
import { FlashLimiter, flashIntensity, shakeOffset } from '../src/game/feedback';
import { COMBO_BALANCE, DUMMY_BALANCE, FEEDBACK_BALANCE, PLAYER_BALANCE } from '../src/data/balance';

const DT = 1 / 60;
const [S0, S1, S2] = COMBO_BALANCE.steps;

function advance(state: ReturnType<typeof createCombo>, seconds: number, press = false): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) updateCombo(state, press && i === 0, DT);
}

describe('combo', () => {
  it('empieza con una pulsación', () => {
    const c = createCombo();
    expect(updateCombo(c, true, DT)).toBe(0);
    expect(isAttacking(c)).toBe(true);
  });

  it('sin más pulsaciones vuelve a reposo al acabar el golpe', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    advance(c, (S0?.duration ?? 0) + 0.05);
    expect(isAttacking(c)).toBe(false);
  });

  it('encadena los 3 golpes y no pasa del tercero', () => {
    const c = createCombo();
    const started: number[] = [];
    for (let i = 0; i < 200; i++) {
      const s = updateCombo(c, i % 6 === 0, DT);
      if (s !== null) started.push(s);
    }
    expect(started.slice(0, 3)).toEqual([0, 1, 2]);
    expect(Math.max(...started)).toBe(2);
  });

  it('el siguiente golpe espera a que termine la ventana de daño del actual', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    updateCombo(c, true, DT);
    let t = DT;
    while (c.step === 0) {
      updateCombo(c, false, DT);
      t += DT;
    }
    expect(t).toBeGreaterThanOrEqual((S0?.hitTo ?? 0) - 1e-9);
  });

  it('una pulsación demasiado temprana caduca (buffer)', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    updateCombo(c, true, DT);
    // Si el buffer fuera más corto que la espera, el combo no encadenaría; con los datos actuales sí encadena.
    advance(c, S0?.hitTo ?? 0);
    expect(c.step).toBe(1);
    const late = createCombo();
    updateCombo(late, true, DT);
    advance(late, (S0?.duration ?? 0) + COMBO_BALANCE.inputBuffer);
    expect(late.step).toBe(-1);
  });

  it('cada golpe tiene su identificador', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    const first = c.swingId;
    updateCombo(c, true, DT);
    advance(c, S0?.hitTo ?? 0);
    expect(c.swingId).toBe(first + 1);
  });

  it('tras el tercer golpe hay una pausa antes de otro combo', () => {
    const c = createCombo();
    for (let i = 0; i < 300 && c.step !== 2; i++) updateCombo(c, true, DT);
    expect(c.step).toBe(2);
    advance(c, (S2?.duration ?? 0) + DT);
    expect(c.recovery).toBeGreaterThan(0);
    expect(updateCombo(c, true, DT)).toBeNull();
    advance(c, COMBO_BALANCE.recovery + DT);
    expect(updateCombo(c, true, DT)).toBe(0);
  });

  it('la ventana de daño respeta los datos', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    expect(inHitWindow(c)).toBe(false);
    advance(c, (S0?.hitFrom ?? 0) + 0.01);
    expect(inHitWindow(c)).toBe(true);
    advance(c, (S0?.hitTo ?? 0) - (S0?.hitFrom ?? 0));
    expect(inHitWindow(c)).toBe(false);
  });

  it('cancelar corta el combo (al esquivar)', () => {
    const c = createCombo();
    updateCombo(c, true, DT);
    cancelCombo(c);
    expect(isAttacking(c)).toBe(false);
  });

  it('modificadores: más lento al atacar, impulso solo en la ventana y giro solo al preparar', () => {
    const c = createCombo();
    expect(comboModifiers(c)).toEqual({ moveFactor: 1, lunge: 0, canTurn: true });
    updateCombo(c, true, DT);
    expect(comboModifiers(c).moveFactor).toBe(PLAYER_BALANCE.attackMoveFactor);
    expect(comboModifiers(c).canTurn).toBe(true);
    advance(c, (S0?.hitFrom ?? 0) + 0.01);
    expect(comboModifiers(c).lunge).toBe(S0?.lunge);
    expect(comboModifiers(c).canTurn).toBe(false);
    expect(S1).toBeDefined();
  });
});

describe('isInArc', () => {
  it('acierta delante y falla detrás o lejos', () => {
    expect(isInArc(0, 0, 0, 0, 1.5, 0.5, 1.9, 1.1)).toBe(true);
    expect(isInArc(0, 0, 0, 0, -1.5, 0.5, 1.9, 1.1)).toBe(false);
    expect(isInArc(0, 0, 0, 0, 5, 0.5, 1.9, 1.1)).toBe(false);
  });

  it('respeta el ángulo del arco y el radio del objetivo', () => {
    expect(isInArc(0, 0, 0, 1.5, 0.2, 0.1, 2, 0.5)).toBe(false);
    expect(isInArc(0, 0, Math.PI / 2, 1.5, 0.2, 0.1, 2, 0.5)).toBe(true);
    expect(isInArc(0, 0, 0, 0.1, 0.1, 0.5, 2, 0.1)).toBe(true);
  });
});

describe('muñeco', () => {
  it('recibe daño una sola vez por golpe', () => {
    const d = createDummy(0, 0);
    expect(hitDummy(d, 10, 1)).toBe(10);
    expect(hitDummy(d, 10, 1)).toBe(0);
    expect(hitDummy(d, 10, 2)).toBe(10);
    expect(d.health).toBe(DUMMY_BALANCE.maxHealth - 20);
  });

  it('al llegar a cero se desvanece, ignora golpes y reaparece con la vida llena', () => {
    const d = createDummy(0, 0);
    expect(hitDummy(d, 9999, 1)).toBe(DUMMY_BALANCE.maxHealth);
    expect(isDefeated(d)).toBe(true);
    expect(hitDummy(d, 10, 2)).toBe(0);
    updateDummy(d, DUMMY_BALANCE.resetDelay + 0.01);
    expect(isDefeated(d)).toBe(false);
    expect(d.health).toBe(DUMMY_BALANCE.maxHealth);
  });

  it('ignora daño no positivo o no numérico', () => {
    const d = createDummy(0, 0);
    expect(hitDummy(d, 0, 1)).toBe(0);
    expect(hitDummy(d, -5, 2)).toBe(0);
    expect(hitDummy(d, Number.NaN, 3)).toBe(0);
    expect(d.health).toBe(DUMMY_BALANCE.maxHealth);
  });
});

describe('FlashLimiter (fotosensibilidad)', () => {
  it('nunca permite más de 3 destellos en ningún segundo, aunque se pidan sin parar', () => {
    const limiter = new FlashLimiter(3);
    const allowed: number[] = [];
    for (let t = 0; t < 5; t += 1 / 60) if (limiter.tryFlash(t)) allowed.push(t);
    for (const start of allowed) {
      expect(allowed.filter((t) => t >= start && t < start + 1).length).toBeLessThanOrEqual(3);
    }
    expect(allowed.length).toBeGreaterThan(10);
  });

  it('separa los destellos al menos 1/3 de segundo', () => {
    const limiter = new FlashLimiter(3);
    expect(limiter.tryFlash(0)).toBe(true);
    expect(limiter.tryFlash(0.2)).toBe(false);
    expect(limiter.tryFlash(0.34)).toBe(true);
    expect(limiter.countInLastSecond(0.5)).toBe(2);
  });

  it('no acepta configuraciones inseguras', () => {
    expect(() => new FlashLimiter(4)).toThrow();
    expect(FEEDBACK_BALANCE.maxFlashesPerSecond).toBeLessThanOrEqual(3);
  });
});

describe('destello y sacudida', () => {
  it('el destello baja de forma suave y termina', () => {
    expect(flashIntensity(0)).toBe(1);
    expect(flashIntensity(FEEDBACK_BALANCE.flashDuration / 2)).toBeCloseTo(0.25, 6);
    expect(flashIntensity(FEEDBACK_BALANCE.flashDuration)).toBe(0);
    expect(flashIntensity(-1)).toBe(0);
  });

  it('"Reducir movimiento" anula la sacudida', () => {
    expect(shakeOffset(0.01, false)).toEqual({ x: 0, y: 0 });
    const s = shakeOffset(0.01, true);
    expect(Math.abs(s.x) + Math.abs(s.y)).toBeGreaterThan(0);
    expect(shakeOffset(FEEDBACK_BALANCE.shakeDuration, true)).toEqual({ x: 0, y: 0 });
  });
});
