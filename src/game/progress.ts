import { HEALTH_BALANCE } from '../data/balance';
import type { CharacterId } from '../data/characters';
import { ITEM_BALANCE, type AbilityId, type KeyId, type SpecialId } from '../data/items';
import {
  FIRST_BEACON,
  FIRST_ENTRY,
  FIRST_ZONE,
  type BossId,
  type StoryFlag,
  type ZoneId,
} from '../data/zones';

/** Un lugar al que se puede volver: una zona y uno de sus puntos de llegada. */
export interface Place {
  zone: ZoneId;
  entry: string;
}

/** Todo lo que el jugador conserva durante la aventura; es lo que se guarda. */
export interface Progress {
  character: CharacterId;
  /** Dónde continúa la partida al cargarla. */
  place: Place;
  /** Dónde reaparece al caer (último faro). */
  respawn: Place;
  /** Vida al guardar, en cuartos. */
  quarters: number;
  sparks: number;
  /** Nivel de la Hoja (temple), de 1 a 5. */
  temple: number;
  /** Fragmentos de corazón encontrados (cada 4, un corazón). */
  fragments: number;
  potions: number;
  keys: KeyId[];
  specials: SpecialId[];
  abilities: AbilityId[];
  chests: string[];
  puzzles: string[];
  gates: string[];
  bosses: BossId[];
  flags: StoryFlag[];
}

export function createProgress(character: CharacterId): Progress {
  return {
    character,
    place: { zone: FIRST_ZONE, entry: FIRST_ENTRY },
    respawn: { ...FIRST_BEACON },
    quarters: HEALTH_BALANCE.startHearts * HEALTH_BALANCE.quartersPerHeart,
    sparks: 0,
    temple: ITEM_BALANCE.temple.minLevel,
    fragments: 0,
    potions: 0,
    keys: [],
    specials: [],
    abilities: [],
    chests: [],
    puzzles: [],
    gates: [],
    bosses: [],
    flags: [],
  };
}

export function hasFlag(progress: Progress, flag: StoryFlag): boolean {
  return progress.flags.includes(flag);
}

export function setFlag(progress: Progress, flag: StoryFlag): void {
  if (!progress.flags.includes(flag)) progress.flags.push(flag);
}

/** Corazones máximos: los iniciales más uno por cada 4 fragmentos. */
export function maxHearts(progress: Pick<Progress, 'fragments'>): number {
  return HEALTH_BALANCE.startHearts + Math.floor(progress.fragments / ITEM_BALANCE.fragmentsPerHeart);
}

/** Vida máxima en cuartos. */
export function maxQuarters(progress: Pick<Progress, 'fragments'>): number {
  return maxHearts(progress) * HEALTH_BALANCE.quartersPerHeart;
}

/** Multiplicador de daño según el temple de la Hoja. */
export function templeFactor(temple: number): number {
  const { damageFactors, minLevel, maxLevel } = ITEM_BALANCE.temple;
  const level = Math.min(Math.max(Math.round(temple), minLevel), maxLevel);
  return damageFactors[level - minLevel] ?? 1;
}

/** Fracción de la espera de la esquiva con lo que lleva el jugador. */
export function dodgeCooldownFactor(progress: Pick<Progress, 'specials'>): number {
  return progress.specials.includes('talisman') ? ITEM_BALANCE.talisman.dodgeCooldownFactor : 1;
}
