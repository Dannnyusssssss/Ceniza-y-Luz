import { KEY_BINDINGS, type Action } from '../data/controls';

const ACTIONS = Object.keys(KEY_BINDINGS) as Action[];

/** Busca la acción asociada a un código de tecla. */
export function actionForCode(code: string): Action | null {
  for (const action of ACTIONS) {
    if (KEY_BINDINGS[action].includes(code)) return action;
  }
  return null;
}

/**
 * Estado de entrada sin DOM. Guarda qué acciones están pulsadas y cuáles se pulsaron
 * desde la última lectura, para que un toque corto entre dos pasos de lógica no se pierda.
 */
export class InputState {
  private readonly downCodes = new Set<string>();
  private readonly pressedActions = new Set<Action>();
  private readonly forcedDown = new Set<Action>();
  private mouseX = 0;
  private mouseY = 0;

  keyDown(code: string, repeat = false): void {
    const action = actionForCode(code);
    if (!action) return;
    if (!repeat && !this.downCodes.has(code)) this.pressedActions.add(action);
    this.downCodes.add(code);
  }

  keyUp(code: string): void {
    this.downCodes.delete(code);
  }

  /** Para entradas que no son teclas (el clic de ataque). */
  press(action: Action): void {
    this.pressedActions.add(action);
  }

  /** Mantiene una acción pulsada sin tecla (botón del ratón). */
  setForced(action: Action, down: boolean): void {
    if (down) this.forcedDown.add(action);
    else this.forcedDown.delete(action);
  }

  isDown(action: Action): boolean {
    if (this.forcedDown.has(action)) return true;
    return KEY_BINDINGS[action].some((code) => this.downCodes.has(code));
  }

  /** Devuelve si la acción se pulsó desde la última llamada y la marca como leída. */
  takePressed(action: Action): boolean {
    const was = this.pressedActions.has(action);
    this.pressedActions.delete(action);
    return was;
  }

  /** Vacía las pulsaciones pendientes sin leerlas (al pausar). */
  discardPressed(): void {
    this.pressedActions.clear();
  }

  addMouseDelta(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.mouseX += dx;
    this.mouseY += dy;
  }

  /** Devuelve el movimiento acumulado del ratón y lo pone a cero. */
  takeMouseDelta(): { x: number; y: number } {
    const delta = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  /** Suelta todo (al perder el foco), para que ninguna tecla quede "pegada". */
  clear(): void {
    this.downCodes.clear();
    this.pressedActions.clear();
    this.forcedDown.clear();
    this.mouseX = 0;
    this.mouseY = 0;
  }

  /** Eje de movimiento local: x = derecha, z = adelante, cada uno en [-1, 1]. */
  moveAxis(): { x: number; z: number } {
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const z = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    return { x, z };
  }
}
