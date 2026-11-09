/** El Regente del Eclipse: tiempos, daños y patrones. Unidades: metros, segundos; daño en cuartos de corazón. */

export type RegentAttack = 'sweep' | 'lunge' | 'volley' | 'summon' | 'rings';
export type RegentStage = 1 | 2 | 3;

export const REGENT = {
  name: 'Regente del Eclipse',
  maxHealth: 1250,
  radius: 1.1,
  speed: 2.5,
  /** Tiempo que tarda en reaccionar al entrar en la sala. */
  awaken: 2.2,
  /** Espera entre ataques: el momento de acercarse. */
  stalk: 1.15,
  /** Fracción de vida a la que empieza cada fase. */
  stageAt: { 2: 2 / 3, 3: 1 / 3 },
  /** Lo que dura un cambio de fase: se ve venir y no ataca. */
  transition: 2.4,
  /** Tiempo aturdido al romperle el velo: el daño cuenta más. */
  stagger: 3.6,
  staggerDamageFactor: 1.5,
  /** Lo que tarda el velo en volver tras romperse. */
  veilBack: 12,
  dissolve: 3.4,
  /** Segundos en los que la sala se oscurece en la tercera fase: siempre gradual, nunca de golpe. */
  eclipseFade: 5,
  /** Cuánta luz se pierde con el eclipse completo (0 a 1). */
  eclipseDim: 0.42,
  sparks: [70, 100],
  /** Máximo de Brumillas invocadas a la vez. */
  minions: 2,
  /** Dónde aparecen las Brumillas, medido desde el Regente. */
  summonDistance: 3,
  /** Braseros de la sala: se encienden con el Pulso para romper el velo. */
  braziers: [
    { x: -13, z: 24 },
    { x: 13, z: 24 },
    { x: 0, z: 36 },
  ],
  /** Patrones fijos: se repiten en este orden, así se aprenden. */
  patterns: {
    1: ['sweep', 'lunge', 'sweep', 'volley'],
    2: ['volley', 'summon', 'sweep', 'volley', 'lunge'],
    3: ['rings', 'lunge', 'sweep', 'rings', 'volley', 'lunge'],
  } as const satisfies Readonly<Record<RegentStage, readonly RegentAttack[]>>,
  attacks: {
    sweep: { windup: 1.05, active: 0.42, recover: 1.35, damage: 4, reach: 4.6, halfArc: 1.25 },
    lunge: { windup: 1.2, active: 0.5, recover: 1.7, damage: 4, length: 12, halfWidth: 1.25 },
    volley: {
      windup: 1.0,
      active: 0.3,
      recover: 1.0,
      damage: 2,
      count: 7,
      arc: 1.3,
      speed: 7.5,
      radius: 0.36,
      lifetime: 3.2,
    },
    summon: { windup: 1.2, active: 0.3, recover: 1.2 },
    rings: {
      windup: 1.3,
      active: 1.0,
      recover: 1.6,
      damage: 3,
      count: 2,
      gap: 0.95,
      speed: 6.5,
      thickness: 0.9,
      maxRadius: 34,
    },
  },
} as const;
