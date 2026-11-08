import type { NpcId } from './zones';

/** Colores de un aldeano: los usa Blender al generar el modelo. */
export interface NpcColors {
  readonly skin: string;
  readonly hair: string;
  readonly eyes: string;
  readonly iris: string;
  readonly outfit: string;
  readonly outfitDark: string;
  readonly accent: string;
  readonly pants: string;
  readonly boots: string;
}

export interface NpcLook {
  readonly id: NpcId;
  readonly name: string;
  /** Oficio que se muestra junto al nombre. */
  readonly role: string;
  readonly colors: NpcColors;
  /** Silueta del cuerpo base y estilo de la cara. */
  readonly build: 'alba' | 'ciro';
  /** Escala en el juego (Teo es más bajo). */
  readonly heightScale: number;
}

export const NPCS: Readonly<Record<NpcId, NpcLook>> = {
  ilse: {
    id: 'ilse',
    name: 'Ilse',
    role: 'guardiana del santuario',
    build: 'alba',
    heightScale: 0.98,
    colors: {
      skin: '#eebfa0',
      hair: '#d9d4e4',
      eyes: '#2a2233',
      iris: '#7a6bb8',
      outfit: '#6d5aa8',
      outfitDark: '#47396f',
      accent: '#f2d27a',
      pants: '#3a3050',
      boots: '#4a3a44',
    },
  },
  oren: {
    id: 'oren',
    name: 'Oren',
    role: 'mercader',
    build: 'ciro',
    heightScale: 1.03,
    colors: {
      skin: '#d9a57f',
      hair: '#4a2f22',
      eyes: '#231a1a',
      iris: '#8a5a2c',
      outfit: '#c9722e',
      outfitDark: '#7a3f22',
      accent: '#e8d9a8',
      pants: '#3f3a34',
      boots: '#3d2a1f',
    },
  },
  teo: {
    id: 'teo',
    name: 'Teo',
    role: 'aprendiz',
    build: 'ciro',
    heightScale: 0.82,
    colors: {
      skin: '#f3cdaa',
      hair: '#c96f2e',
      eyes: '#22302a',
      iris: '#3f9a5e',
      outfit: '#5fae55',
      outfitDark: '#3b7a43',
      accent: '#f4e29a',
      pants: '#5a4a38',
      boots: '#5b3a29',
    },
  },
};

export const NPC_IDS: readonly NpcId[] = ['ilse', 'oren', 'teo'];
