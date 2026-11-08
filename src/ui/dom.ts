/**
 * Creación de nodos del DOM sin `innerHTML`: el texto siempre va por `textContent`,
 * así ningún dato puede convertirse en HTML o código.
 */
export interface ElementProps {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: Readonly<Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: readonly (Node | null)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.className) element.className = props.className;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.attrs) for (const [key, value] of Object.entries(props.attrs)) element.setAttribute(key, value);
  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      if (handler) element.addEventListener(type, handler);
    }
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

export function button(label: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  return h('button', { className, text: label, attrs: { type: 'button' }, on: { click: onClick } });
}

let idCounter = 0;
/** Identificador único para asociar `label` y campo. */
export function uniqueId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}
