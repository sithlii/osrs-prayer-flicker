// Web Audio metronome locked to the session clock. Beats are scheduled ahead on the audio
// timeline (sample-accurate), not played from timers. Every sound is pre-rendered into an
// AudioBuffer once, so each beat costs a single buffer source node.

import { TICK_MS } from '../engine/config';

export interface MetronomeOptions {
  volume: number;
  pitch: number;
  sound: 'click' | 'drums';
}

let sharedCtx: AudioContext | null = null;

/** Create (or resume) the shared AudioContext. Call from a user gesture, ahead of a drill. */
export function warmAudio(): AudioContext {
  sharedCtx ??= new AudioContext({ latencyHint: 'interactive' });
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

type Hit = 'click' | 'accent' | 'kick' | 'snare' | 'hat' | 'hatSoft';

const buffers = new Map<string, AudioBuffer>();

function render(ctx: AudioContext, hit: Hit, pitch: number): AudioBuffer {
  const key = `${hit}:${pitch}:${ctx.sampleRate}`;
  const cached = buffers.get(key);
  if (cached) return cached;
  const sr = ctx.sampleRate;
  const dur = hit === 'kick' ? 0.22 : hit === 'snare' ? 0.16 : hit.startsWith('hat') ? 0.05 : 0.04;
  const buf = ctx.createBuffer(1, Math.ceil(sr * dur), sr);
  const d = buf.getChannelData(0);
  let prevNoise = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const noise = Math.random() * 2 - 1;
    switch (hit) {
      case 'click':
      case 'accent': {
        const f = hit === 'accent' ? pitch * 1.5 : pitch;
        d[i] = (Math.sin(2 * Math.PI * f * t) > 0 ? 0.8 : -0.8) * Math.exp(-t / 0.008);
        break;
      }
      case 'kick': {
        // Pitch sweep 140Hz → 45Hz; phase is the integral of the swept frequency.
        const k = 0.12 / Math.log(140 / 45);
        const phase = 2 * Math.PI * 140 * k * (1 - Math.exp(-t / k));
        d[i] = Math.sin(phase) * Math.exp(-t / 0.06);
        break;
      }
      case 'snare':
        d[i] = (noise * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t / 0.04);
        break;
      case 'hat':
      case 'hatSoft':
        // First difference of white noise ≈ a cheap high-pass.
        d[i] = (noise - prevNoise) * 0.5 * (hit === 'hat' ? 0.4 : 0.22) * Math.exp(-t / 0.01);
        break;
    }
    prevNoise = noise;
  }
  buffers.set(key, buf);
  return buf;
}

export class Metronome {
  private ctx = warmAudio();
  private master: GainNode;
  private timer = 0;
  private nextBeat = 0;
  private originPerfMs = 0;

  constructor(private opts: MetronomeOptions) {
    this.master = this.ctx.createGain();
    this.master.gain.value = opts.volume;
    this.master.connect(this.ctx.destination);
    // Pre-render now, before the session clock starts.
    const hits: Hit[] = opts.sound === 'click' ? ['click', 'accent'] : ['kick', 'snare', 'hat', 'hatSoft'];
    hits.forEach((h) => render(this.ctx, h, opts.pitch));
  }

  /** ms offset to convert performance.now() to the audio clock. */
  private perfToAudio(perfMs: number): number {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime !== undefined) {
      return ts.contextTime + (perfMs - ts.performanceTime) / 1000;
    }
    return this.ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  start(originPerfMs: number, fromBeat = 0) {
    this.originPerfMs = originPerfMs;
    this.nextBeat = fromBeat;
    const schedule = () => {
      const now = this.ctx.currentTime;
      const horizon = now + 0.15;
      for (;;) {
        const at = this.perfToAudio(this.originPerfMs + this.nextBeat * TICK_MS);
        if (at > horizon) break;
        if (at >= now - 0.01) this.play(this.nextBeat, Math.max(at, now));
        this.nextBeat++;
      }
    };
    schedule();
    this.timer = window.setInterval(schedule, 25);
  }

  stop() {
    clearInterval(this.timer);
    const g = this.master;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    setTimeout(() => g.disconnect(), 200);
  }

  private hit(hit: Hit, at: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = render(this.ctx, hit, this.opts.pitch);
    src.connect(this.master);
    src.start(at);
  }

  private play(beat: number, at: number) {
    if (this.opts.sound === 'click') {
      this.hit(beat % 4 === 0 ? 'accent' : 'click', at);
      return;
    }
    // Original four-beat pattern: kick on 1 and 3, snare on 2 and 4, hats on every eighth.
    const bar = beat % 4;
    this.hit(bar === 0 || bar === 2 ? 'kick' : 'snare', at);
    this.hit('hat', at);
    this.hit('hatSoft', at + TICK_MS / 2000);
  }
}
