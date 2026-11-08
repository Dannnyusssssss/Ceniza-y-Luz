/**
 * Registro único de sistemas. Cada sistema declara su orden; el loop los ejecuta
 * en ese orden, sin llamadas ocultas entre módulos.
 */
export interface GameSystem {
  readonly name: string;
  /** Menor número, antes se ejecuta. */
  readonly order: number;
  /** Paso fijo de lógica (60 Hz). */
  fixedUpdate?(dt: number): void;
  /** Una vez por fotograma, después de la lógica; `alpha` sirve para interpolar. */
  frameUpdate?(frameSeconds: number, alpha: number): void;
}

/** Orden de los sistemas del juego, en un solo lugar. */
export const SYSTEM_ORDER = {
  input: 0,
  player: 10,
  combat: 20,
  dummy: 30,
  effects: 40,
  camera: 50,
  render: 60,
  ui: 70,
  debug: 80,
} as const;

export class SystemRegistry {
  private systems: GameSystem[] = [];

  register(system: GameSystem): void {
    if (this.systems.some((s) => s.name === system.name)) {
      throw new Error(`Sistema duplicado: ${system.name}`);
    }
    this.systems = [...this.systems, system].sort((a, b) => a.order - b.order);
  }

  unregister(name: string): void {
    this.systems = this.systems.filter((s) => s.name !== name);
  }

  names(): string[] {
    return this.systems.map((s) => s.name);
  }

  fixedUpdate(dt: number): void {
    for (const system of this.systems) system.fixedUpdate?.(dt);
  }

  frameUpdate(frameSeconds: number, alpha: number): void {
    for (const system of this.systems) system.frameUpdate?.(frameSeconds, alpha);
  }
}
