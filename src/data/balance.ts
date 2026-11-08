/** Números de juego (velocidades, tiempos, daño). Unidades: metros, segundos, radianes. */

export const PLAYER_BALANCE = {
  /** Radio del círculo de colisión del jugador. */
  radius: 0.4,
  walkSpeed: 2.4,
  runSpeed: 6,
  /** Aceleración hacia la velocidad deseada (m/s²). */
  acceleration: 45,
  /** Frenado al soltar las teclas (m/s²). */
  deceleration: 60,
  /** Giro máximo del personaje hacia donde se mueve (rad/s). */
  turnRate: 14,
  /** Movimiento mientras ataca (fracción de la velocidad de carrera). */
  attackMoveFactor: 0.25,
} as const;

export const DODGE_BALANCE = {
  duration: 0.42,
  /** Velocidad al empezar; baja hasta `endSpeed` al final (salida suave). */
  startSpeed: 11,
  endSpeed: 3,
  /** Ventana de invulnerabilidad dentro de la esquiva, en segundos desde que empieza. */
  invulnerableFrom: 0.04,
  invulnerableTo: 0.32,
  /** Espera tras terminar antes de poder esquivar otra vez. */
  cooldown: 0.3,
} as const;

export const CAMERA_BALANCE = {
  /** Distancia normal al personaje. */
  distance: 5,
  minDistance: 1.2,
  /** Altura del punto al que mira la cámara, sobre los pies del personaje. */
  targetHeight: 1.3,
  /** Inclinación vertical permitida (radianes; positivo = mirar desde arriba). */
  minPitch: -0.35,
  maxPitch: 1.15,
  initialPitch: 0.28,
  /** Margen con las paredes para que la cámara no las atraviese. */
  collisionMargin: 0.3,
  /** Velocidad a la que la cámara recupera la distancia tras un obstáculo (1/s). */
  zoomOutRate: 4,
  /** Velocidad al acercarse por un obstáculo (rápida, para no ver a través de la pared). */
  zoomInRate: 25,
} as const;

/** Combo de 3 golpes con la Hoja de Luz. Tiempos en segundos. */
export interface ComboStep {
  /** Duración total del golpe. */
  readonly duration: number;
  /** Ventana en la que el golpe hace daño. */
  readonly hitFrom: number;
  readonly hitTo: number;
  /** Desde cuándo se acepta pulsar para encadenar el siguiente golpe. */
  readonly chainFrom: number;
  readonly damage: number;
  /** Alcance del golpe (m) y medio ángulo del arco frontal (rad). */
  readonly range: number;
  readonly halfArc: number;
  /** Pequeño avance del personaje al golpear (m/s durante la ventana de daño). */
  readonly lunge: number;
}

export const COMBO_BALANCE = {
  steps: [
    {
      duration: 0.42,
      hitFrom: 0.1,
      hitTo: 0.22,
      chainFrom: 0.12,
      damage: 10,
      range: 1.9,
      halfArc: 1.1,
      lunge: 2.5,
    },
    {
      duration: 0.42,
      hitFrom: 0.1,
      hitTo: 0.22,
      chainFrom: 0.12,
      damage: 12,
      range: 1.9,
      halfArc: 1.1,
      lunge: 2.5,
    },
    {
      duration: 0.62,
      hitFrom: 0.16,
      hitTo: 0.3,
      chainFrom: 0.62,
      damage: 20,
      range: 2.3,
      halfArc: 1.4,
      lunge: 4,
    },
  ] as readonly ComboStep[],
  /** Una pulsación se recuerda este tiempo antes de la ventana de encadenar. */
  inputBuffer: 0.25,
  /** Pausa tras el último golpe antes de poder empezar otro combo. */
  recovery: 0.15,
} as const;

export const DUMMY_BALANCE = {
  maxHealth: 120,
  radius: 0.5,
  /** Tiempo hasta que el muñeco se recupera por completo tras quedar a cero. */
  resetDelay: 2,
} as const;

export const FEEDBACK_BALANCE = {
  /** Destellos de golpe por segundo como máximo (límite de seguridad: 3). */
  maxFlashesPerSecond: 3,
  flashDuration: 0.12,
  shakeDuration: 0.15,
  shakeStrength: 0.08,
  /** Pausa breve al conectar un golpe (sensación de impacto), en segundos. */
  hitStop: 0.05,
} as const;

/**
 * Vida del jugador. Se cuenta en cuartos de corazón (4 cuartos = 1 corazón), así los fragmentos
 * de corazón y el daño reducido a la mitad salen siempre en números enteros.
 */
export const HEALTH_BALANCE = {
  /** Corazones al empezar. */
  startHearts: 4,
  quartersPerHeart: 4,
  /** Invulnerabilidad tras recibir un golpe (s): da tiempo a reaccionar y evita golpes encadenados. */
  invulnerableAfterHit: 1,
  /** Empuje al recibir un golpe: velocidad inicial (m/s) y duración (s). */
  knockbackSpeed: 7,
  knockbackTime: 0.22,
  /** Con "Daño recibido: reducido", el daño se multiplica por esto (redondeado hacia arriba, mínimo 1). */
  reducedDamageFactor: 0.5,
  /** Espera entre caer y mostrar "Reintentar" (s), para que se vea la animación. */
  deathScreenDelay: 1.2,
} as const;

/** Chispas: la moneda que sueltan los enemigos. */
export const SPARK_BALANCE = {
  /** A esta distancia las chispas vuelan hacia el jugador. */
  magnetRadius: 2.6,
  magnetSpeed: 9,
  /** A esta distancia se recogen. */
  pickupRadius: 0.6,
  /** Tiempo antes de que una chispa recién soltada empiece a atraerse (para que se vea caer). */
  settleTime: 0.35,
  /** Las chispas desaparecen si no se recogen en este tiempo. */
  lifetime: 25,
  /** Velocidad al salir despedidas del enemigo. */
  burstSpeed: 2.5,
} as const;
