import type { DummyState } from '../game/dummy';
import { TEXTS } from '../data/texts';
import { h } from './dom';

/** Información en pantalla durante el juego. La vida se muestra con número, no solo con la barra de color. */
export class Hud {
  private readonly dummyLabel = h('p', { className: 'hud-dummy' });
  private readonly muted = h('p', { className: 'hud-badge', text: TEXTS.hud.muted });
  private readonly hint = h('p', { className: 'hud-hint' });

  constructor(private readonly root: HTMLElement) {
    root.replaceChildren(this.dummyLabel, this.muted, this.hint);
    this.muted.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  setDummy(dummy: DummyState): void {
    const t = TEXTS.hud;
    this.dummyLabel.textContent =
      dummy.respawn > 0
        ? t.dummyDown
        : `${t.dummyName} · ${t.health}: ${Math.ceil(dummy.health)} / ${dummy.maxHealth}`;
  }

  setMuted(muted: boolean): void {
    this.muted.hidden = !muted;
  }

  setPointerLocked(locked: boolean): void {
    this.hint.textContent = locked ? TEXTS.hud.lockedHint : TEXTS.hud.pointerHint;
  }
}
