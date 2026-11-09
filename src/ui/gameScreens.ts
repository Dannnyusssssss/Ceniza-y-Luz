import { ITEM_BALANCE } from '../data/items';
import { TEXTS } from '../data/texts';
import { buy, offerFor, sellPotion, SHOP_ITEMS, type ShopItemId } from '../game/economy';
import { maxHearts, type Progress } from '../game/progress';
import { button, h } from './dom';

/** Lo que muestra una línea de diálogo. */
export interface DialogueView {
  readonly name: string;
  readonly text: string;
  readonly isLast: boolean;
  /** Muestra "Saltar" (la introducción). */
  readonly canSkip: boolean;
  onNext(): void;
  onSkip(): void;
}

/** Caja de diálogo abajo: el mundo sigue viéndose. Avanza solo cuando el jugador lo pide; nunca por tiempo. */
export function createDialogueBox(view: DialogueView): { root: HTMLElement; focus: HTMLElement } {
  const t = TEXTS.dialogue;
  const next = button(view.isLast ? t.close : t.next, () => view.onNext(), 'btn btn-primary');
  const buttons: HTMLElement[] = [next];
  if (view.canSkip) buttons.push(button(t.skip, () => view.onSkip(), 'btn btn-secondary'));
  const root = h('section', { className: 'dialogue', attrs: { role: 'dialog', 'aria-live': 'polite' } }, [
    view.name ? h('p', { className: 'dialogue-name', text: view.name }) : null,
    h('p', { className: `dialogue-text${view.name ? '' : ' is-narrator'}`, text: view.text }),
    h('div', { className: 'row dialogue-row' }, [
      ...buttons,
      h('span', { className: 'dialogue-hint', text: t.hint }),
    ]),
  ]);
  return { root, focus: next };
}

/** Créditos del final. Se cierran solo cuando el jugador quiere. */
export function createCreditsPanel(title: string, onClose: () => void): HTMLElement {
  const t = TEXTS.credits;
  return h(
    'section',
    { className: 'panel panel-wide credits', attrs: { 'aria-labelledby': 'credits-title' } },
    [
      h('h2', { className: 'title', text: t.title, attrs: { id: 'credits-title' } }),
      h('p', { className: 'subtitle', text: title }),
      h('p', { text: t.thanks }),
      h('p', { text: t.made }),
      h('p', { text: t.art }),
      h('p', { text: t.tech }),
      h('p', { className: 'hint', text: t.saved }),
      button(t.close, onClose, 'btn btn-primary'),
    ],
  );
}

