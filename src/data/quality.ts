import type { QualityLevel } from './settings';

/** Parámetros de render de cada nivel de calidad. */
export interface QualityPreset {
  /** Divisor de la resolución interna (1 = nativa, 1.5 = un 33 % menos de píxeles por eje). */
  readonly hardwareScaling: number;
  /** Tamaño del mapa de sombras en píxeles. */
  readonly shadowMapSize: number;
  /** Filtrado suave de sombras (PCF). */
  readonly softShadows: boolean;
  readonly bloom: boolean;
  /** Muestras de antialiasing del pipeline (1 = sin MSAA). */
  readonly msaaSamples: number;
  readonly fxaa: boolean;
  /** Haces de luz en las zonas oscuras (mallas brillantes). */
  readonly lightShafts: boolean;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: {
    hardwareScaling: 1.5,
    shadowMapSize: 512,
    softShadows: false,
    bloom: false,
    msaaSamples: 1,
    fxaa: true,
    lightShafts: false,
  },
  medium: {
    hardwareScaling: 1,
    shadowMapSize: 1024,
    softShadows: true,
    bloom: true,
    msaaSamples: 1,
    fxaa: true,
    lightShafts: true,
  },
  high: {
    hardwareScaling: 1,
    shadowMapSize: 2048,
    softShadows: true,
    bloom: true,
    msaaSamples: 4,
    fxaa: true,
    lightShafts: true,
  },
};

/** Cuándo baja la resolución interna si el equipo no llega a los FPS mínimos. */
export const DYNAMIC_RESOLUTION = {
  minFps: 50,
  /** Segundos de cada tramo de medida. */
  windowSeconds: 5,
  /** Tramos lentos seguidos antes de actuar: un bajón corto no cuenta. */
  windowsNeeded: 2,
  step: 0.1,
  minScale: 0.6,
  /** Un fotograma más largo que esto es un parón suelto, no falta de potencia. */
  maxFrameSeconds: 0.5,
  /** Con un tope de FPS bajo, el mínimo pasa a ser esta fracción del tope. */
  limitMargin: 0.83,
  /** Tope del divisor de resolución: por encima, la imagen se vuelve ilegible. */
  maxScaling: 2,
} as const;

/** Divisor de resolución final: el de la calidad elegida, más lo que haya bajado la escala dinámica. */
export function renderScaling(preset: QualityPreset, resolutionScale: number): number {
  return Math.min(DYNAMIC_RESOLUTION.maxScaling, preset.hardwareScaling / resolutionScale);
}

/** Presupuestos de render por zona (`ARCHITECTURE.md` interno: luces, sombras y llamadas de dibujo). */
export const ZONE_BUDGET = {
  maxLights: 4,
  maxShadowGenerators: 1,
  maxDrawCalls: 150,
} as const;

/** Ajustes fijos del pipeline de efectos. */
export const POST_FX = {
  bloomThreshold: 0.75,
  bloomWeight: 0.3,
  bloomKernel: 48,
  bloomScale: 0.5,
  vignetteWeight: 1.6,
  exposure: 1.0,
  contrast: 1.1,
} as const;
