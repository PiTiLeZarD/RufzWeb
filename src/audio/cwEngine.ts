/**
 * Web Audio CW transmitter.
 *
 * All keying is scheduled up-front against `AudioContext.currentTime`, so the
 * timing is sample-accurate and immune to main-thread jank. This is why the
 * original RufzXP "speed alarm" (a watchdog for unreliable Windows timers) has
 * no equivalent here.
 *
 * Each element is shaped with a raised-cosine envelope to avoid key clicks.
 */

import { dotSeconds, toDotUnits } from '../game/morse';

export interface ToneSettings {
  /** Sidetone pitch in Hz. */
  frequencyHz: number;
  /** Output level, 0..1. */
  volume: number;
  /**
   * Keying hardness, 0..10. 0 is a soft 8 ms rise, 10 is a hard 0.5 ms rise.
   * Equivalent to the RufzXP "waveform hardness" control.
   */
  hardness: number;
}

export const DEFAULT_TONE: ToneSettings = {
  frequencyHz: 600,
  volume: 0.35,
  hardness: 4,
};

/** Envelope curve resolution. 32 points is smooth enough at any sane ramp. */
const CURVE_POINTS = 32;

function raisedCosine(rising: boolean): Float32Array {
  const curve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i += 1) {
    const phase = i / (CURVE_POINTS - 1);
    const value = 0.5 - 0.5 * Math.cos(Math.PI * phase);
    curve[i] = rising ? value : 1 - value;
  }
  return curve;
}

const RISE = raisedCosine(true);
const FALL = raisedCosine(false);

function rampSeconds(hardness: number): number {
  const clamped = Math.min(10, Math.max(0, hardness));
  return (8 - clamped * 0.75) / 1000;
}

export interface Transmission {
  /** Total on-air length in seconds. */
  duration: number;
  /** Resolves when the last element has finished sounding. */
  done: Promise<void>;
  /** Cut the transmission short with a clean fade. */
  abort(): void;
}

export class CwEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private active: { osc: OscillatorNode; gain: GainNode; timer: number } | null = null;

  /**
   * Must be called from a user gesture before the first transmission,
   * otherwise the browser keeps the context suspended.
   */
  async unlock(): Promise<void> {
    const context = this.ensureContext();
    if (context.state === 'suspended') await context.resume();
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  /** Schedule `text` at `cpm` characters per minute. Cancels anything playing. */
  send(text: string, cpm: number, tone: ToneSettings): Transmission {
    this.abort();

    const context = this.ensureContext();
    const master = this.master!;

    const dot = dotSeconds(cpm);
    const spans = toDotUnits(text);
    const ramp = Math.min(rampSeconds(tone.hardness), dot * 0.45);

    // Small lead-in so the first ramp is comfortably in the future.
    const t0 = context.currentTime + 0.08;
    const duration = spans.length
      ? (spans[spans.length - 1].start + spans[spans.length - 1].length) * dot
      : 0;

    const gain = context.createGain();
    gain.gain.setValueAtTime(0, t0);

    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(tone.frequencyHz, t0);
    osc.connect(gain);
    gain.connect(master);

    for (const span of spans) {
      const keyDown = t0 + span.start * dot;
      const keyUp = keyDown + span.length * dot;
      // Ramps live inside the element so inter-element gaps stay silent.
      gain.gain.setValueCurveAtTime(scaled(RISE, tone.volume), keyDown, ramp);
      gain.gain.setValueAtTime(tone.volume, keyUp - ramp);
      gain.gain.setValueCurveAtTime(scaled(FALL, tone.volume), keyUp - ramp, ramp);
    }

    osc.start(t0);
    osc.stop(t0 + duration + 0.05);

    let resolveDone: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const timer = window.setTimeout(
      () => {
        if (this.active?.osc === osc) this.active = null;
        resolveDone();
      },
      (t0 - context.currentTime + duration) * 1000 + 20,
    );

    this.active = { osc, gain, timer };

    return {
      duration,
      done,
      abort: () => this.abort(),
    };
  }

  /** Fade out and tear down whatever is currently sounding. */
  abort(): void {
    if (!this.active || !this.context) return;
    const { osc, gain, timer } = this.active;
    this.active = null;
    window.clearTimeout(timer);

    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.005);
    try {
      osc.stop(now + 0.01);
    } catch {
      // Already stopped; nothing to do.
    }
  }

  close(): void {
    this.abort();
    this.context?.close();
    this.context = null;
    this.master = null;
  }
}

function scaled(curve: Float32Array, volume: number): Float32Array {
  const out = new Float32Array(curve.length);
  for (let i = 0; i < curve.length; i += 1) out[i] = curve[i] * volume;
  return out;
}
