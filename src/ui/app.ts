import type { BrowserInput, SystemAction } from '../core/input';
import type { SettingsStore } from '../core/settingsStore';
import type { CharacterId } from '../data/characters';
import { HOME_SHOTS, INTRO_SHOTS, RESCUE_SHOTS, type IntroShot } from '../data/intro';
import { TEXT_SIZE_SCALE, type Settings } from '../data/settings';
import { TEXTS, type Dialogue } from '../data/texts';
import type { NpcId, ExitData } from '../data/zones';
import type { SaveSlot } from '../engine/saveSlot';
import type { GameSession } from '../engine/session';
import type { AdventureEvent } from '../game/adventure';
import type { GuardianEvent } from '../game/guardian';
import type { RegentEvent } from '../game/regent';
import {
  advanceDialogue,
  currentLine,
  lineTextFor,
  pickDialogue,
  startDialogue,
  type DialogueCursor,
} from '../game/dialogue';
import { setFlag, type Progress } from '../game/progress';
import type { DebugOverlay } from './debug';
import type { Hud } from './hud';
import { showGuardianNotice, showRegentNotice } from './bossNotices';
import { adventureMessage, speakerName } from './labels';
import { Menus } from './menus';

/** Tiempo tras una pausa en el que se ignora otra pulsación de pausa (evita que Esc pause y reanude a la vez). */
const PAUSE_DEBOUNCE_MS = 300;
/** Duración de cada mitad del fundido entre zonas (s). Es una bajada suave a negro: no es un destello. */
const FADE_MS = 280;
const FADE_REDUCED_MS = 60;

type AppState =
  'start' | 'select' | 'intro' | 'playing' | 'dialogue' | 'menu' | 'transition' | 'paused' | 'dead';

/**
 * Coordina pantallas, partida y entrada: inicio → elección → intro → juego ⇄ diálogos, tienda, inventario y pausa.
 * El juego se pausa con Esc o P, al perder la captura del puntero, el foco o la visibilidad de la pestaña.
 */
