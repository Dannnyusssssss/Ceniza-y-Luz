/** Esquema, límites y valores por defecto de los ajustes guardados. */

export const SETTINGS_VERSION = 1;

export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export const FPS_LIMITS = ['auto', 'saver', 'off'] as const;
export type FpsLimit = (typeof FPS_LIMITS)[number];

/** Imágenes por segundo que busca cada límite durante la partida (null: todas las que permita la pantalla). */
export const FPS_LIMIT_TARGET: Readonly<Record<FpsLimit, number | null>> = { auto: 60, saver: 30, off: null };
/** Imágenes por segundo como máximo fuera de la partida (pausa, menús y diálogos). */
export const IDLE_FPS_TARGET = 30;

export const DAMAGE_TAKEN_LEVELS = ['normal', 'reduced'] as const;
export type DamageTaken = (typeof DAMAGE_TAKEN_LEVELS)[number];

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** Escala de la interfaz para cada tamaño de texto. */
export const TEXT_SIZE_SCALE: Readonly<Record<TextSize, number>> = { normal: 1, large: 1.25, xlarge: 1.5 };

export interface NumberRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

export const SENSITIVITY_RANGE: NumberRange = { min: 0.2, max: 3, step: 0.1, default: 1 };
/** Campo de visión vertical en grados. */
export const FOV_RANGE: NumberRange = { min: 55, max: 100, step: 1, default: 70 };

export interface Settings {
  readonly version: number;
  readonly muted: boolean;
  readonly reduceFlashing: boolean;
  readonly reduceMotion: boolean;
  readonly sensitivity: number;
  readonly invertY: boolean;
  readonly fov: number;
  readonly quality: QualityLevel;
  readonly fpsLimit: FpsLimit;
  readonly damageTaken: DamageTaken;
  readonly textSize: TextSize;
}

/** Tamaño máximo aceptado del texto guardado (protege de datos manipulados enormes). */
export const SETTINGS_MAX_RAW_LENGTH = 4096;
