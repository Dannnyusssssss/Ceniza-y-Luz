import type { BrowserInput } from '../core/input';
import type { SettingsStore } from '../core/settingsStore';
import type { GameSession } from '../engine/session';
import type { CharacterId } from '../data/characters';
import { TEXT_SIZE_SCALE, type Settings } from '../data/settings';
import type { DebugOverlay } from './debug';
import type { Hud } from './hud';
import { Menus } from './menus';

/** Tiempo tras una pausa en el que se ignora otra pulsación de pausa (evita que Esc pause y reanude a la vez). */
const PAUSE_DEBOUNCE_MS = 300;

type AppState = 'start' | 'select' | 'playing' | 'paused';

/**
 * Coordina pantallas, partida y entrada: inicio → elección → juego ⇄ pausa.
 * El juego se pausa con Esc o P, al perder la captura del puntero, el foco o la visibilidad de la pestaña.
 */
export class App {
  private state: AppState = 'start';
  private selected: CharacterId = 'alba';
  private lastPauseAt = 0;
  private wasLocked = false;
  readonly menus: Menus;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    menuRoot: HTMLElement,
    private readonly session: GameSession,
    private readonly input: BrowserInput,
    private readonly settings: SettingsStore,
    private readonly hud: Hud,
    private readonly debug: DebugOverlay,
  ) {
    this.menus = new Menus(menuRoot, settings, {
      onPlayFromStart: () => this.openSelect(),
      onPreviewCharacter: (id) => this.preview(id),
      onConfirmCharacter: (id) => {
        this.preview(id);
        this.play();
      },
      onResume: () => this.resume(),
      onToStart: () => this.toStart(),
      onClearData: () => settings.reset(),
    });
    session.onDummyChanged = (dummy) => hud.setDummy(dummy);
    hud.setDummy(session.dummy);
    settings.onChange((s) => this.applyUiSettings(s));
    this.applyUiSettings(settings.value);
  }

  /** Métodos para conectar con `BrowserInput`. */
  readonly inputCallbacks = {
    onPointerLockChange: (locked: boolean): void => {
      this.hud.setPointerLocked(locked);
      // Solo se pausa si el jugador tenía el puntero capturado y lo soltó (Esc del navegador).
      if (!locked && this.wasLocked && this.state === 'playing') this.pause();
      this.wasLocked = locked;
    },
    onPointerLockError: (): void => {
      // Sin captura se sigue jugando con las flechas; el HUD lo indica.
      this.hud.setPointerLocked(false);
    },
    onFocusLost: (): void => {
      if (this.state === 'playing') this.pause();
    },
    onSystemAction: (action: 'pause' | 'mute' | 'debug'): void => {
      if (action === 'mute') this.settings.update({ muted: !this.settings.value.muted });
      else if (action === 'debug') this.debug.toggle();
      else this.handlePauseKey();
    },
  };

  start(): void {
    this.state = 'start';
    this.hud.setVisible(false);
    this.session.showcase();
    this.menus.showStart();
  }

  private handlePauseKey(): void {
    if (performance.now() - this.lastPauseAt < PAUSE_DEBOUNCE_MS) return;
    if (this.state === 'playing') this.pause();
    else this.menus.handleEscape();
  }

  private openSelect(): void {
    this.state = 'select';
    this.session.showcase();
    this.menus.showSelect(this.selected);
  }

  private preview(id: CharacterId): void {
    if (id === this.selected) return;
    this.selected = id;
    this.session.setCharacter(id);
  }

  private play(): void {
    this.session.beginPlay();
    this.enterPlaying();
  }

  private resume(): void {
    this.enterPlaying();
  }

  /** Pasa a jugar. Se llama siempre desde un clic o una tecla, así se puede pedir la captura del puntero. */
  private enterPlaying(): void {
    this.state = 'playing';
    this.menus.hide();
    this.hud.setVisible(true);
    this.hud.setPointerLocked(this.input.isLocked());
    this.input.state.clear();
    this.input.gameplayActive = true;
    this.session.playing = true;
    this.canvas.focus();
    this.input.requestLock();
  }

  private pause(): void {
    this.state = 'paused';
    this.lastPauseAt = performance.now();
    this.session.playing = false;
    this.input.gameplayActive = false;
    this.input.state.clear();
    this.input.releaseLock();
    this.menus.showPause();
  }

  private toStart(): void {
    this.session.playing = false;
    this.input.gameplayActive = false;
    this.input.releaseLock();
    this.session.resetArena();
    this.start();
  }

  private applyUiSettings(s: Settings): void {
    this.hud.setMuted(s.muted);
    document.documentElement.style.setProperty('--ui-scale', String(TEXT_SIZE_SCALE[s.textSize]));
  }
}
