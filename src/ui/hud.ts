import type { DummyState } from '../game/dummy';
import type { HudSnapshot } from '../engine/session';
import { TEXTS } from '../data/texts';
import { h } from './dom';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEART_PATH =
  'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z';
const FRACTIONS = ['', '¼', '½', '¾'];
/** Tiempo que se ve el aviso de oleada (s). */
const BANNER_MS = 2200;

let heartId = 0;

/** Un corazón dibujado que se llena por cuartos. */
function heartIcon(): { root: SVGSVGElement; setFill: (fraction: number) => void } {
  const id = `heart-clip-${++heartId}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'heart');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(SVG_NS, 'defs');
  const clip = document.createElementNS(SVG_NS, 'clipPath');
  clip.setAttribute('id', id);
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('height', '24');
  rect.setAttribute('width', '24');
  clip.append(rect);
  defs.append(clip);
  const back = document.createElementNS(SVG_NS, 'path');
  back.setAttribute('d', HEART_PATH);
  back.setAttribute('class', 'heart-empty');
  const front = document.createElementNS(SVG_NS, 'path');
  front.setAttribute('d', HEART_PATH);
  front.setAttribute('class', 'heart-full');
  front.setAttribute('clip-path', `url(#${id})`);
  svg.append(defs, back, front);
  return {
    root: svg,
    // Se llena de izquierda a derecha: los cuartos se distinguen por la forma, no solo por el color.
    setFill: (fraction) => rect.setAttribute('width', String(24 * Math.max(0, Math.min(1, fraction)))),
  };
}

/** Cantidad de corazones como texto: "3¾". */
export function heartsText(quarters: number): string {
  const whole = Math.floor(quarters / 4);
  const rest = quarters % 4;
  if (whole === 0 && rest > 0) return FRACTIONS[rest] ?? '';
  return `${whole}${FRACTIONS[rest] ?? ''}`;
}

/** Información en pantalla durante el juego. Todo con texto o icono además del color. */
export class Hud {
  private readonly hearts = h('div', { className: 'hud-hearts' });
  private readonly heartsLabel = h('span', { className: 'hud-hearts-label' });
  private readonly sparks = h('p', { className: 'hud-sparks' });
  private readonly wave = h('p', { className: 'hud-wave' });
  private readonly dodge = h('p', { className: 'hud-dodge' });
  private readonly banner = h('p', {
    className: 'hud-banner',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  private readonly dummyLabel = h('p', { className: 'hud-dummy' });
  private readonly muted = h('p', { className: 'hud-badge', text: TEXTS.hud.muted });
  private readonly hint = h('p', { className: 'hud-hint' });
  private icons: ReturnType<typeof heartIcon>[] = [];
  private last = '';
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly root: HTMLElement) {
    const top = h('div', { className: 'hud-top' }, [
      h('div', { className: 'hud-life' }, [this.hearts, this.heartsLabel]),
      this.sparks,
      this.dodge,
    ]);
    const side = h('div', { className: 'hud-side' }, [this.wave, this.dummyLabel]);
    root.replaceChildren(top, side, this.banner, this.muted, this.hint);
    this.muted.hidden = true;
    this.banner.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.root.hidden = !visible;
  }

  /** Actualiza vida, chispas, oleada y esquiva. Solo toca el DOM si algo cambió. */
  update(s: HudSnapshot): void {
    const t = TEXTS.hud;
    const nextIn = s.nextWaveIn === null ? -1 : Math.ceil(s.nextWaveIn);
    const key = `${s.quarters}/${s.maxQuarters}|${s.sparks}|${s.wave}|${nextIn}|${s.enemies}|${s.dodgeReady}`;
    if (key === this.last) return;
    this.last = key;
    const count = Math.ceil(s.maxQuarters / 4);
    if (this.icons.length !== count) {
      this.icons = Array.from({ length: count }, () => heartIcon());
      this.hearts.replaceChildren(...this.icons.map((i) => i.root));
    }
    this.icons.forEach((icon, i) => icon.setFill((s.quarters - i * 4) / 4));
    this.heartsLabel.textContent = `${t.hearts}: ${heartsText(s.quarters)} ${t.of} ${count}`;
    this.sparks.textContent = `✦ ${t.sparks}: ${s.sparks}`;
    this.wave.textContent =
      s.nextWaveIn === null
        ? `${t.wave} ${s.wave} · ${t.enemies}: ${s.enemies}`
        : `${t.nextWave} ${nextIn} ${t.seconds}`;
    this.dodge.textContent = s.dodgeReady ? `● ${t.dodgeReady}` : `○ ${t.dodgeWait}`;
    this.dodge.classList.toggle('is-waiting', !s.dodgeReady);
  }

  /** Aviso grande y breve (inicio o final de oleada). */
  showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.hidden = false;
    if (this.bannerTimer) clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      this.banner.hidden = true;
    }, BANNER_MS);
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
