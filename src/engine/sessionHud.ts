import { GUARDIAN } from '../data/guardian';
import { REGENT } from '../data/regent';
import type { AbilityState } from '../game/abilities';
import type { Interactable } from '../game/adventure';
import { aliveEnemies, type EncounterState } from '../game/encounter';
import { isGuardianActive, type GuardianState } from '../game/guardian';
import { isRegentActive, type RegentState } from '../game/regent';
import { currentObjective, type ObjectiveId } from '../game/objectives';
import type { PlayerState } from '../game/player';
import type { Progress } from '../game/progress';
import { waveNumber } from '../game/waves';
import type { ZoneData } from '../data/zones';

/** A esta distancia del muñeco se muestra su vida en el HUD. */
const DUMMY_HUD_DISTANCE = 9;

/** Lo que muestra el HUD en cada fotograma. */
export interface HudSnapshot {
  readonly quarters: number;
  readonly maxQuarters: number;
  readonly sparks: number;
  readonly potions: number;
  /** Oleada actual (null fuera de la arena). */
  readonly wave: number | null;
  /** Segundos hasta la siguiente oleada (null si se está luchando). */
  readonly nextWaveIn: number | null;
  readonly enemies: number;
  readonly dodgeReady: boolean;
  /** Lo que se puede usar ahora con E. */
  readonly prompt: Interactable | null;
  /** Qué le toca hacer al jugador (null en la arena). */
  readonly objective: ObjectiveId | null;
  /** El muñeco está cerca y conviene mostrar su vida. */
  readonly dummyNear: boolean;
  /** Segundos de espera de cada habilidad; null si aún no se ha aprendido. */
  readonly pulseWait: number | null;
  readonly dashWait: number | null;
  /** El jefe, mientras se lucha contra él. */
  readonly boss: {
    readonly name: string;
    readonly health: number;
    readonly maxHealth: number;
    readonly armored: boolean;
    readonly staggered: boolean;
    /** El velo del Regente: cuántos braseros van encendidos. Null en el resto de los casos. */
    readonly veil: { readonly lit: number; readonly total: number } | null;
    readonly isRegent: boolean;
  } | null;
}

/** Reúne lo que necesita el HUD a partir del estado de la partida. */
export function buildHudSnapshot(s: {
  readonly encounter: EncounterState;
  readonly progress: Progress;
  readonly player: PlayerState;
  readonly zone: ZoneData;
  readonly abilities: AbilityState;
  readonly guardian: GuardianState | null;
  readonly regent: RegentState | null;
  readonly prompt: Interactable | null;
  readonly arena: boolean;
}): HudSnapshot {
  const { encounter: e, progress, player, zone, abilities, guardian: g, regent: r, arena } = s;
  const dummy = zone.dummy;
  return {
    quarters: e.health.quarters,
    maxQuarters: e.health.maxQuarters,
    sparks: progress.sparks,
    potions: progress.potions,
    wave: arena ? waveNumber(e.waves) : null,
    nextWaveIn: arena && e.waves.phase === 'waiting' ? Math.max(0, e.waves.timer) : null,
    enemies: aliveEnemies(e),
    dodgeReady: player.dodge.phase === 'ready',
    prompt: s.prompt,
    objective: arena ? null : currentObjective(progress),
    dummyNear: dummy !== null && Math.hypot(player.x - dummy.x, player.z - dummy.z) < DUMMY_HUD_DISTANCE,
    pulseWait: progress.abilities.includes('pulso') ? abilities.pulseCooldown : null,
    dashWait: progress.abilities.includes('impulso') ? abilities.dashCooldown : null,
    boss:
      r && isRegentActive(r)
        ? {
            name: REGENT.name,
            health: r.health,
            maxHealth: REGENT.maxHealth,
            armored: r.veiled,
            staggered: r.phase === 'stagger',
            veil: r.veiled ? { lit: r.braziers.filter(Boolean).length, total: r.braziers.length } : null,
            isRegent: true,
          }
        : g && isGuardianActive(g)
          ? {
              name: GUARDIAN.name,
              health: g.health,
              maxHealth: GUARDIAN.maxHealth,
              armored: g.armored,
              staggered: g.phase === 'stagger',
              veil: null,
              isRegent: false,
            }
          : null,
  };
}
