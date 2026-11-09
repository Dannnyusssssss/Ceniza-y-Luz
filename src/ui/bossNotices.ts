import { CHARACTERS, type CharacterId } from '../data/characters';
import { REGENT } from '../data/regent';
import { TEXTS } from '../data/texts';
import type { GuardianEvent } from '../game/guardian';
import type { RegentEvent } from '../game/regent';
import type { Hud } from './hud';

/** Avisos del Guardián en pantalla: toda señal sonora tiene también su señal visual. */
export function showGuardianNotice(hud: Hud, event: GuardianEvent): void {
  const t = TEXTS.world.guardian;
  switch (event.type) {
    case 'guardianAwake':
      hud.showBanner(t.awake);
      break;
    case 'guardianWindup':
      hud.showBanner(t.windup[event.attack]);
      break;
    case 'guardianStage':
      hud.showBanner(t.stage);
      break;
    case 'guardianBlocked':
      hud.showMessage(t.blocked);
      break;
    case 'guardianArmorBroken':
      hud.showBanner(t.broken);
      break;
    case 'guardianArmorBack':
      hud.showMessage(t.armorBack);
      break;
    case 'guardianReset':
      hud.showMessage(t.reset);
      break;
    case 'guardianDefeated':
      hud.showMessage(t.defeated);
      break;
  }
}

/** Avisos del Regente en pantalla: toda señal sonora tiene también su señal visual. */
export function showRegentNotice(hud: Hud, event: RegentEvent, character: CharacterId): void {
  const t = TEXTS.world.regent;
  switch (event.type) {
    case 'regentAwake':
      hud.showBanner(t.awake);
      break;
    case 'regentWindup':
      hud.showBanner(t.windup[event.attack]);
      break;
    case 'regentStage':
      if (event.stage !== 1) hud.showBanner(t.stage[event.stage]);
      break;
    case 'regentBlocked':
      hud.showMessage(t.blocked);
      break;
    case 'regentBrazierLit':
      hud.showMessage(t.brazier(event.lit, REGENT.braziers.length));
      break;
    case 'regentVeilBroken':
      hud.showBanner(t.broken);
      break;
    case 'regentVeilBack':
      hud.showMessage(t.veilBack);
      break;
    case 'regentReset':
      hud.showMessage(t.reset);
      break;
    case 'regentDefeated':
      hud.showMessage(t.defeated(CHARACTERS[CHARACTERS[character].siblingId].name));
      break;
  }
}
