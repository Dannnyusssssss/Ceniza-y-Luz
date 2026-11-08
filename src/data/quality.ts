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
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: {
    hardwareScaling: 1.5,
    shadowMapSize: 512,
    softShadows: false,
    bloom: false,
    msaaSamples: 1,
    fxaa: true,
  },
  medium: {
    hardwareScaling: 1,
    shadowMapSize: 1024,
    softShadows: true,
    bloom: true,
    msaaSamples: 1,
    fxaa: true,
  },
  high: {
    hardwareScaling: 1,
    shadowMapSize: 2048,
    softShadows: true,
    bloom: true,
    msaaSamples: 4,
    fxaa: true,
  },
};

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
