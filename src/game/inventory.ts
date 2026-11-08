import { ITEM_BALANCE, type ChestContents } from '../data/items';
import { ZONES, STORY_ZONES } from '../data/zones';
import { heal, type HealthState } from './health';
import { maxHearts, type Progress } from './progress';

/** Lo que resultó de abrir un cofre (lo muestra la interfaz). */
export interface GrantResult {
  readonly contents: ChestContents;
  /** Se completó un corazón con este fragmento. */
  readonly heartGained: boolean;
  /** Ya se tenía el máximo: se convirtió en chispas o se perdió lo que no cabía. */
  readonly overflow: boolean;
}

/** Valor en chispas de una mejora que ya no se puede aplicar (temple al máximo). */
const TEMPLE_OVERFLOW_SPARKS = 50;

export function addSparks(progress: Progress, amount: number): number {
  const before = progress.sparks;
  progress.sparks = Math.min(ITEM_BALANCE.maxSparks, Math.max(0, progress.sparks + Math.round(amount)));
  return progress.sparks - before;
}

/** Aplica el contenido de un cofre al progreso. */
export function grant(progress: Progress, contents: ChestContents): GrantResult {
  let heartGained = false;
  let overflow = false;
  switch (contents.kind) {
    case 'sparks':
      addSparks(progress, contents.amount);
      break;
    case 'temple':
      if (progress.temple < ITEM_BALANCE.temple.maxLevel) {
        progress.temple++;
      } else {
        addSparks(progress, TEMPLE_OVERFLOW_SPARKS);
        overflow = true;
      }
      break;
    case 'fragment': {
      const before = maxHearts(progress);
      progress.fragments++;
      heartGained = maxHearts(progress) > before;
      break;
    }
    case 'key':
      if (!progress.keys.includes(contents.key)) progress.keys.push(contents.key);
      break;
    case 'potion': {
      const room = ITEM_BALANCE.potion.maxCarried - progress.potions;
      const added = Math.min(room, contents.amount);
      progress.potions += added;
      overflow = added < contents.amount;
      if (overflow) addSparks(progress, (contents.amount - added) * ITEM_BALANCE.potion.sellPrice);
      break;
    }
  }
  return { contents, heartGained, overflow };
}

/** Marca un cofre como abierto. Devuelve false si ya lo estaba o si no existe en los datos. */
export function openChest(progress: Progress, chestId: string): GrantResult | null {
  if (progress.chests.includes(chestId)) return null;
  const chest = findChest(chestId);
  if (!chest) return null;
  progress.chests.push(chestId);
  return grant(progress, chest.contents);
}

/** Busca un cofre en todas las zonas de la aventura. */
export function findChest(chestId: string): (typeof ZONES)['lumbre']['chests'][number] | null {
  for (const zone of STORY_ZONES) {
    const chest = ZONES[zone].chests.find((c) => c.id === chestId);
    if (chest) return chest;
  }
  return null;
}

/** Bebe una poción: cura y gasta una. No se gasta si la vida ya está llena o si el jugador cayó. */
export function usePotion(progress: Progress, health: HealthState): boolean {
  if (progress.potions <= 0) return false;
  const healed = heal(health, ITEM_BALANCE.potion.healQuarters);
  if (healed <= 0) return false;
  progress.potions--;
  return true;
}
