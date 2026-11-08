import { ITEM_BALANCE, type SpecialId } from '../data/items';
import type { Progress } from './progress';

/** Artículos de la tienda del mercader. */
export type ShopItemId = 'potion' | 'temple' | SpecialId;
export const SHOP_ITEMS: readonly ShopItemId[] = ['potion', 'temple', 'talisman'];

export type BuyFailure = 'sparks' | 'limit' | 'soldOut';
export type BuyResult = { readonly ok: true } | { readonly ok: false; readonly reason: BuyFailure };

/** Estado de un artículo en este momento. `price` es null si ya no se vende. */
export interface ShopOffer {
  readonly id: ShopItemId;
  readonly price: number | null;
  readonly available: boolean;
  readonly reason: BuyFailure | null;
}

/** Precio actual de un artículo (la siguiente mejora cuesta más); null si ya no se puede comprar. */
export function priceOf(progress: Progress, id: ShopItemId): number | null {
  switch (id) {
    case 'potion':
      return ITEM_BALANCE.potion.price;
    case 'temple': {
      const { prices, minLevel, maxLevel } = ITEM_BALANCE.temple;
      if (progress.temple >= maxLevel) return null;
      return prices[progress.temple - minLevel] ?? null;
    }
    case 'talisman':
      return progress.specials.includes('talisman') ? null : ITEM_BALANCE.talisman.price;
  }
}

/** Calcula si se puede comprar y, si no, por qué. */
export function offerFor(progress: Progress, id: ShopItemId): ShopOffer {
  const price = priceOf(progress, id);
  let reason: BuyFailure | null = null;
  if (price === null) reason = 'soldOut';
  else if (id === 'potion' && progress.potions >= ITEM_BALANCE.potion.maxCarried) reason = 'limit';
  else if (progress.sparks < price) reason = 'sparks';
  return { id, price, available: reason === null, reason };
}

/** Compra un artículo. Si falla, no cambia nada. */
export function buy(progress: Progress, id: ShopItemId): BuyResult {
  const offer = offerFor(progress, id);
  if (!offer.available || offer.price === null) return { ok: false, reason: offer.reason ?? 'soldOut' };
  progress.sparks -= offer.price;
  switch (id) {
    case 'potion':
      progress.potions++;
      break;
    case 'temple':
      progress.temple++;
      break;
    case 'talisman':
      progress.specials.push(id);
      break;
  }
  return { ok: true };
}

/** Vende una poción a la tienda. Es lo único que se vende. Devuelve false si no hay ninguna. */
export function sellPotion(progress: Progress): boolean {
  if (progress.potions <= 0) return false;
  progress.potions--;
  progress.sparks = Math.min(ITEM_BALANCE.maxSparks, progress.sparks + ITEM_BALANCE.potion.sellPrice);
  return true;
}
