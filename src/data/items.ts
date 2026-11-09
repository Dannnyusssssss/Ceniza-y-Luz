/** Objetos, precios y mejoras. Las chispas son la moneda. */

export type KeyId = 'llave-claro' | 'sello-bruma';
export const KEY_IDS: readonly KeyId[] = ['llave-claro', 'sello-bruma'];

export type SpecialId = 'talisman';
export const SPECIAL_IDS: readonly SpecialId[] = ['talisman'];

export type AbilityId = 'pulso' | 'impulso';
export const ABILITY_IDS: readonly AbilityId[] = ['pulso', 'impulso'];

/** Lo que puede haber dentro de un cofre. */
export type ChestContents =
  | { readonly kind: 'sparks'; readonly amount: number }
  | { readonly kind: 'temple' }
  | { readonly kind: 'fragment' }
  | { readonly kind: 'key'; readonly key: KeyId }
  | { readonly kind: 'potion'; readonly amount: number };

export const ITEM_BALANCE = {
  /** Límite de chispas que se pueden llevar. */
  maxSparks: 9999,
  potion: {
    price: 30,
    /** La tienda las recompra a la mitad de su precio. */
    sellPrice: 15,
    /** Cura 2 corazones, en cuartos. */
    healQuarters: 8,
    maxCarried: 5,
  },
  temple: {
    minLevel: 1,
    maxLevel: 5,
    /** Multiplicador de daño de la Hoja en cada nivel (del 1 al 5). */
    damageFactors: [1, 1.25, 1.5, 1.75, 2],
    /** Precio de subir al nivel 2, 3, 4 y 5. */
    prices: [60, 120, 200, 320],
  },
  talisman: {
    price: 150,
    /** La espera de la esquiva dura esta fracción (se recarga un 25 % más rápido). */
    dodgeCooldownFactor: 0.75,
  },
  /** Fragmentos de corazón que dan un corazón nuevo. */
  fragmentsPerHeart: 4,
} as const;

/** Las habilidades no gastan nada: solo tienen tiempo de espera. Unidades: metros, segundos. */
export const ABILITY_BALANCE = {
  pulso: {
    cooldown: 1.1,
    speed: 22,
    range: 20,
    radius: 0.32,
    /** Daño base, antes del temple de la Hoja. */
    damage: 14,
    /** Si un objetivo queda a menos de este ángulo de donde se apunta, el disparo se ajusta hacia él. */
    aimHalfAngle: 0.3,
  },
  impulso: {
    cooldown: 1.8,
    distance: 6.5,
    duration: 0.24,
    /** Por debajo de esta distancia no merece la pena salir: no se gasta la espera. */
    minDistance: 0.6,
  },
} as const;
