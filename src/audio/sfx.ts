/**
 * Efectos de sonido sintetizados con WebAudio (sin archivos). Todo sonido importante tiene también una señal
 * visual en el juego. El volumen pasa por un compresor para evitar picos, y "Silencio" lo apaga por completo.
 */

export type SoundId =
  | 'swing'
  | 'hit'
  | 'kill'
  | 'hurt'
  | 'dodge'
  | 'warn'
  | 'slam'
  | 'shoot'
  | 'cut'
  | 'spark'
  | 'wave'
  | 'down'
  | 'open'
  | 'rest'
  | 'blade'
  | 'door'
  | 'click'
  | 'wrong'
  | 'push'
  | 'solved'
  | 'talk'
  | 'potion'
  | 'buy';

/** Volumen general (antes del compresor). */
const MASTER_VOLUME = 0.32;
/** Separación mínima entre dos sonidos iguales (s): evita amontonamientos y picos. */
const MIN_GAP: Partial<Record<SoundId, number>> = { spark: 0.05, hit: 0.04, warn: 0.08, swing: 0.05 };

type Ctor = new () => AudioContext;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private readonly lastPlayed = new Map<SoundId, number>();

  /** Crea o reanuda el audio. Hay que llamarlo desde un clic o una tecla (los navegadores lo exigen). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtor = (window.AudioContext ??
          (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) as Ctor | undefined;
        if (!AudioCtor) return;
        const ctx = new AudioCtor();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.ratio.value = 6;
        const master = ctx.createGain();
        master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        master.connect(compressor).connect(ctx.destination);
        this.ctx = ctx;
        this.master = master;
        this.noise = makeNoise(ctx);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      // Sin audio el juego sigue siendo completo: todas las señales tienen su equivalente visual.
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
  }

  /** Reproduce un efecto. `variant` cambia un poco el tono (p. ej. según el tipo de enemigo). */
  play(id: SoundId, variant = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[id] ?? 0.02;
    if (now - (this.lastPlayed.get(id) ?? -1) < gap) return;
    this.lastPlayed.set(id, now);
    const out = this.master;
    switch (id) {
      case 'swing':
        this.noiseBurst(out, now, 0.14, 1800 + variant * 300, 4000, 0.35);
        break;
      case 'hit':
        this.tone(out, now, 'triangle', 220, 120, 0.12, 0.5);
        this.noiseBurst(out, now, 0.06, 900, 2500, 0.3);
        break;
      case 'kill':
        this.noiseBurst(out, now, 0.5, 600, 200, 0.25);
        this.tone(out, now, 'sine', 520, 260, 0.45, 0.18);
        break;
      case 'hurt':
        this.tone(out, now, 'square', 160, 70, 0.22, 0.25);
        this.noiseBurst(out, now, 0.12, 500, 300, 0.3);
        break;
      case 'dodge':
        this.noiseBurst(out, now, 0.18, 700, 1600, 0.18);
        break;
      case 'warn': {
        // Tono que sube: más grave cuanto más grande es el enemigo.
        const base = [520, 640, 260, 440][variant] ?? 480;
        this.tone(out, now, 'sine', base, base * 1.5, 0.28, 0.22);
        break;
      }
      case 'slam':
        this.tone(out, now, 'sine', 90, 40, 0.5, 0.7);
        this.noiseBurst(out, now, 0.35, 400, 120, 0.45);
        break;
      case 'shoot':
        this.tone(out, now, 'sawtooth', 300, 180, 0.2, 0.12);
        this.noiseBurst(out, now, 0.2, 1200, 600, 0.15);
        break;
      case 'cut':
        this.tone(out, now, 'sine', 880, 1320, 0.18, 0.2);
        break;
      case 'spark':
        this.tone(out, now, 'sine', 1200 + variant * 60, 1600 + variant * 60, 0.08, 0.1);
        break;
      case 'wave':
        this.tone(out, now, 'triangle', 392, 392, 0.18, 0.25);
        this.tone(out, now + 0.18, 'triangle', 523, 523, 0.3, 0.25);
        break;
      case 'down':
        this.tone(out, now, 'triangle', 330, 110, 0.9, 0.3);
        break;
      case 'open':
        this.noiseBurst(out, now, 0.25, 300, 800, 0.2);
        this.tone(out, now + 0.12, 'triangle', 523, 784, 0.35, 0.22);
        break;
      case 'rest':
        this.tone(out, now, 'sine', 392, 392, 0.5, 0.2);
        this.tone(out, now + 0.2, 'sine', 587, 587, 0.7, 0.2);
        break;
      case 'blade':
        this.tone(out, now, 'triangle', 440, 880, 0.5, 0.25);
        this.tone(out, now + 0.25, 'sine', 1175, 1175, 0.7, 0.16);
        break;
      case 'door':
        this.noiseBurst(out, now, 0.9, 160, 90, 0.3);
        this.tone(out, now, 'sine', 70, 55, 0.9, 0.3);
        break;
      case 'click':
        this.tone(out, now, 'square', 640, 640, 0.06, 0.1);
        break;
      case 'wrong':
        this.tone(out, now, 'triangle', 196, 147, 0.22, 0.2);
        break;
      case 'push':
        this.noiseBurst(out, now, 0.3, 240, 140, 0.32);
        break;
      case 'solved':
        this.tone(out, now, 'triangle', 523, 523, 0.18, 0.22);
        this.tone(out, now + 0.16, 'triangle', 659, 659, 0.18, 0.22);
        this.tone(out, now + 0.32, 'triangle', 784, 784, 0.4, 0.22);
        break;
      case 'talk':
        this.tone(out, now, 'sine', 520, 600, 0.07, 0.1);
        break;
      case 'potion':
        this.tone(out, now, 'sine', 392, 784, 0.32, 0.18);
        break;
      case 'buy':
        this.tone(out, now, 'sine', 1046, 1318, 0.14, 0.14);
        break;
    }
  }

  private tone(
    out: AudioNode,
    start: number,
    type: OscillatorType,
    from: number,
    to: number,
    duration: number,
    volume: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
    // Entrada y salida suaves: sin chasquidos.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noiseBurst(
    out: AudioNode,
    start: number,
    duration: number,
    from: number,
    to: number,
    volume: number,
  ): void {
    const ctx = this.ctx as AudioContext;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.6);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}
