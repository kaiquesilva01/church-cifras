import { PAD_SAMPLES, type PadNote } from './padNotes';

export const FADE = {
  startRampSec: 0.05,
  outSec: 3,
  crossfadeSec: 4,
  volumeRampSec: 0.03,
} as const;

/** How long a context may stay out of 'running' before the UI is told to give up. */
const GIVE_UP_MS = 3000;
const CURVE_POINTS = 128;

export interface PadEngine {
  /** resume() + load + plays from the beginning (offset 0). */
  start(note: PadNote): Promise<void>;
  /** Same note: no-op; idle: equivalent to start. */
  crossfadeTo(note: PadNote): Promise<void>;
  /** 3 s fade-out, then releases the nodes. Idempotent. */
  stop(): void;
  /** Slider value 0..1; applies volume squared. */
  setVolume(volume: number): void;
  /** Target note; becomes null as soon as stop() is called. */
  readonly note: PadNote | null;
  /** Immediate hard cut (unmount). */
  dispose(): void;
}

export interface PadEngineDeps {
  ctx: AudioContext;
  load: (note: PadNote) => Promise<AudioBuffer>;
  onGiveUp?: () => void;
}

interface Voice {
  note: PadNote;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** cos(pi/2 * t) scaled by `from`, ending at exactly 0. */
function fadeOutCurve(from: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i += 1) {
    curve[i] = from * Math.cos((Math.PI / 2) * (i / (CURVE_POINTS - 1)));
  }
  curve[CURVE_POINTS - 1] = 0;
  return curve;
}

export function createPadEngine({ ctx, load, onGiveUp }: PadEngineDeps): PadEngine {
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const voices = new Set<Voice>();
  let playing: Voice | null = null;
  /** Generation counter: any async continuation from an older generation is discarded. */
  let token = 0;
  let target: PadNote | null = null;
  let disposed = false;
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  /** Cancels automation without ever jumping: re-pins the current value first. */
  function pin(param: AudioParam): number {
    const now = ctx.currentTime;
    const current = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    return current;
  }

  function release(voice: Voice): void {
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
    voices.delete(voice);
    if (playing === voice) playing = null;
  }

  function fadeOut(voice: Voice, seconds: number): void {
    const now = ctx.currentTime;
    const from = pin(voice.gain.gain);
    voice.gain.gain.setValueCurveAtTime(fadeOutCurve(from), now, seconds);
    voice.source.stop(now + seconds);
    voice.source.onended = () => release(voice);
  }

  function enter(note: PadNote, buffer: AudioBuffer): Voice {
    const sample = PAD_SAMPLES[note];
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE.startRampSec);
    gain.connect(master);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = sample.loopStartSec;
    source.loopEnd = sample.loopEndSec;
    source.connect(gain);
    const voice: Voice = { note, source, gain };
    source.onended = () => release(voice);
    voices.add(voice);
    source.start(now, 0);
    return voice;
  }

  function clearGiveUpTimer(): void {
    if (giveUpTimer !== null) {
      clearTimeout(giveUpTimer);
      giveUpTimer = null;
    }
  }

  function ensureRunning(): void {
    if (ctx.state === 'running') {
      clearGiveUpTimer();
      return;
    }
    ctx.resume().catch(() => undefined);
    if (giveUpTimer !== null) return;
    giveUpTimer = setTimeout(() => {
      giveUpTimer = null;
      if (!disposed && ctx.state !== 'running') onGiveUp?.();
    }, GIVE_UP_MS);
  }

  function onStateChange(): void {
    if (disposed) return;
    if (ctx.state === 'running') clearGiveUpTimer();
    else if (target !== null) ensureRunning();
  }
  ctx.addEventListener('statechange', onStateChange);

  let volumeSquared = 1;

  async function play(note: PadNote): Promise<void> {
    token += 1;
    const mine = token;
    target = note;
    ensureRunning();
    let buffer: AudioBuffer;
    try {
      buffer = await load(note);
    } catch (error) {
      if (mine !== token || disposed) return; // superseded: nobody is waiting on this outcome
      target = playing ? playing.note : null;
      throw error;
    }
    if (mine !== token || disposed) return;
    const old = playing;
    if (old) fadeOut(old, FADE.crossfadeSec);
    playing = enter(note, buffer);
  }

  return {
    start: (note) => play(note),
    crossfadeTo(note) {
      if (note === target) return Promise.resolve();
      return play(note);
    },
    stop() {
      if (disposed) return;
      token += 1;
      target = null;
      const current = playing;
      if (!current) return;
      playing = null;
      fadeOut(current, FADE.outSec);
    },
    setVolume(volume) {
      const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
      volumeSquared = v * v;
      pin(master.gain);
      master.gain.linearRampToValueAtTime(volumeSquared, ctx.currentTime + FADE.volumeRampSec);
    },
    get note() {
      return target;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      token += 1;
      target = null;
      clearGiveUpTimer();
      ctx.removeEventListener('statechange', onStateChange);
      for (const voice of [...voices]) {
        try {
          voice.source.stop();
        } catch {
          // already stopped
        }
        release(voice);
      }
      playing = null;
      master.disconnect();
    },
  };
}
