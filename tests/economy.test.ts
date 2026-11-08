import { describe, expect, it } from 'vitest';
import { HEALTH_BALANCE } from '../src/data/balance';
import { ITEM_BALANCE } from '../src/data/items';
import { STORY_ZONES, ZONES } from '../src/data/zones';
import { buy, offerFor, priceOf, sellPotion } from '../src/game/economy';
import { createHealth, hurtPlayer } from '../src/game/health';
import { addSparks, findChest, grant, openChest, usePotion } from '../src/game/inventory';
import { createProgress, dodgeCooldownFactor, maxHearts, templeFactor } from '../src/game/progress';

describe('tienda', () => {
  it('comprar resta chispas y da el objeto', () => {
    const p = createProgress('alba');
    p.sparks = 100;
    expect(buy(p, 'potion')).toEqual({ ok: true });
    expect(p.sparks).toBe(100 - ITEM_BALANCE.potion.price);
    expect(p.potions).toBe(1);
  });

  it('sin chispas no compra y no cambia nada', () => {
    const p = createProgress('alba');
    p.sparks = ITEM_BALANCE.potion.price - 1;
    expect(buy(p, 'potion')).toEqual({ ok: false, reason: 'sparks' });
    expect(p.potions).toBe(0);
    expect(p.sparks).toBe(ITEM_BALANCE.potion.price - 1);
  });

  it('con el precio exacto sí se puede comprar', () => {
    const p = createProgress('alba');
    p.sparks = ITEM_BALANCE.potion.price;
    expect(buy(p, 'potion').ok).toBe(true);
    expect(p.sparks).toBe(0);
  });

  it('no se pueden llevar más pociones del límite', () => {
    const p = createProgress('alba');
    p.sparks = 9999;
    p.potions = ITEM_BALANCE.potion.maxCarried;
    expect(buy(p, 'potion')).toEqual({ ok: false, reason: 'limit' });
    expect(p.potions).toBe(ITEM_BALANCE.potion.maxCarried);
  });

  it('cada mejora de temple cuesta más y al máximo se agota', () => {
    const p = createProgress('alba');
    p.sparks = 9999;
    let last = 0;
    for (let level = ITEM_BALANCE.temple.minLevel; level < ITEM_BALANCE.temple.maxLevel; level++) {
      const price = priceOf(p, 'temple') ?? 0;
      expect(price).toBeGreaterThan(last);
      last = price;
      expect(buy(p, 'temple').ok).toBe(true);
    }
    expect(p.temple).toBe(ITEM_BALANCE.temple.maxLevel);
    expect(priceOf(p, 'temple')).toBeNull();
    expect(buy(p, 'temple')).toEqual({ ok: false, reason: 'soldOut' });
  });

  it('el talismán se compra una sola vez y acorta la espera de la esquiva', () => {
    const p = createProgress('alba');
    p.sparks = 999;
    expect(dodgeCooldownFactor(p)).toBe(1);
    expect(buy(p, 'talisman').ok).toBe(true);
    expect(dodgeCooldownFactor(p)).toBe(ITEM_BALANCE.talisman.dodgeCooldownFactor);
    expect(offerFor(p, 'talisman').reason).toBe('soldOut');
    expect(buy(p, 'talisman').ok).toBe(false);
    expect(p.specials).toEqual(['talisman']);
  });

  it('vender una poción da la mitad; sin pociones no se puede', () => {
    const p = createProgress('alba');
    expect(sellPotion(p)).toBe(false);
    p.potions = 1;
    expect(sellPotion(p)).toBe(true);
    expect(p.potions).toBe(0);
    expect(p.sparks).toBe(ITEM_BALANCE.potion.sellPrice);
    expect(ITEM_BALANCE.potion.sellPrice).toBe(ITEM_BALANCE.potion.price / 2);
  });
});

