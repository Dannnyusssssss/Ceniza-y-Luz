import { createRng } from '../core/rng';
import {
  BEATS_PER_BAR,
  BOSS_MUSIC,
  MUSIC_FADE,
  MUSIC_VOLUME,
  ZONE_MUSIC,
  type MusicTrack,
} from '../data/music';
import type { ZoneId } from '../data/zones';
import { beatSeconds, composeBar, midiToHz, type MusicNote } from './musicPattern';

/** Cada cuánto se programan más notas, y con cuánta antelación (s). */
const TICK_MS = 250;
const LOOKAHEAD = 0.6;
const NOISE_SECONDS = 2;

/**
 * Música y ambiente generados con WebAudio, sin archivos. Se apoya en la salida de los efectos: el silencio global
 * y el compresor la cubren. Es solo acompañamiento: ningún aviso del juego depende de ella.
 */
export class Music {
  private output: { readonly ctx: AudioContext; readonly out: AudioNode } | null = null;
  private bus: GainNode | null = null;
  private ambience: { source: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private enabled = true;
  private paused = false;
  private zone: ZoneId = 'lumbre';
  private boss = false;
  private track: MusicTrack = ZONE_MUSIC.lumbre;
  private readonly rng = createRng(20261112);
  private bar = 0;
  private nextBarAt = 0;
  private degree = 3;

  /** Empieza a sonar con el audio ya desbloqueado (tras una acción del jugador). */
  attach(output: { readonly ctx: AudioContext; readonly out: AudioNode } | null): void {
    if (!output || this.output) return;
    this.output = output;
    const { ctx, out } = output;
    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(out);
    this.bus = bus;
    const source = ctx.createBufferSource();
    source.buffer = makeNoise(ctx);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(bus);
    source.start();
    this.ambience = { source, filter, gain };
    this.nextBarAt = ctx.currentTime + 0.1;
    this.applyTrack();
    this.applyVolume();
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyVolume();
  }

  /** En pausa y en los menús baja mucho: el juego sigue sonando, pero sin molestar. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyVolume();
  }

  setZone(zone: ZoneId): void {
    this.zone = zone;
    this.boss = false;
    this.applyTrack();
  }

  setBoss(active: boolean): void {
    this.boss = active;
    this.applyTrack();
  }

  private applyVolume(): void {
    if (!this.output || !this.bus) return;
    const level = this.enabled ? MUSIC_VOLUME * (this.paused ? 0.35 : 1) : 0;
    this.bus.gain.setTargetAtTime(level, this.output.ctx.currentTime, MUSIC_FADE / 3);
  }

  private applyTrack(): void {
    this.track = this.boss ? BOSS_MUSIC : ZONE_MUSIC[this.zone];
    if (!this.output || !this.ambience) return;
    const now = this.output.ctx.currentTime;
    const { filter, gain } = this.ambience;
    const a = this.track.ambience;
    filter.frequency.setTargetAtTime(a.frequency, now, MUSIC_FADE / 3);
    filter.Q.setTargetAtTime(a.q, now, MUSIC_FADE / 3);
    gain.gain.setTargetAtTime(a.volume, now, MUSIC_FADE / 3);
  }

  private schedule(): void {
    const output = this.output;
    if (!output || output.ctx.state !== 'running' || !this.enabled) {
      // Sin programar: al volver, la música sigue desde ahora y no de golpe con lo atrasado.
      if (output) this.nextBarAt = output.ctx.currentTime + 0.1;
      return;
    }
    while (this.nextBarAt < output.ctx.currentTime + LOOKAHEAD) {
      const beat = beatSeconds(this.track);
      const composed = composeBar(this.track, this.bar++, this.rng, this.degree);
      this.degree = composed.degree;
      for (const note of composed.notes) this.playNote(note, this.nextBarAt + note.beat * beat, beat);
      this.nextBarAt += BEATS_PER_BAR * beat;
    }
  }

  private playNote(note: MusicNote, start: number, beat: number): void {
    const output = this.output;
    if (!output || !this.bus) return;
    const { ctx } = output;
    const pad = note.voice === 'pad';
    const seconds = note.beats * beat;
    const volume = (pad ? this.track.padVolume : this.track.melodyVolume) * note.level;
    const osc = ctx.createOscillator();
    osc.type = pad ? 'triangle' : 'sine';
    osc.frequency.value = midiToHz(note.midi);
    const gain = ctx.createGain();
    // El fondo entra y sale despacio; la melodía, como una cuerda pulsada. Nunca hay chasquidos ni picos.
    const attack = pad ? seconds * 0.35 : 0.03;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds + (pad ? 0.6 : 0.5));
    osc.connect(gain).connect(this.bus);
    osc.start(start);
    osc.stop(start + seconds + 0.8);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.ambience?.source.stop();
    this.ambience = null;
    this.bus?.disconnect();
    this.bus = null;
    this.output = null;
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 777;
  for (let i = 0; i < length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}
