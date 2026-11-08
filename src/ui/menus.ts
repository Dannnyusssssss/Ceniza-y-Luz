import type { SettingsStore } from '../core/settingsStore';
import { CHARACTER_IDS, CHARACTERS, type CharacterId } from '../data/characters';
import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import type { Progress } from '../game/progress';
import { button, h } from './dom';
import { createDialogueBox, createInventoryPanel, createShopPanel, type DialogueView } from './gameScreens';
import { createSettingsPanel } from './settingsPanel';

export interface MenuActions {
  onPlayFromStart(): void;
  onContinue(): void;
  onPreviewCharacter(id: CharacterId): void;
  onConfirmCharacter(id: CharacterId): void;
  onResume(): void;
  onToStart(): void;
  onClearData(): void;
  onRetry(): void;
  onDrink(): 'drunk' | 'full' | 'none';
  onCloseGameMenu(): void;
  onShopChange(): void;
}

function controlsList(): HTMLElement {
  return h(
    'dl',
    { className: 'controls' },
    TEXTS.controls.flatMap(([keys, action]) => [h('dt', { text: keys }), h('dd', { text: action })]),
  );
}

/** Pantallas del juego en el DOM: inicio, elección de personaje, pausa y ajustes. */
export class Menus {
  private current:
    'start' | 'select' | 'pause' | 'settings' | 'death' | 'dialogue' | 'shop' | 'inventory' | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly settings: SettingsStore,
    private readonly actions: MenuActions,
  ) {}

  get open(): boolean {
    return this.current !== null;
  }

  get screen(): string | null {
    return this.current;
  }

  hide(): void {
    this.current = null;
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  /** Pantalla de inicio. Con una partida guardada ofrece "Continuar" y "Nueva partida". */
  showStart(hasSave: boolean): void {
    const t = TEXTS.start;
    const actions: HTMLElement[] = hasSave
      ? [
          button(t.continueGame, () => this.actions.onContinue(), 'btn btn-primary'),
          button(t.newGame, () => this.showNewGameConfirm()),
        ]
      : [button(t.play, () => this.actions.onPlayFromStart(), 'btn btn-primary')];
    actions.push(button(t.settings, () => this.showSettings(() => this.showStart(hasSave))));
    this.mount(
      'start',
      h('section', { className: 'panel panel-wide', attrs: { 'aria-labelledby': 'game-title' } }, [
        // El h1 de la página está siempre en el HTML; aquí el título es solo visual.
        h('p', { className: 'title', text: META.title, attrs: { id: 'game-title' } }),
        h('p', { className: 'subtitle', text: t.subtitle }),
        h('div', { className: 'notice', attrs: { role: 'note' } }, [
          h('h2', { text: t.noticeTitle }),
          h('p', { text: t.notice }),
        ]),
        h('h2', { text: t.controlsTitle }),
        controlsList(),
        h('div', { className: 'row' }, actions),
        h('p', { className: 'hint', text: t.keyboardExit }),
      ]),
    );
  }

  /** La partida guardada no se pierde sin confirmarlo. */
  private showNewGameConfirm(): void {
    const t = TEXTS.start;
    const panel = h(
      'section',
      { className: 'panel', attrs: { role: 'alertdialog', 'aria-labelledby': 'new-title' } },
      [
        h('h2', { text: t.newGame, attrs: { id: 'new-title' } }),
        h('p', { text: t.newGameConfirm }),
        h('div', { className: 'row' }, [
          button(t.newGameNo, () => this.showStart(true), 'btn btn-primary'),
          button(t.newGameYes, () => this.actions.onPlayFromStart(), 'btn btn-danger'),
        ]),
      ],
    );
    this.mount('start', panel);
  }

  showSelect(selected: CharacterId): void {
    const t = TEXTS.select;
    const cards = CHARACTER_IDS.map((id) => {
      const data = CHARACTERS[id];
      const card = h(
        'button',
        {
          className: 'card',
          attrs: { type: 'button', 'aria-pressed': String(id === selected) },
          on: {
            click: () => this.actions.onConfirmCharacter(id),
            focus: () => {
              this.actions.onPreviewCharacter(id);
              for (const other of cardsEl.querySelectorAll('.card'))
                other.setAttribute('aria-pressed', 'false');
              card.setAttribute('aria-pressed', 'true');
            },
            mouseenter: () => card.focus(),
          },
        },
        [
          h('span', { className: 'card-name', text: `${t.confirm} ${data.name}` }),
          h('span', { className: 'card-tagline', text: data.tagline }),
        ],
      );
      return card;
    });
    const cardsEl = h('div', { className: 'cards' }, cards);
    this.mount(
      'select',
      h('section', { className: 'panel panel-side', attrs: { 'aria-labelledby': 'select-title' } }, [
        h('h2', { text: t.title, attrs: { id: 'select-title' } }),
        h('p', { className: 'hint', text: t.hint }),
        cardsEl,
        button(t.back, () => this.actions.onToStart(), 'btn btn-secondary'),
      ]),
      cards[CHARACTER_IDS.indexOf(selected)] ?? null,
    );
  }

  showPause(): void {
    const t = TEXTS.pause;
    this.mount(
      'pause',
      h('section', { className: 'panel', attrs: { 'aria-labelledby': 'pause-title' } }, [
        h('h2', { text: t.title, attrs: { id: 'pause-title' } }),
        button(t.resume, () => this.actions.onResume(), 'btn btn-primary'),
        button(t.settings, () => this.showSettings(() => this.showPause())),
        h('details', {}, [h('summary', { text: t.controls }), controlsList()]),
        button(t.toStart, () => this.actions.onToStart(), 'btn btn-secondary'),
        h('p', { className: 'hint', text: t.pointerHint }),
      ]),
    );
  }

  /** Pantalla al caer: "Reintentar" tiene el foco para seguir con el teclado. */
  showDeath(text: string): void {
    const t = TEXTS.death;
    this.mount(
      'death',
      h('section', { className: 'panel', attrs: { 'aria-labelledby': 'death-title', role: 'alertdialog' } }, [
        h('h2', { text: t.title, attrs: { id: 'death-title' } }),
        h('p', { text }),
        button(t.retry, () => this.actions.onRetry(), 'btn btn-primary'),
        button(t.toStart, () => this.actions.onToStart(), 'btn btn-secondary'),
      ]),
    );
  }

  /** Una línea de diálogo, abajo, con el mundo visible. */
  showDialogue(view: DialogueView): void {
    const box = createDialogueBox(view);
    this.mount('dialogue', box.root, box.focus);
  }

  showShop(progress: Progress): void {
    const shop = createShopPanel(
      progress,
      () => this.actions.onCloseGameMenu(),
      () => this.actions.onShopChange(),
    );
    this.mount('shop', shop.root, shop.focus);
  }

  showInventory(progress: Progress): void {
    this.mount(
      'inventory',
      createInventoryPanel(
        progress,
        () => this.actions.onDrink(),
        () => this.actions.onCloseGameMenu(),
      ),
    );
  }

  showSettings(onBack: () => void, status = ''): void {
    const panel = createSettingsPanel(
      this.settings,
      onBack,
      () => {
        this.actions.onClearData();
        this.showSettings(onBack, TEXTS.settings.cleared);
      },
      status,
    );
    this.mount('settings', panel);
  }

  /** Pulsar Esc dentro de un menú: vuelve atrás o continúa. Devuelve true si lo atendió. */
  handleEscape(): boolean {
    if (this.current === 'settings') {
      const back = this.root.querySelector<HTMLButtonElement>('.panel > .btn:last-child');
      back?.click();
      return true;
    }
    if (this.current === 'pause') {
      this.actions.onResume();
      return true;
    }
    if (this.current === 'select') {
      this.actions.onToStart();
      return true;
    }
    return false;
  }

  private mount(
    screen: NonNullable<Menus['current']>,
    content: HTMLElement,
    focus: HTMLElement | null = null,
  ): void {
    this.current = screen;
    this.root.hidden = false;
    this.root.className = `screen screen-${screen}`;
    this.root.replaceChildren(content);
    (focus ?? content.querySelector<HTMLElement>('button, input, select, summary'))?.focus();
  }
}
