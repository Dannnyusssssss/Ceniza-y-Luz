import type { SettingsStore } from '../core/settingsStore';
import { ENEMY_KINDS } from '../data/enemies';
import type { EncounterEvent } from '../game/encounter';
import { FlashLimiter } from '../game/feedback';
import type { Sfx } from '../audio/sfx';
import type { EncounterView } from '../render/encounterView';

/** Lo que el combate avisa a la partida. */
export interface CombatHooks {
  onCancelCombo(): void;
  onSparks(count: number): void;
  onRetryReady(): void;
  onWave(kind: 'waveStarted' | 'waveCleared', wave: number): void;
}

/**
 * Sonido, destellos y sacudida de lo que pasa en el combate. Aquí se aplica el límite de seguridad:
 * como mucho 3 destellos por segundo y ninguno con "Reducir parpadeo".
 */
export class CombatFeedback {
  /** Reloj de la lógica (segundos de juego, no de pared). */
  clock = 0;
  flashStart = Number.NEGATIVE_INFINITY;
  shakeStart = Number.NEGATIVE_INFINITY;
  hurtTintStart = Number.NEGATIVE_INFINITY;
  private readonly limiter = new FlashLimiter();
  private sparkNote = 0;

  constructor(
    private readonly settings: SettingsStore,
    private readonly sfx: Sfx,
    private readonly view: EncounterView,
    private readonly hooks: CombatHooks,
  ) {}

  /** Destello de golpe, si "Reducir parpadeo" no está activo y no se superan 3 por segundo. */
  tryFlash(): boolean {
    return !this.settings.value.reduceFlashing && this.limiter.tryFlash(this.clock);
  }

  shake(): void {
    this.shakeStart = this.clock;
  }

  /** Atiende los eventos de un paso. Devuelve true si un golpe del jugador conectó. */
  handle(events: readonly EncounterEvent[]): boolean {
    let impact = false;
    const reduceMotion = this.settings.value.reduceMotion;
    for (const e of events) {
      switch (e.type) {
        case 'enemyHit':
          impact = true;
          this.sfx.play(e.killed ? 'kill' : 'hit');
          if (this.tryFlash()) this.view.flashEnemy(e.id);
          break;
        case 'enemyWindup':
          this.sfx.play('warn', ENEMY_KINDS.indexOf(e.kind));
          break;
        case 'enemyAttack':
          if (e.kind === 'coloso') {
            this.sfx.play('slam');
            this.shake();
          } else if (e.kind !== 'tirador') {
            this.sfx.play('dodge');
          }
          break;
        case 'projectileFired':
          this.sfx.play('shoot');
          break;
        case 'projectileEnded':
          this.view.burst(e.x, e.z, reduceMotion);
          if (e.how === 'cut') this.sfx.play('cut');
          break;
        case 'playerHit':
          this.hooks.onCancelCombo();
          this.sfx.play('hurt');
          this.shake();
          if (this.tryFlash()) this.hurtTintStart = this.clock;
          break;
        case 'playerDown':
          this.sfx.play('down');
          break;
        case 'retryReady':
          this.hooks.onRetryReady();
          break;
        case 'sparksCollected':
          this.hooks.onSparks(e.count);
          this.sfx.play('spark', this.sparkNote++ % 5);
          break;
        case 'waveStarted':
          this.sfx.play('wave');
          this.hooks.onWave('waveStarted', e.number);
          break;
        case 'waveCleared':
          this.hooks.onWave('waveCleared', e.number);
          break;
        case 'enemySpawned':
          break;
      }
    }
    return impact;
  }
}
