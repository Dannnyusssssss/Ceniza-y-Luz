import type { Music } from '../audio/music';
import type { Sfx } from '../audio/sfx';
import type { ZoneData } from '../data/zones';
import { defeatBoss, type AdventureEvent, type AdventureState } from '../game/adventure';
import { clearCombat, spawnZoneEnemies, type EncounterState } from '../game/encounter';
import { resetGuardian, type GuardianEvent, type GuardianState } from '../game/guardian';
import { resetHealth, setLife } from '../game/health';
import type { PlayerState } from '../game/player';
import { maxQuarters } from '../game/progress';
import { resetRegent, type RegentEvent, type RegentState } from '../game/regent';
import type { CombatFeedback } from './combatFeedback';
import {
  playAdventureEffects,
  playGuardianEffects,
  playRegentEffects,
  type EffectTargets,
} from './sessionEffects';
import type { SessionView } from './sessionView';

/** Lo que estos avisos necesitan de la partida. */
export interface EventsHost {
  readonly sfx: Sfx;
  readonly music: Music;
  readonly feedback: CombatFeedback;
  readonly view: SessionView;
  readonly encounter: EncounterState;
  readonly player: PlayerState;
  readonly adventure: AdventureState;
  readonly guardian: GuardianState | null;
  readonly regent: RegentState | null;
  readonly reduceMotion: boolean;
  onAdventure(event: AdventureEvent): void;
  onGuardian(event: GuardianEvent): void;
  onRegent(event: RegentEvent): void;
}

/** Atiende lo que pasa en el mundo y con los jefes: sonido, efectos y consecuencias. Los textos los pone la interfaz. */
export class SessionEvents {
  constructor(private readonly host: EventsHost) {}

  private effects(): EffectTargets {
    const { sfx, music, feedback, view, reduceMotion } = this.host;
    return { sfx, music, feedback, view, reduceMotion };
  }

  guardian(events: readonly GuardianEvent[]): void {
    const { host } = this;
    for (const e of events) {
      playGuardianEffects(this.effects(), host.guardian, e);
      if (e.type === 'guardianDefeated' && host.guardian) {
        this.adventure(defeatBoss(host.adventure, host.guardian.data.id));
      }
      host.onGuardian(e);
    }
  }

  regent(events: readonly RegentEvent[]): void {
    const { host } = this;
    for (const e of events) {
      playRegentEffects(this.effects(), host.regent, e);
      if (e.type === 'regentDefeated' && host.regent) {
        this.adventure(defeatBoss(host.adventure, host.regent.data.id));
      }
      host.onRegent(e);
    }
  }

  adventure(events: readonly AdventureEvent[]): void {
    const { host } = this;
    for (const e of events) {
      playAdventureEffects(this.effects(), e);
      if (e.type === 'talk') this.faceNpc(host.adventure.zone, e.npc);
      if (e.type === 'rest') this.rest();
      if (e.type === 'chestOpened' && e.result.heartGained) {
        const max = maxQuarters(host.adventure.progress);
        setLife(host.encounter.health, max, max);
      }
      host.onAdventure(e);
    }
  }

  private faceNpc(zone: ZoneData, id: ZoneData['npcs'][number]['id']): void {
    const npc = zone.npcs.find((n) => n.id === id);
    if (!npc) return;
    const p = this.host.player;
    p.yaw = p.prevYaw = Math.atan2(npc.x - p.x, npc.z - p.z);
    this.host.view.setTalking(id, p.x, p.z);
  }

  /** Descansar: cura, y los enemigos de la zona vuelven a su sitio. */
  private rest(): void {
    const { host } = this;
    host.sfx.play('rest');
    resetHealth(host.encounter.health);
    host.view.encounterView.clear();
    clearCombat(host.encounter);
    spawnZoneEnemies(host.encounter, host.adventure.zone.enemies);
    if (host.guardian) resetGuardian(host.guardian);
    if (host.regent) resetRegent(host.regent);
  }
}
