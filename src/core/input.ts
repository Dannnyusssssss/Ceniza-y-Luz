import { MOUSE_ATTACK_BUTTON } from '../data/controls';
import { actionForCode, InputState } from './inputState';

/** Acciones que se atienden también con el juego detenido (menús y diálogos). */
export type SystemAction = 'pause' | 'mute' | 'debug' | 'inventory' | 'interact';

export interface InputCallbacks {
  /** Cambió la captura del puntero (true = capturado). */
  onPointerLockChange(locked: boolean): void;
  /** El navegador rechazó la captura del puntero. */
  onPointerLockError(): void;
  /** La ventana perdió el foco o la pestaña dejó de verse. */
  onFocusLost(): void;
  /** Se pulsó una acción de sistema (pausa, silencio, depuración) aunque el juego esté en pausa. */
  onSystemAction(action: SystemAction): void;
}

/**
 * Conecta el teclado y el ratón del navegador con `InputState`.
 * La captura del puntero solo se pide tras un gesto del usuario (clic en el lienzo).
 */
export class BrowserInput {
  readonly state = new InputState();
  /** Si es false, las teclas de juego no se registran (menús abiertos). */
  gameplayActive = false;
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputCallbacks,
  ) {
    this.listen(window, 'keydown', (e) => this.handleKeyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.state.keyUp((e as KeyboardEvent).code));
    this.listen(canvas, 'mousedown', (e) => this.handleMouseDown(e as MouseEvent));
    this.listen(window, 'mouseup', (e) => {
      if ((e as MouseEvent).button === MOUSE_ATTACK_BUTTON) this.state.setForced('attack', false);
    });
    this.listen(document, 'mousemove', (e) => {
      if (this.isLocked()) this.state.addMouseDelta((e as MouseEvent).movementX, (e as MouseEvent).movementY);
    });
    this.listen(document, 'pointerlockchange', () => {
      const locked = this.isLocked();
      if (!locked) this.state.setForced('attack', false);
      this.callbacks.onPointerLockChange(locked);
    });
    this.listen(document, 'pointerlockerror', () => this.callbacks.onPointerLockError());
    this.listen(window, 'blur', () => this.loseFocus());
    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.loseFocus();
    });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Pide capturar el puntero. Solo funciona dentro de un gesto del usuario. */
  requestLock(): void {
    if (this.isLocked()) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => this.callbacks.onPointerLockError());
    } catch {
      this.callbacks.onPointerLockError();
    }
  }

  releaseLock(): void {
    if (this.isLocked()) document.exitPointerLock();
  }

  dispose(): void {
    for (const off of this.cleanup) off();
    this.cleanup.length = 0;
  }

  private loseFocus(): void {
    this.state.clear();
    this.callbacks.onFocusLost();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    const action = actionForCode(e.code);
    if (!action) return;
    if (action === 'pause' || action === 'mute' || action === 'debug') {
      if (!e.repeat) this.callbacks.onSystemAction(action);
      if (action !== 'pause') e.preventDefault();
      return;
    }
    if (action === 'inventory') {
      if (!e.repeat) this.callbacks.onSystemAction(action);
      e.preventDefault();
      return;
    }
    if (!this.gameplayActive) {
      // Con el juego detenido, E sirve para avanzar los diálogos.
      if (action === 'interact' && !e.repeat) this.callbacks.onSystemAction(action);
      return;
    }
    // Solo se bloquea la acción por defecto de las teclas de juego (p. ej. el desplazamiento con flechas o Espacio).
    e.preventDefault();
    this.state.keyDown(e.code, e.repeat);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.gameplayActive) return;
    if (!this.isLocked()) {
      // El primer clic captura el puntero; no cuenta como ataque.
      this.requestLock();
      return;
    }
    if (e.button === MOUSE_ATTACK_BUTTON) {
      this.state.press('attack');
      this.state.setForced('attack', true);
    }
  }

  private listen(target: EventTarget, type: string, handler: (e: Event) => void): void {
    target.addEventListener(type, handler);
    this.cleanup.push(() => target.removeEventListener(type, handler));
  }
}