export class App {
  private state: AppState = 'start';
  private selected: CharacterId = 'alba';
  private lastPauseAt = 0;
  private wasLocked = false;
  private dialogue: DialogueCursor | null = null;
  /** Qué hacer al terminar el diálogo actual. */
  private afterDialogue: (() => void) | null = null;
  private introShot = 0;
  /** El diálogo sigue con otro plano: no hay que ofrecer "Cerrar". */
  private chained = false;
  /** Datos de la partida guardada, si hay. */
  private saved: Progress | null = null;
  readonly menus: Menus;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    menuRoot: HTMLElement,
    private readonly fade: HTMLElement,
    private readonly session: GameSession,
    private readonly input: BrowserInput,
    private readonly settings: SettingsStore,
    private readonly slot: SaveSlot,
    private readonly hud: Hud,
    private readonly debug: DebugOverlay,
  ) {
    this.menus = new Menus(menuRoot, settings, {
      onPlayFromStart: () => this.openSelect(),
      onContinue: () => this.continueGame(),
      onPreviewCharacter: (id) => this.preview(id),
      onConfirmCharacter: (id) => {
        this.preview(id);
        this.confirmCharacter();
      },
      onResume: () => this.resume(),
      onToStart: () => this.toStart(),
      onClearData: () => {
        settings.reset();
        slot.clear();
        this.saved = null;
      },
      onRetry: () => this.retry(),
      onDrink: () => this.drink(),
      onCloseGameMenu: () => this.closeGameMenu(),
      onShopChange: () => this.session.sfx.play('buy'),
    });
    session.onDummyChanged = (dummy) => hud.setDummy(dummy);
    session.onHud = (snapshot) => hud.update(snapshot, session.progress);
    session.onBanner = (kind, wave) =>
      hud.showBanner(kind === 'waveStarted' ? TEXTS.hud.waveStarted(wave) : TEXTS.hud.waveCleared(wave));
    session.onRetryReady = () => this.die();
    session.onAdventure = (event) => this.handleAdventure(event);
    session.onExit = (exit) => this.travel(exit);
    session.onGuardian = (event) => this.handleGuardian(event);
    session.onRegent = (event) => this.handleRegent(event);
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
    onSystemAction: (action: SystemAction): void => {
      if (action === 'mute') this.settings.update({ muted: !this.settings.value.muted });
      else if (action === 'debug') this.debug.toggle();
      else if (action === 'inventory') this.toggleInventory();
      else if (action === 'interact') this.advanceWithKey();
      else this.handlePauseKey();
    },
  };

  start(): void {
    this.state = 'start';
    this.hud.setVisible(false);
    this.saved = this.session.mode === 'story' ? this.slot.load() : null;
    this.session.showcase();
    this.menus.showStart(this.saved !== null);
  }

  /** Un fallo del entorno (gráficos perdidos): la partida no sigue corriendo sin que se vea. */
  pauseForError(): void {
    if (this.state === 'playing') this.pause();
  }

  private handlePauseKey(): void {
    if (performance.now() - this.lastPauseAt < PAUSE_DEBOUNCE_MS) return;
    if (this.state === 'dead' || this.state === 'intro' || this.state === 'transition') return;
    if (this.state === 'playing') this.pause();
    else if (this.state === 'dialogue') this.finishDialogue();
    else if (this.state === 'menu') this.closeGameMenu();
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

  /** Tras elegir personaje: la arena empieza ya; la aventura, con la intro. */
  private confirmCharacter(): void {
    this.session.unlockAudio();
    if (this.session.mode === 'arena') {
      this.session.beginPlay();
      this.enterPlaying();
      return;
    }
    this.slot.clear();
    this.saved = null;
    this.state = 'intro';
    this.introShot = 0;
    this.session.startIntro(this.selected);
    this.playShots(INTRO_SHOTS, () => this.finishIntro(), true);
  }

  /** Reproduce una serie de planos: cada uno avanza solo cuando el jugador termina de leerlo. */
  private playShots(shots: readonly IntroShot[], onDone: () => void, canSkip: boolean): void {
    this.introShot = 0;
    this.chained = true;
    const next = (): void => {
      const shot = shots[this.introShot];
      if (!shot) {
        this.chained = false;
        onDone();
        return;
      }
      this.session.setIntroShot(this.introShot);
      this.openDialogue(
        shot.lines,
        () => {
          this.introShot++;
          next();
        },
        canSkip,
      );
      this.state = 'intro';
    };
    next();
  }

  /** El gemelo es libre: planos en la sala del trono, vuelta a Lumbre y créditos. La partida ya queda guardada. */
  private startEnding(): void {
    if (!this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
    this.stopPlaying();
    this.hud.setVisible(false);
    this.session.startRescueScene();
    this.playShots(RESCUE_SHOTS, () => this.goHome(), false);
    this.state = 'intro';
    this.fadeIn();
  }

  private goHome(): void {
    this.state = 'transition';
    this.menus.hide();
    const style = this.fade.style;
    style.transition = `opacity ${this.fadeDuration()}ms ease`;
    style.opacity = '1';
    setTimeout(() => {
      this.session.startHomeScene();
      this.playShots(HOME_SHOTS, () => this.showCredits(), false);
      this.fadeIn();
    }, this.fadeDuration());
  }

  private showCredits(): void {
    this.state = 'intro';
    this.menus.showCredits(() => this.toStart());
  }

  /** Amanece en Lumbre: la partida empieza y queda guardada. */
  private finishIntro(): void {
    this.dialogue = null;
    this.afterDialogue = null;
    this.menus.hide();
    this.session.endIntro();
    this.session.beginPlay();
    this.enterPlaying();
    this.fadeIn();
    this.hud.showBanner(TEXTS.world.zones.lumbre);
    if (!this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
  }

  /** Continuar la partida guardada. */
  private continueGame(): void {
    if (!this.saved) return;
    this.session.unlockAudio();
    this.selected = this.saved.character;
    this.session.continueGame(this.saved);
    this.saved = null;
    this.session.beginPlay();
    this.enterPlaying();
    this.fadeIn();
    this.hud.showBanner(TEXTS.world.zones[this.session.progress.place.zone]);
  }

  private resume(): void {
    this.enterPlaying();
  }

  /** El jugador cayó: se muestra "Reintentar" (el mundo queda quieto detrás). */
  private die(): void {
    this.state = 'dead';
    this.stopPlaying();
    this.hud.setVisible(false);
    this.menus.showDeath(this.session.mode === 'arena' ? TEXTS.death.arenaText : TEXTS.death.text);
  }

  private retry(): void {
    this.session.retry();
    this.enterPlaying();
    this.fadeIn();
  }

  /** Detiene la lógica y suelta el puntero para usar un menú. */
  private stopPlaying(): void {
    this.session.music.setPaused(true);
    this.session.playing = false;
    this.canvas.classList.remove('is-playing');
    this.input.gameplayActive = false;
    this.input.state.clear();
    this.input.releaseLock();
  }

  /** Pasa a jugar. Se llama siempre desde un clic o una tecla, así se puede pedir la captura del puntero. */
  private enterPlaying(): void {
    // El audio solo puede empezar tras una acción del jugador; esta lo es.
    this.session.unlockAudio();
    this.state = 'playing';
    this.menus.hide();
    this.hud.setVisible(true);
    this.hud.setPointerLocked(this.input.isLocked());
    this.input.state.clear();
    this.input.gameplayActive = true;
    this.session.music.setPaused(false);
    this.session.playing = true;
    this.canvas.classList.add('is-playing');
    this.canvas.focus();
    this.input.requestLock();
  }

  private pause(): void {
    this.state = 'paused';
    this.lastPauseAt = performance.now();
    this.stopPlaying();
    this.menus.showPause();
  }

  private toStart(): void {
    this.stopPlaying();
    this.session.resetToMenu();
    this.selected = this.session.progress.character;
    this.start();
  }

  // --- Diálogos -----------------------------------------------------------------------------------------------

  private openDialogue(lines: Dialogue, after: (() => void) | null, canSkip = false): void {
    this.stopPlaying();
    this.state = 'dialogue';
    this.dialogue = startDialogue(lines);
    this.afterDialogue = after;
    this.showLine(canSkip);
  }

  private showLine(canSkip: boolean): void {
    const cursor = this.dialogue;
    const line = cursor ? currentLine(cursor) : null;
    if (!cursor || !line) {
      this.finishDialogue();
      return;
    }
    const progress = this.session.progress;
    this.menus.showDialogue({
      name: speakerName(line.speaker, progress),
      text: lineTextFor(line.text, progress.character),
      isLast: cursor.index >= cursor.lines.length - 1 && !this.chained,
      canSkip,
      onNext: () => this.nextLine(canSkip),
      onSkip: () => this.finishIntro(),
    });
  }

  private nextLine(canSkip: boolean): void {
    if (this.dialogue && advanceDialogue(this.dialogue)) this.showLine(canSkip);
    else this.finishDialogue();
  }

  private finishDialogue(): void {
    const after = this.afterDialogue;
    this.dialogue = null;
    this.afterDialogue = null;
    this.session.endTalk();
    if (after) after();
    else this.enterPlaying();
  }

  /** E avanza el diálogo igual que el botón. */
  private advanceWithKey(): void {
    if (this.state === 'dialogue' || this.state === 'intro') {
      document.querySelector<HTMLButtonElement>('.dialogue .btn-primary')?.click();
    }
  }

  // --- Objetos del mundo ---------------------------------------------------------------------------------------

  private handleAdventure(event: AdventureEvent): void {
    const progress = this.session.progress;
    switch (event.type) {
      case 'talk':
        this.talkTo(event.npc);
        return;
      case 'read':
        this.openDialogue([{ speaker: 'narrator', text: TEXTS.signs[event.text] }], null);
        return;
      case 'rescue':
        this.startEnding();
        return;
      case 'rest': {
        const ok = this.save();
        this.hud.showMessage(ok ? TEXTS.world.restSaved : TEXTS.world.restFailed);
        return;
      }
      default: {
        const message = adventureMessage(event, progress);
        if (message) this.hud.showMessage(message);
        // Lo que no se debe repetir queda guardado en cuanto ocurre.
        if (event.type === 'abilityLearned' && !this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
      }
    }
  }

  /** Avisos del jefe; al vencerlo, la partida se guarda en cuanto ocurre. */
  private handleGuardian(event: GuardianEvent): void {
    showGuardianNotice(this.hud, event);
    if (event.type === 'guardianDefeated' && !this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
  }

  private handleRegent(event: RegentEvent): void {
    showRegentNotice(this.hud, event, this.session.progress.character);
    if (event.type === 'regentDefeated' && !this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
  }

  private talkTo(npc: NpcId): void {
    const progress = this.session.progress;
    const after = npc === 'oren' ? () => this.openShop() : null;
    if (npc === 'ilse') setFlag(progress, 'metIlse');
    this.openDialogue(pickDialogue(npc, progress), after);
  }

  private openShop(): void {
    this.state = 'menu';
    this.menus.showShop(this.session.progress);
  }

  private toggleInventory(): void {
    if (this.state === 'playing') {
      if (this.session.mode === 'arena') return;
      this.lastPauseAt = performance.now();
      this.stopPlaying();
      this.state = 'menu';
      this.menus.showInventory(this.session.progress);
    } else if (this.state === 'menu' && this.menus.screen === 'inventory') {
      this.closeGameMenu();
    }
  }

  private drink(): 'drunk' | 'full' | 'none' {
    if (this.session.progress.potions <= 0) return 'none';
    return this.session.drinkPotion() ? 'drunk' : 'full';
  }

  private closeGameMenu(): void {
    this.lastPauseAt = performance.now();
    this.enterPlaying();
  }

  // --- Zonas y guardado -----------------------------------------------------------------------------------------

  /** Devuelve false si no se pudo escribir. Nunca rompe la partida. */
  private save(): boolean {
    if (this.session.mode !== 'story') return true;
    return this.slot.save(this.session.snapshot());
  }

  private fadeDuration(): number {
    return this.settings.value.reduceMotion ? FADE_REDUCED_MS : FADE_MS;
  }

  /** Empieza de negro y aclara (al llegar a una escena nueva). */
  private fadeIn(): void {
    const style = this.fade.style;
    style.transition = 'none';
    style.opacity = '1';
    // El navegador debe pintar el negro antes de aclarar.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        style.transition = `opacity ${this.fadeDuration()}ms ease`;
        style.opacity = '0';
      }),
    );
  }

  /** Cruza una salida: fundido a negro, cambia de zona y guarda. */
  private travel(exit: ExitData): void {
    if (this.state !== 'playing') return;
    this.state = 'transition';
    this.session.playing = false;
    this.input.state.clear();
    const style = this.fade.style;
    style.transition = `opacity ${this.fadeDuration()}ms ease`;
    style.opacity = '1';
    setTimeout(() => {
      this.session.changeZone(exit.to, exit.entry);
      if (!this.save()) this.hud.showMessage(TEXTS.world.autosaveFailed);
      this.hud.showBanner(TEXTS.world.zones[exit.to]);
      requestAnimationFrame(() => {
        style.opacity = '0';
        this.state = 'playing';
        this.session.playing = true;
        // Si se perdió el foco durante el fundido, se pausa aquí.
        if (!document.hasFocus()) this.pause();
      });
    }, this.fadeDuration());
  }

  private applyUiSettings(s: Settings): void {
    this.hud.setMuted(s.muted);
    document.documentElement.style.setProperty('--ui-scale', String(TEXT_SIZE_SCALE[s.textSize]));
  }
}