/** Tienda del mercader. Cada compra vuelve a dibujar la lista con los precios y límites al día. */
export function createShopPanel(
  progress: Progress,
  onClose: () => void,
  onChange: (kind: 'buy' | 'sell') => void,
): { root: HTMLElement; focus: HTMLElement | null } {
  const t = TEXTS.shop;
  const status = h('p', { className: 'status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const sparks = h('p', { className: 'shop-sparks', text: t.sparks(progress.sparks) });
  const list = h('ul', { className: 'shop-list' });
  const sellRow = h('div', { className: 'row' });
  let firstBuy: HTMLElement | null = null;

  const render = (keepFocus: ShopItemId | 'sell' | null): void => {
    firstBuy = null;
    let toFocus: HTMLElement | null = null;
    sparks.textContent = t.sparks(progress.sparks);
    list.replaceChildren(
      ...SHOP_ITEMS.map((id) => {
        const offer = offerFor(progress, id);
        const info = t.items[id];
        const action = button(
          t.buy,
          () => {
            const result = buy(progress, id);
            if (result.ok) {
              status.textContent = t.bought(info.name);
              onChange('buy');
            } else {
              status.textContent = t.reasons[result.reason];
            }
            render(id);
          },
          'btn btn-primary',
        );
        action.disabled = !offer.available;
        action.setAttribute('aria-label', `${t.buy}: ${info.name}`);
        if (keepFocus === id) toFocus = action;
        firstBuy ??= action;
        return h('li', { className: 'shop-item' }, [
          h('div', { className: 'shop-info' }, [
            h('span', { className: 'shop-name', text: info.name }),
            h('span', { className: 'shop-text', text: info.text }),
          ]),
          h('span', {
            className: 'shop-price',
            text:
              offer.reason && offer.reason !== 'sparks' ? t.reasons[offer.reason] : t.price(offer.price ?? 0),
          }),
          action,
        ]);
      }),
    );
    const sell = button(
      progress.potions > 0 ? t.sell(ITEM_BALANCE.potion.sellPrice) : t.noSell,
      () => {
        if (sellPotion(progress)) {
          status.textContent = t.sold;
          onChange('sell');
        }
        render('sell');
      },
      'btn btn-secondary',
    );
    sell.disabled = progress.potions <= 0;
    if (keepFocus === 'sell') toFocus = sell;
    sellRow.replaceChildren(sell);
    // Un botón recién desactivado no puede conservar el foco: pasa al de salir.
    const target = toFocus as HTMLElement | null;
    if (target && !(target as HTMLButtonElement).disabled) target.focus();
    else if (keepFocus) closeButton.focus();
  };

  const closeButton = button(t.close, onClose);
  const root = h('section', { className: 'panel panel-wide', attrs: { 'aria-labelledby': 'shop-title' } }, [
    h('h2', { text: t.title, attrs: { id: 'shop-title' } }),
    sparks,
    list,
    sellRow,
    status,
    closeButton,
  ]);
  render(null);
  return { root, focus: firstBuy };
}

/** Pantalla de inventario: lo que se lleva, con texto además de números. */
export function createInventoryPanel(
  progress: Progress,
  onDrink: () => 'drunk' | 'full' | 'none',
  onClose: () => void,
): HTMLElement {
  const t = TEXTS.inventory;
  const needed = ITEM_BALANCE.fragmentsPerHeart;
  const status = h('p', { className: 'status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const potions = h('li', { text: t.potions(progress.potions, ITEM_BALANCE.potion.maxCarried) });
  const drink = button(t.drink, () => {
    const result = onDrink();
    status.textContent = result === 'drunk' ? t.drunk : result === 'full' ? t.fullLife : t.noPotions;
    potions.textContent = t.potions(progress.potions, ITEM_BALANCE.potion.maxCarried);
    drink.disabled = progress.potions <= 0;
    if (drink.disabled) closeButton.focus();
  });
  drink.disabled = progress.potions <= 0;
  const closeButton = button(t.close, onClose, 'btn btn-primary');
  const hasBlade = progress.flags.includes('bladeTaken');
  return h('section', { className: 'panel', attrs: { 'aria-labelledby': 'inventory-title' } }, [
    h('h2', { text: t.title, attrs: { id: 'inventory-title' } }),
    h('ul', { className: 'inventory-list' }, [
      h('li', { text: t.hearts(maxHearts(progress)) }),
      h('li', { text: t.fragments(progress.fragments, needed) }),
      h('li', { text: hasBlade ? t.temple(progress.temple, ITEM_BALANCE.temple.maxLevel) : t.noBlade }),
      h('li', { text: t.sparks(progress.sparks) }),
      potions,
      h('li', {
        text: `${t.keys}: ${progress.keys.length > 0 ? progress.keys.map((k) => t.keyNames[k]).join(', ') : t.noKeys}`,
      }),
      h('li', {
        text: `${t.abilities}: ${progress.abilities.length > 0 ? progress.abilities.map((a) => t.abilityNames[a]).join(', ') : t.noAbilities}`,
      }),
      h('li', {
        text: `${t.specials}: ${progress.specials.includes('talisman') ? t.talisman : t.noSpecials}`,
      }),
    ]),
    drink,
    status,
    closeButton,
  ]);
}
