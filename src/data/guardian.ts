/** El Guardián de Cristal: tiempos, daños y patrones. Unidades: metros, segundos; daño en cuartos de corazón. */

export type GuardianAttack = 'sweep' | 'spikes' | 'shards';

export const GUARDIAN = {
  name: 'Guardián de Cristal',
  maxHealth: 420,
  radius: 1.3,
  speed: 2.1,
  /** Tiempo que tarda en despertar al entrar en la sala. */
  awaken: 1.8,
  /** Espera entre ataques: el momento de acercarse. */
  stalk: 1.3,
  /** Por debajo de esta fracción de vida empieza la segunda fase. */
  secondStageAt: 0.5,
  /** Lo que dura el cambio de fase: se ve venir y no ataca. */
  shielding: 1.8,
  /** Tiempo aturdido al romperle la coraza: el daño cuenta más. */
  stagger: 3.2,
  staggerDamageFactor: 1.5,
  /** Lo que tarda en volver a cubrirse tras romperle la coraza. */
  armorDownTime: 10,
  dissolve: 2.6,
  /** Se le rompe la coraza si la carrera pasa a esta distancia de su borde. */
  dashHitMargin: 0.9,
  sparks: [40, 60],
  /** Patrones fijos: se repiten en este orden, así se aprenden. */
  patterns: {
    1: ['sweep', 'sweep', 'spikes'],
    2: ['shards', 'sweep', 'spikes', 'shards', 'spikes'],
  } as const satisfies Readonly<Record<1 | 2, readonly GuardianAttack[]>>,
  attacks: {
    sweep: { windup: 1.15, active: 0.45, recover: 1.5, damage: 4, reach: 4.4, halfArc: 1.35 },
    spikes: { windup: 1.35, active: 0.5, recover: 1.1, damage: 3, radius: 1.7, count: 4, spread: 2.6 },
    shards: {
      windup: 1.0,
      active: 0.3,
      recover: 1.0,
      damage: 2,
      count: 5,
      arc: 0.95,
      speed: 9,
      radius: 0.34,
      lifetime: 2.6,
    },
  },
} as const;
