/** Refrescos medidos para estimar la frecuencia de la pantalla. */
const SAMPLE_COUNT = 31;
/** Cada cuántos refrescos se vuelve a calcular la frecuencia (detecta el cambio de monitor). */
const ESTIMATE_EVERY = 30;
/** Un intervalo más largo no es un refresco: la pestaña estuvo oculta o el equipo se detuvo. */
const MAX_INTERVAL_MS = 250;
/** Margen para que una pantalla de 119,9 Hz cuente como 120 Hz. */
const DIVISOR_TOLERANCE = 0.1;

/**
 * Cuántos refrescos de pantalla dura cada imagen. Siempre es un número entero: así todas las imágenes
 * duran lo mismo en pantalla y no aparecen tirones, aunque el ritmo final no sea exacto
 * (con un objetivo de 60: 60 Hz y 75 Hz dibujan todo, 120 Hz la mitad y 144 Hz quedan en 72 FPS).
 */
export function refreshDivisor(refreshHz: number, targetFps: number): number {
  if (!(refreshHz > 0) || !(targetFps > 0)) return 1;
  return Math.max(1, Math.floor(refreshHz / targetFps + DIVISOR_TOLERANCE));
}

/** Objetivo de imágenes por segundo: el del ajuste y, fuera de la partida, nunca más que `idleFps`. */
export function frameTarget(playingFps: number | null, playing: boolean, idleFps: number): number {
  if (playing) return playingFps ?? Number.POSITIVE_INFINITY;
  return Math.min(playingFps ?? idleFps, idleFps);
}

/**
 * Decide en cada refresco de la pantalla si toca dibujar. Mide la frecuencia con la mediana de los
 * intervalos recientes, que no se altera por un fotograma suelto lento. Hasta tener la medida dibuja todo.
 */
export class FrameLimiter {
  private readonly samples = new Float64Array(SAMPLE_COUNT);
  private readonly sorted = new Float64Array(SAMPLE_COUNT);
  private sampleCount = 0;
  private nextSample = 0;
  private sinceEstimate = 0;
  private lastTime: number | null = null;
  private sinceDraw = 0;
  private hz: number | null = null;

  /** Frecuencia medida de la pantalla en Hz, o null si todavía no hay suficientes datos. */
  get refreshHz(): number | null {
    return this.hz;
  }

  /** Registra un refresco en el instante `nowMs` y devuelve si hay que dibujar en él. */
  tick(nowMs: number, targetFps: number): boolean {
    this.measure(nowMs);
    this.sinceDraw++;
    if (this.hz !== null && this.sinceDraw < refreshDivisor(this.hz, targetFps)) return false;
    this.sinceDraw = 0;
    return true;
  }

  private measure(nowMs: number): void {
    const interval = this.lastTime === null ? 0 : nowMs - this.lastTime;
    this.lastTime = nowMs;
    if (!(interval > 0) || interval > MAX_INTERVAL_MS) return;
    this.samples[this.nextSample] = interval;
    this.nextSample = (this.nextSample + 1) % SAMPLE_COUNT;
    this.sampleCount = Math.min(this.sampleCount + 1, SAMPLE_COUNT);
    this.sinceEstimate++;
    if (this.sampleCount === SAMPLE_COUNT && this.sinceEstimate >= ESTIMATE_EVERY) {
      this.sinceEstimate = 0;
      this.sorted.set(this.samples);
      this.sorted.sort();
      const median = this.sorted[SAMPLE_COUNT >> 1] ?? 0;
      if (median > 0) this.hz = 1000 / median;
    }
  }
}
