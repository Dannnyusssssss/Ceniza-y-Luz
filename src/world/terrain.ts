import type { TerrainBump } from '../data/zones';

/** Datos mínimos del relieve de una zona. */
export interface TerrainSource {
  readonly halfX: number;
  readonly halfZ: number;
  readonly bumps: readonly TerrainBump[];
  readonly scatter: { readonly seed: number };
}

/** Desde este margen fuera de los límites empiezan las colinas que cierran el paisaje. */
const EDGE_FLAT = 2;
const EDGE_RISE = 14;
const HILL_HEIGHT = 2.2;

function smooth(t: number): number {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

/**
 * Altura del suelo. Dentro de la zona solo hay elevaciones suaves (se camina sin saltos); fuera, colinas que
 * tapan el horizonte. Nunca es negativa: los bloques van del suelo (y = 0) a su altura.
 */
export function groundHeight(zone: TerrainSource, x: number, z: number): number {
  let h = 0;
  for (const b of zone.bumps) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (d < b.radius) h += b.height * smooth(1 - d / b.radius);
  }
  const edge = Math.max(Math.abs(x) - zone.halfX, Math.abs(z) - zone.halfZ) - EDGE_FLAT;
  if (edge > 0) {
    const rise = Math.min(edge / EDGE_RISE, 1);
    const a = zone.scatter.seed % 7;
    const hills = 1.6 + Math.sin(x * 0.18 + a) * 1.2 + Math.cos(z * 0.15 + a * 1.7) * 1.2;
    h += rise * rise * hills * HILL_HEIGHT;
  }
  return h;
}
