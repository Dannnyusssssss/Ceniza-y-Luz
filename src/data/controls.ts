/**
 * Asignación de teclas. Se usan códigos físicos (`KeyboardEvent.code`), así WASD funciona
 * en cualquier distribución de teclado. Ctrl y Tab nunca son teclas de juego (Tab sirve para salir del foco).
 */
export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'walk'
  | 'attack'
  | 'dodge'
  | 'interact'
  | 'inventory'
  | 'pause'
  | 'mute'
  | 'camLeft'
  | 'camRight'
  | 'camUp'
  | 'camDown'
  | 'debug';

export const KEY_BINDINGS: Readonly<Record<Action, readonly string[]>> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  walk: ['ShiftLeft', 'ShiftRight'],
  attack: ['KeyJ'],
  dodge: ['Space'],
  interact: ['KeyE'],
  inventory: ['KeyI'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
  camLeft: ['ArrowLeft'],
  camRight: ['ArrowRight'],
  camUp: ['ArrowUp'],
  camDown: ['ArrowDown'],
  debug: ['F3'],
};

/** Botón izquierdo del ratón: ataque (solo con el puntero capturado). */
export const MOUSE_ATTACK_BUTTON = 0;

/** Velocidad de giro de la cámara con flechas, en radianes por segundo (sensibilidad 1). */
export const ARROW_CAMERA_SPEED = 2.2;

/** Radianes por píxel de ratón (sensibilidad 1). */
export const MOUSE_CAMERA_SPEED = 0.0025;
