/** Los 4 tipos de enemigo: estadísticas y tiempos de sus ataques. Unidades: metros, segundos. */

export type EnemyKind = 'brumilla' | 'acechador' | 'coloso' | 'tirador';

/** Cómo decide moverse y atacar cada tipo. */
export type EnemyBehavior = 'charger' | 'circler' | 'brute' | 'shooter';

export interface EnemyStatsBase {
  readonly kind: EnemyKind;
  /** Nombre que se muestra en pantalla. */
  readonly name: string;
  readonly maxHealth: number;
  /** Radio del círculo de colisión. */
  readonly radius: number;
  /** Velocidad al perseguir o al colocarse. */
  readonly speed: number;
  /** Ve al jugador a esta distancia. */
  readonly detectRange: number;
  /** Empieza a preparar el ataque a esta distancia. */
  readonly attackRange: number;
  /** Aviso antes de atacar (se ve venir). */
  readonly windup: number;
  /** Duración del ataque, en la que hace daño. */
  readonly active: number;
  /** Pausa tras atacar: el momento para contraatacar. */
  readonly recover: number;
  /** Daño al jugador, en cuartos de corazón. */
  readonly damage: number;
  /** Alcance del golpe (radio alrededor del punto de impacto). */
  readonly hitRadius: number;
  /** Si recibe un golpe, se aturde un momento (e interrumpe el aviso). */
  readonly staggerable: boolean;
  /** Fracción del empuje que recibe al ser golpeado (0 = inamovible). */
  readonly knockbackTaken: number;
  /** Chispas que suelta al morir (mínimo y máximo). */
  readonly sparks: readonly [number, number];
}

export interface ChargerStats extends EnemyStatsBase {
  readonly behavior: 'charger';
  /** Velocidad del salto al atacar. */
  readonly lungeSpeed: number;
}

export interface CirclerStats extends EnemyStatsBase {
  readonly behavior: 'circler';
  /** Distancia a la que rodea al jugador. */
  readonly circleRadius: number;
  /** Cuánto tiempo rodea antes de lanzarse (mínimo y máximo). */
  readonly circleTime: readonly [number, number];
  readonly dashSpeed: number;
}

export interface BruteStats extends EnemyStatsBase {
  readonly behavior: 'brute';
  /** Distancia delante del cuerpo donde cae el golpe. */
  readonly slamReach: number;
}

export interface ShooterStats extends EnemyStatsBase {
  readonly behavior: 'shooter';
  /** Distancia que intenta mantener con el jugador (mínima y máxima). */
  readonly preferredRange: readonly [number, number];
  readonly projectileSpeed: number;
  readonly projectileRadius: number;
  readonly projectileLifetime: number;
}

export type EnemyStats = ChargerStats | CirclerStats | BruteStats | ShooterStats;

export const ENEMIES: Readonly<Record<EnemyKind, EnemyStats>> = {
  brumilla: {
    kind: 'brumilla',
    name: 'Brumilla',
    behavior: 'charger',
    maxHealth: 20,
    radius: 0.45,
    speed: 2.2,
    detectRange: 11,
    attackRange: 1.7,
    windup: 0.55,
    active: 0.3,
    recover: 0.8,
    damage: 2,
    hitRadius: 0.75,
    staggerable: true,
    knockbackTaken: 1,
    sparks: [2, 3],
    lungeSpeed: 6,
  },
  acechador: {
    kind: 'acechador',
    name: 'Acechador',
    behavior: 'circler',
    maxHealth: 34,
    radius: 0.5,
    speed: 5.2,
    detectRange: 14,
    attackRange: 4.6,
    windup: 0.42,
    active: 0.32,
    recover: 0.75,
    damage: 3,
    hitRadius: 0.8,
    staggerable: true,
    knockbackTaken: 0.8,
    sparks: [3, 5],
    circleRadius: 4,
    circleTime: [1.4, 2.6],
    dashSpeed: 12,
  },
  coloso: {
    kind: 'coloso',
    name: 'Coloso de Bruma',
    behavior: 'brute',
    maxHealth: 110,
    radius: 0.95,
    speed: 1.5,
    detectRange: 12,
    attackRange: 2.6,
    windup: 1.05,
    active: 0.18,
    recover: 1.4,
    damage: 6,
    hitRadius: 1.9,
    staggerable: false,
    knockbackTaken: 0,
    sparks: [8, 12],
    slamReach: 1.7,
  },
  tirador: {
    kind: 'tirador',
    name: 'Tirador de Ceniza',
    behavior: 'shooter',
    maxHealth: 26,
    radius: 0.45,
    speed: 2.6,
    detectRange: 16,
    attackRange: 12,
    windup: 0.8,
    active: 0.1,
    recover: 1.5,
    damage: 3,
    hitRadius: 0,
    staggerable: true,
    knockbackTaken: 1,
    sparks: [3, 4],
    preferredRange: [6, 10],
    projectileSpeed: 5.5,
    projectileRadius: 0.32,
    projectileLifetime: 4,
  },
};

export const ENEMY_KINDS: readonly EnemyKind[] = ['brumilla', 'acechador', 'coloso', 'tirador'];

/** Reglas comunes a todos los enemigos. */
export const ENEMY_RULES = {
  /** Aturdimiento al recibir un golpe (tipos que se aturden). */
  stagger: 0.35,
  /** Empuje al recibir un golpe del jugador (m/s, se frena enseguida). */
  knockbackSpeed: 5,
  /** Frenado del empuje (1/s). */
  knockbackDamping: 12,
  /** Tiempo que tarda en desvanecerse en ceniza. */
  dissolveTime: 0.9,
  /** Al aparecer, tarda esto en empezar a actuar (se ve surgir de la bruma). */
  spawnTime: 0.8,
  /** Fuera de `detectRange` por este factor pierde de vista al jugador. */
  loseInterestFactor: 1.6,
  /** Giro máximo hacia el jugador (rad/s). */
  turnRate: 7,
} as const;
