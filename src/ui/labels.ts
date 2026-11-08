import { CHARACTERS } from '../data/characters';
import { ITEM_BALANCE } from '../data/items';
import { NPCS } from '../data/npcs';
import { puzzleById } from '../data/puzzles';
import { TEXTS, type Speaker } from '../data/texts';
import { gateRequirementMet, type AdventureEvent, type Interactable } from '../game/adventure';
import type { Progress } from '../game/progress';
import { ZONES } from '../data/zones';

/** Texto de lo que se puede hacer con E. */
export function promptText(item: Interactable, progress: Progress): string {
  const t = TEXTS.prompts;
  switch (item.kind) {
    case 'npc':
      return t.talk(NPCS[item.id].name);
    case 'chest':
      return t.chest;
    case 'beacon':
      return t.beacon;
    case 'altar':
      return t.altar;
    case 'sign':
      return t.sign;
    case 'gate': {
      const gate = ZONES[progress.place.zone].gates.find((g) => g.id === item.id);
      const canOpen = gate && gate.opens.kind === 'key' && gateRequirementMet(progress, gate.opens);
      return canOpen ? t.gateKey : t.gate;
    }
    case 'switch': {
      const data = puzzleById(item.puzzle);
      const symbol =
        data?.kind === 'sequence' ? data.switches.find((s) => s.id === item.id)?.symbol : undefined;
      return t.switchStone(symbol ? TEXTS.symbols[symbol] : '');
    }
    case 'block':
      return t.block;
    case 'reset':
      return t.reset;
  }
}

/** Aviso en pantalla de lo que acaba de pasar; null si no hace falta (los diálogos tienen su propia pantalla). */
export function adventureMessage(event: AdventureEvent, progress: Progress): string | null {
  const t = TEXTS.world;
  switch (event.type) {
    case 'chestOpened': {
      const { contents, heartGained, overflow } = event.result;
      switch (contents.kind) {
        case 'sparks':
          return t.chest.sparks(contents.amount);
        case 'temple':
          return overflow ? t.chest.templeFull : t.chest.temple(progress.temple);
        case 'fragment':
          return heartGained
            ? t.chest.heart
            : t.chest.fragment(
                progress.fragments % ITEM_BALANCE.fragmentsPerHeart,
                ITEM_BALANCE.fragmentsPerHeart,
              );
        case 'key':
          return t.chest.key;
        case 'potion':
          return overflow ? t.chest.potionFull : t.chest.potion(contents.amount);
      }
      break;
    }
    case 'bladeTaken':
      return t.bladeTaken;
    case 'gateOpened':
      return event.byKey ? t.gateOpen : null;
    case 'gateLocked':
      return t.gateLocked[event.opens.kind];
    case 'switchPressed':
      return event.result === 'wrong' ? t.switchWrong : event.result === 'advance' ? t.switchOk : null;
    case 'blockStuck':
      return t.blockStuck;
    case 'puzzleSolved':
      return t.puzzleSolved;
    case 'puzzleReset':
      return t.puzzleReset;
    case 'talk':
    case 'read':
    case 'rest':
    case 'blockPushed':
      return null;
  }
  return null;
}

/** Nombre que se muestra sobre una línea de diálogo. El narrador no tiene nombre. */
export function speakerName(speaker: Speaker, progress: Progress): string {
  const me = CHARACTERS[progress.character];
  switch (speaker) {
    case 'player':
      return me.name;
    case 'sibling':
      return CHARACTERS[me.siblingId].name;
    case 'narrator':
      return '';
    default:
      return NPCS[speaker].name;
  }
}
