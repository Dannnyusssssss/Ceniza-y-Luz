import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { AdventureEvent } from '../game/adventure';
import type { GuardianEvent, GuardianState } from '../game/guardian';
import type { CombatFeedback } from './combatFeedback';
import type { SessionView } from './sessionView';

/** Lo que necesitan los efectos de sonido y de pantalla. */
export interface EffectTargets {
  readonly sfx: Sfx;
  readonly music: Music;
  readonly feedback: CombatFeedback;
  readonly view: SessionView;
  readonly reduceMotion: boolean;
}

/** Sonido y efectos de usar un objeto. Lo que cambia la partida lo hace quien llama. */
export function playAdventureEffects(t: EffectTargets, e: AdventureEvent): void {
  switch (e.type) {
    case 'talk':
    case 'read':
      t.sfx.play('talk');
      break;
    case 'chestOpened':
      t.sfx.play('open');
      break;
    case 'bladeTaken':
      t.sfx.play('blade');
      t.view.setBladeVisible(true);
      break;
    case 'abilityLearned':
      t.sfx.play('learn');
      break;
    case 'gateShattered':
      t.sfx.play('shatter');
      t.view.encounterView.burst(e.x, e.z, t.reduceMotion);
      break;
    case 'gateOpened':
      t.sfx.play('door');
      break;
    case 'gateLocked':
    case 'blockStuck':
      t.sfx.play('wrong');
      break;
    case 'switchPressed':
      t.sfx.play(e.result === 'wrong' ? 'wrong' : 'click');
      break;
    case 'blockPushed':
      t.sfx.play('push');
      break;
    case 'puzzleSolved':
      t.sfx.play('solved');
      break;
    case 'puzzleReset':
      t.sfx.play('click');
      break;
    case 'rest':
      break;
  }
}

/** Efectos de lo que hace el jefe. Toda señal sonora tiene también señal visual: zonas en el suelo y avisos. */
export function playGuardianEffects(
  t: EffectTargets,
  guardian: GuardianState | null,
  e: GuardianEvent,
): void {
  switch (e.type) {
    case 'guardianAwake':
    case 'guardianStage':
      t.sfx.play('bossStage');
      if (e.type === 'guardianAwake') t.music.setBoss(true);
      break;
    case 'guardianWindup':
      t.sfx.play('bossWarn', ['sweep', 'spikes', 'shards'].indexOf(e.attack));
      break;
    case 'guardianStrike':
      if (e.attack !== 'shards') {
        t.sfx.play('slam');
        t.feedback.shake();
      }
      break;
    case 'guardianHit':
      t.sfx.play('hit');
      if (t.feedback.tryFlash()) t.view.flashGuardian();
      break;
    case 'guardianBlocked':
      t.sfx.play('wrong');
      break;
    case 'guardianArmorBroken':
      t.sfx.play('shatter');
      t.feedback.shake();
      if (guardian) t.view.encounterView.burst(guardian.x, guardian.z, t.reduceMotion);
      break;
    case 'guardianArmorBack':
      t.sfx.play('warn', 2);
      break;
    case 'guardianDying':
      t.sfx.play('kill');
      t.music.setBoss(false);
      break;
    case 'guardianDefeated':
      t.sfx.play('solved');
      break;
    case 'guardianReset':
      t.music.setBoss(false);
      break;
  }
}