describe('cofres', () => {
  it('los identificadores de los datos se encuentran; uno inventado no', () => {
    for (const id of STORY_ZONES) for (const c of ZONES[id].chests) expect(findChest(c.id)).toBe(c);
    expect(findChest('no-existe')).toBeNull();
    const p = createProgress('alba');
    expect(openChest(p, 'no-existe')).toBeNull();
    expect(p.chests).toEqual([]);
  });

  it('un cofre solo se abre una vez', () => {
    const p = createProgress('alba');
    const first = openChest(p, 'lumbre-huerto');
    expect(first?.contents.kind).toBe('sparks');
    const sparks = p.sparks;
    expect(sparks).toBeGreaterThan(0);
    expect(openChest(p, 'lumbre-huerto')).toBeNull();
    expect(p.sparks).toBe(sparks);
  });

  it('el temple sube hasta el máximo y después se convierte en chispas', () => {
    const p = createProgress('alba');
    grant(p, { kind: 'temple' });
    expect(p.temple).toBe(2);
    p.temple = ITEM_BALANCE.temple.maxLevel;
    const result = grant(p, { kind: 'temple' });
    expect(result.overflow).toBe(true);
    expect(p.temple).toBe(ITEM_BALANCE.temple.maxLevel);
    expect(p.sparks).toBeGreaterThan(0);
  });

  it('cuatro fragmentos dan un corazón', () => {
    const p = createProgress('alba');
    const start = maxHearts(p);
    for (let i = 0; i < 3; i++) expect(grant(p, { kind: 'fragment' }).heartGained).toBe(false);
    expect(maxHearts(p)).toBe(start);
    expect(grant(p, { kind: 'fragment' }).heartGained).toBe(true);
    expect(maxHearts(p)).toBe(start + 1);
    expect(start).toBe(HEALTH_BALANCE.startHearts);
  });

  it('las pociones que no caben se pagan en chispas', () => {
    const p = createProgress('alba');
    p.potions = ITEM_BALANCE.potion.maxCarried - 1;
    const result = grant(p, { kind: 'potion', amount: 2 });
    expect(p.potions).toBe(ITEM_BALANCE.potion.maxCarried);
    expect(result.overflow).toBe(true);
    expect(p.sparks).toBe(ITEM_BALANCE.potion.sellPrice);
  });

  it('la llave no se duplica', () => {
    const p = createProgress('alba');
    grant(p, { kind: 'key', key: 'llave-claro' });
    grant(p, { kind: 'key', key: 'llave-claro' });
    expect(p.keys).toEqual(['llave-claro']);
  });
});

describe('chispas y mejoras', () => {
  it('las chispas no pasan del límite ni bajan de cero', () => {
    const p = createProgress('alba');
    addSparks(p, ITEM_BALANCE.maxSparks + 50);
    expect(p.sparks).toBe(ITEM_BALANCE.maxSparks);
    addSparks(p, -ITEM_BALANCE.maxSparks * 2);
    expect(p.sparks).toBe(0);
  });

  it('el temple multiplica el daño y se limita a sus niveles', () => {
    expect(templeFactor(1)).toBe(1);
    expect(templeFactor(5)).toBe(2);
    expect(templeFactor(99)).toBe(2);
    expect(templeFactor(-1)).toBe(1);
  });
});

describe('pociones', () => {
  it('curan y se gastan; con la vida llena no se gastan', () => {
    const p = createProgress('alba');
    p.potions = 1;
    const health = createHealth();
    expect(usePotion(p, health)).toBe(false);
    expect(p.potions).toBe(1);
    hurtPlayer(health, { x: 0, z: 0 }, 10, { fromX: 1, fromZ: 0 }, { dodging: false, setting: 'normal' });
    const before = health.quarters;
    expect(usePotion(p, health)).toBe(true);
    expect(health.quarters).toBe(before + ITEM_BALANCE.potion.healQuarters);
    expect(p.potions).toBe(0);
    expect(usePotion(p, health)).toBe(false);
  });

  it('no sirven si el jugador ya cayó', () => {
    const p = createProgress('alba');
    p.potions = 1;
    const health = createHealth(1);
    hurtPlayer(health, { x: 0, z: 0 }, 99, { fromX: 1, fromZ: 0 }, { dodging: false, setting: 'normal' });
    expect(usePotion(p, health)).toBe(false);
    expect(p.potions).toBe(1);
  });
});
