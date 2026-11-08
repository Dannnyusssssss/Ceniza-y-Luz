/** Los gemelos protagonistas. El elegido juega; el otro es el raptado. La jugabilidad es idéntica. */

export type CharacterId = 'alba' | 'ciro';

export interface CharacterColors {
  readonly skin: string;
  readonly hair: string;
  readonly eyes: string;
  /** Prenda principal y su tono oscuro. */
  readonly outfit: string;
  readonly outfitDark: string;
  /** Detalles (cinturón, bordes) y la capa o bufanda. */
  readonly accent: string;
  readonly cloth: string;
  readonly pants: string;
  readonly boots: string;
}

export interface CharacterData {
  readonly id: CharacterId;
  readonly name: string;
  readonly siblingId: CharacterId;
  /** Línea corta para la pantalla de elección. */
  readonly tagline: string;
  readonly colors: CharacterColors;
  readonly hairStyle: 'longLoose' | 'shortSpiky';
  readonly accessory: 'cape' | 'scarf';
  /** Escala de altura (Ciro un poco más alto). */
  readonly heightScale: number;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterData>> = {
  alba: {
    id: 'alba',
    name: 'Alba',
    siblingId: 'ciro',
    tagline: 'Pelo largo al viento y capa de color ámbar.',
    colors: {
      skin: '#f1c6a4',
      hair: '#8a3a2c',
      eyes: '#2b1d2e',
      outfit: '#e8734f',
      outfitDark: '#a8452f',
      accent: '#f4bd4f',
      cloth: '#f2a93b',
      pants: '#4a3a5c',
      boots: '#5b3a29',
    },
    hairStyle: 'longLoose',
    accessory: 'cape',
    heightScale: 1,
  },
  ciro: {
    id: 'ciro',
    name: 'Ciro',
    siblingId: 'alba',
    tagline: 'Pelo en punta y bufanda larga de color índigo.',
    colors: {
      skin: '#f1c6a4',
      hair: '#222a44',
      eyes: '#1d2230',
      outfit: '#2fa39a',
      outfitDark: '#2b3f78',
      accent: '#a6e6dc',
      cloth: '#4058b8',
      pants: '#2e2a3a',
      boots: '#4a3426',
    },
    hairStyle: 'shortSpiky',
    accessory: 'scarf',
    heightScale: 1.04,
  },
};

export const CHARACTER_IDS: readonly CharacterId[] = ['alba', 'ciro'];

/** La Hoja de Luz: arma de los dos gemelos. */
export const BLADE_COLORS = {
  blade: '#fff1b8',
  hilt: '#6b4b2e',
  guard: '#e8c25a',
} as const;

export function isCharacterId(value: unknown): value is CharacterId {
  return value === 'alba' || value === 'ciro';
}
