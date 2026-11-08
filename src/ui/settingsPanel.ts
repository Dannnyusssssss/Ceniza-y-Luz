import type { SettingsStore } from '../core/settingsStore';
import {
  DAMAGE_TAKEN_LEVELS,
  FOV_RANGE,
  FPS_LIMITS,
  QUALITY_LEVELS,
  SENSITIVITY_RANGE,
  TEXT_SIZES,
  type NumberRange,
  type Settings,
} from '../data/settings';
import { TEXTS } from '../data/texts';
import { button, h, uniqueId } from './dom';

type BooleanKey = 'muted' | 'reduceFlashing' | 'reduceMotion' | 'invertY';

/** Formulario de ajustes. Cada cambio se aplica y se guarda al instante. */
export function createSettingsPanel(
  store: SettingsStore,
  onBack: () => void,
  onClearData: () => void,
  initialStatus = '',
): HTMLElement {
  const t = TEXTS.settings;
  const status = h('p', {
    className: 'status',
    text: initialStatus,
    attrs: { role: 'status', 'aria-live': 'polite' },
  });

  const reportSave = (): void => {
    status.textContent = store.lastSaveOk ? '' : t.saveFailed;
  };

  const checkbox = (key: BooleanKey, label: string): HTMLElement => {
    const id = uniqueId(key);
    const input = h('input', { attrs: { type: 'checkbox', id } });
    input.checked = store.value[key];
    input.addEventListener('change', () => {
      store.update({ [key]: input.checked } as Partial<Settings>);
      reportSave();
    });
    return h('div', { className: 'field field-check' }, [
      input,
      h('label', { text: label, attrs: { for: id } }),
    ]);
  };

  const range = (
    key: 'sensitivity' | 'fov',
    label: string,
    limits: NumberRange,
    format: (v: number) => string,
  ): HTMLElement => {
    const id = uniqueId(key);
    const output = h('output', { text: format(store.value[key]), attrs: { for: id } });
    const input = h('input', {
      attrs: {
        type: 'range',
        id,
        min: String(limits.min),
        max: String(limits.max),
        step: String(limits.step),
      },
    });
    input.value = String(store.value[key]);
    input.addEventListener('input', () => {
      store.update({ [key]: Number(input.value) } as Partial<Settings>);
      output.textContent = format(store.value[key]);
      reportSave();
    });
    return h('div', { className: 'field' }, [h('label', { text: label, attrs: { for: id } }), input, output]);
  };

  const select = <T extends string>(
    key: 'quality' | 'fpsLimit' | 'textSize' | 'damageTaken',
    label: string,
    values: readonly T[],
    names: Readonly<Record<T, string>>,
  ): HTMLElement => {
    const id = uniqueId(key);
    const input = h(
      'select',
      { attrs: { id } },
      values.map((v) => h('option', { text: names[v], attrs: { value: v } })),
    );
    input.value = store.value[key];
    input.addEventListener('change', () => {
      store.update({ [key]: input.value } as Partial<Settings>);
      reportSave();
    });
    return h('div', { className: 'field' }, [h('label', { text: label, attrs: { for: id } }), input]);
  };

  // Borrado de datos con confirmación en la misma pantalla (los diálogos del navegador pueden estar bloqueados en un iframe).
  const clearArea = h('div', { className: 'clear-area' });
  const showClearButton = (): void => {
    clearArea.replaceChildren(button(t.clearData, showConfirm, 'btn btn-secondary'));
  };
  const showConfirm = (): void => {
    const yes = button(
      t.clearYes,
      () => {
        // Quien llama vuelve a montar el panel con los valores iniciales y el aviso de borrado.
        onClearData();
      },
      'btn btn-danger',
    );
    clearArea.replaceChildren(
      h('p', { text: t.clearConfirm }),
      yes,
      button(t.clearNo, showClearButton, 'btn btn-secondary'),
    );
    yes.focus();
  };
  showClearButton();

  return h('section', { className: 'panel', attrs: { 'aria-labelledby': 'settings-title' } }, [
    h('h2', { text: t.title, attrs: { id: 'settings-title' } }),
    checkbox('muted', t.muted),
    checkbox('reduceFlashing', t.reduceFlashing),
    checkbox('reduceMotion', t.reduceMotion),
    range('sensitivity', t.sensitivity, SENSITIVITY_RANGE, (v) => v.toFixed(1)),
    checkbox('invertY', t.invertY),
    range('fov', t.fov, FOV_RANGE, (v) => `${v}${t.fovUnit}`),
    select('quality', t.quality, QUALITY_LEVELS, t.qualityOptions),
    select('fpsLimit', t.fpsLimit, FPS_LIMITS, t.fpsLimitOptions),
    select('textSize', t.textSize, TEXT_SIZES, t.textSizeOptions),
    select('damageTaken', t.damageTaken, DAMAGE_TAKEN_LEVELS, t.damageTakenOptions),
    clearArea,
    status,
    button(t.back, onBack),
  ]);
}
