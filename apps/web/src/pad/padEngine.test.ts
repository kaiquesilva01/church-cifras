import { afterEach, describe, expect, it, vi } from 'vitest';
import { FADE, createPadEngine } from './padEngine';
import { createPadLoader } from './padLoader';
import { PAD_SAMPLES, type PadNote } from './padNotes';
import { FakeAudioContext } from './testing/fakeAudio';

const T0 = 10;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(opts: { onGiveUp?: () => void } = {}) {
  const ctx = new FakeAudioContext();
  ctx.currentTime = T0;
  const buffer = {} as AudioBuffer;
  const load = vi.fn<(note: PadNote) => Promise<AudioBuffer>>(async () => buffer);
  const engine = createPadEngine({ ctx: ctx.asContext(), load, onGiveUp: opts.onGiveUp });
  // createPadEngine creates the master gain first, then one gain per voice.
  const master = ctx.gains[0]!;
  const voiceGain = (n: number) => ctx.gains[n + 1]!;
  const alive = () => ctx.sources.filter((s) => !s.disconnected).length;
  return { ctx, load, engine, master, voiceGain, alive, buffer };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('FADE', () => {
  it('has the agreed constants', () => {
    expect(FADE).toEqual({ startRampSec: 0.05, outSec: 3, crossfadeSec: 4, volumeRampSec: 0.03 });
  });
});

describe('start', () => {
  it('plays the loop region from offset 0 with a 50 ms anti-click ramp', async () => {
    const { ctx, engine, voiceGain, buffer } = setup();
    await engine.start('C');
    expect(ctx.sources).toHaveLength(1);
    const src = ctx.sources[0]!;
    expect(src.buffer).toBe(buffer);
    expect(src.loop).toBe(true);
    expect(src.loopStart).toBe(PAD_SAMPLES.C.loopStartSec);
    expect(src.loopEnd).toBe(PAD_SAMPLES.C.loopEndSec);
    expect(src.startOffset).toBe(0);
    expect(src.startedAt).toBe(T0);
    expect(voiceGain(0).gain.valueAt(T0)).toBe(0);
    expect(voiceGain(0).gain.valueAt(T0 + 0.05)).toBe(1);
    expect(engine.note).toBe('C');
  });

  it('wires source -> voiceGain -> masterGain -> destination', async () => {
    const { ctx, engine, master, voiceGain } = setup();
    await engine.start('C');
    expect(ctx.sources[0]!.connectedTo).toBe(voiceGain(0));
    expect(voiceGain(0).connectedTo).toBe(master);
    expect(master.connectedTo).toBe(ctx.destination);
  });

  it('resumes a suspended context', async () => {
    const { ctx, engine } = setup();
    ctx.state = 'suspended';
    await engine.start('C');
    expect(ctx.resumeCalls).toBeGreaterThan(0);
  });

  it('does not resume a running context', async () => {
    const { ctx, engine } = setup();
    await engine.start('C');
    expect(ctx.resumeCalls).toBe(0);
  });

  it('rejects when the load fails: no note, no source', async () => {
    const { ctx, load, engine } = setup();
    load.mockRejectedValueOnce(new Error('offline'));
    await expect(engine.start('C')).rejects.toThrow('offline');
    expect(engine.note).toBeNull();
    expect(ctx.sources).toHaveLength(0);
  });

  it('a stop() during a pending start means it never sounds', async () => {
    const { ctx, load, engine } = setup();
    const d = deferred<AudioBuffer>();
    load.mockReturnValueOnce(d.promise);
    const p = engine.start('C');
    expect(engine.note).toBe('C');
    engine.stop();
    expect(engine.note).toBeNull();
    d.resolve({} as AudioBuffer);
    await p;
    expect(ctx.sources).toHaveLength(0);
  });
});

describe('stop', () => {
  it('fades out over 3 s with an equal-power curve, then releases the nodes', async () => {
    const { ctx, engine, voiceGain } = setup();
    await engine.start('C');
    ctx.advanceTo(T0 + 1);
    engine.stop();
    expect(engine.note).toBeNull();
    const t = ctx.currentTime;
    const g = voiceGain(0).gain;
    expect(g.valueAt(t)).toBe(1);
    expect(Math.abs(g.valueAt(t + 1.5) - Math.SQRT1_2)).toBeLessThan(0.02);
    expect(g.valueAt(t + 3)).toBe(0);
    const src = ctx.sources[0]!;
    expect(src.stopAt).toBe(t + 3);
    expect(src.disconnected).toBe(false);
    ctx.advanceTo(t + 3);
    expect(src.disconnected).toBe(true);
    expect(voiceGain(0).disconnected).toBe(true);
  });

  it('is idempotent, and a no-op when idle', async () => {
    const { ctx, engine } = setup();
    engine.stop();
    expect(ctx.sources).toHaveLength(0);
    await engine.start('C');
    engine.stop();
    const stopAt = ctx.sources[0]!.stopAt;
    ctx.advanceBy(1);
    engine.stop();
    expect(ctx.sources[0]!.stopAt).toBe(stopAt);
  });

  it('stopping during the 50 ms ramp does not make the gain jump', async () => {
    const { ctx, engine, voiceGain } = setup();
    await engine.start('C');
    ctx.advanceBy(0.025);
    const before = voiceGain(0).gain.valueAt(ctx.currentTime);
    engine.stop();
    expect(Math.abs(voiceGain(0).gain.valueAt(ctx.currentTime) - before)).toBeLessThan(1e-9);
  });
});

describe('crossfadeTo', () => {
  it('enters the new note from offset 0 while the old one fades out over 4 s', async () => {
    const { ctx, engine, voiceGain, alive } = setup();
    await engine.start('C');
    ctx.advanceBy(10);
    const t = ctx.currentTime;
    await engine.crossfadeTo('D');
    expect(engine.note).toBe('D');
    expect(ctx.sources).toHaveLength(2);
    const d = ctx.sources[1]!;
    expect(d.loopStart).toBe(PAD_SAMPLES.D.loopStartSec);
    expect(d.startOffset).toBe(0);
    expect(voiceGain(1).gain.valueAt(t)).toBe(0);
    expect(voiceGain(1).gain.valueAt(t + 0.05)).toBe(1);
    const old = voiceGain(0).gain;
    expect(Math.abs(old.valueAt(t + 2) - Math.SQRT1_2)).toBeLessThan(0.02);
    expect(old.valueAt(t + 4)).toBe(0);
    expect(ctx.sources[0]!.stopAt).toBe(t + 4);
    expect(alive()).toBe(2);
    ctx.advanceTo(t + 4);
    expect(alive()).toBe(1);
    expect(ctx.sources[0]!.disconnected).toBe(true);
    expect(d.disconnected).toBe(false);
  });

  it('is a no-op for the note already playing', async () => {
    const { ctx, load, engine } = setup();
    await engine.start('C');
    await engine.crossfadeTo('C');
    expect(ctx.sources).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('going back to the sustained note mid-crossfade keeps it (no restart)', async () => {
    const { ctx, load, engine } = setup();
    await engine.start('C');
    const d = deferred<AudioBuffer>();
    load.mockImplementationOnce(() => d.promise);
    const pendingD = engine.crossfadeTo('D');
    await engine.crossfadeTo('C');
    expect(engine.note).toBe('C');
    expect(ctx.sources).toHaveLength(1);
    d.resolve({} as AudioBuffer);
    await pendingD;
    expect(ctx.sources).toHaveLength(1);
    expect(engine.note).toBe('C');
  });

  it('a stale load failure after going back does not reject or change the note', async () => {
    const { ctx, load, engine } = setup();
    await engine.start('C');
    const d = deferred<AudioBuffer>();
    load.mockImplementationOnce(() => d.promise);
    const pendingD = engine.crossfadeTo('D');
    await engine.crossfadeTo('C');
    d.reject(new Error('late'));
    await expect(pendingD).resolves.toBeUndefined();
    expect(engine.note).toBe('C');
    expect(ctx.sources).toHaveLength(1);
  });

  it('behaves like start when idle', async () => {
    const { ctx, engine } = setup();
    await engine.crossfadeTo('D');
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.loopStart).toBe(PAD_SAMPLES.D.loopStartSec);
    expect(engine.note).toBe('D');
  });

  it('rapid D then E: D never sounds, note is E, at most 2 voices', async () => {
    const { ctx, load, engine, alive } = setup();
    await engine.start('C');
    const dLoad = deferred<AudioBuffer>();
    const eLoad = deferred<AudioBuffer>();
    load.mockReturnValueOnce(dLoad.promise).mockReturnValueOnce(eLoad.promise);
    const pD = engine.crossfadeTo('D');
    const pE = engine.crossfadeTo('E');
    expect(engine.note).toBe('E');
    dLoad.resolve({} as AudioBuffer);
    await pD;
    expect(ctx.sources).toHaveLength(1);
    eLoad.resolve({} as AudioBuffer);
    await pE;
    expect(ctx.sources).toHaveLength(2);
    expect(ctx.sources[1]!.loopStart).toBe(PAD_SAMPLES.E.loopStartSec);
    expect(alive()).toBe(2);
    expect(engine.note).toBe('E');
  });

  it('a late D load resolving after E is discarded', async () => {
    const { ctx, load, engine } = setup();
    await engine.start('C');
    const dLoad = deferred<AudioBuffer>();
    load.mockReturnValueOnce(dLoad.promise);
    const pD = engine.crossfadeTo('D');
    await engine.crossfadeTo('E');
    dLoad.resolve({} as AudioBuffer);
    await pD;
    expect(ctx.sources.map((s) => s.loopStart)).toEqual([
      PAD_SAMPLES.C.loopStartSec,
      PAD_SAMPLES.E.loopStartSec,
    ]);
    expect(engine.note).toBe('E');
  });

  it('a stop() during a pending crossfade fades C out and D never sounds', async () => {
    const { ctx, load, engine } = setup();
    await engine.start('C');
    const dLoad = deferred<AudioBuffer>();
    load.mockReturnValueOnce(dLoad.promise);
    const p = engine.crossfadeTo('D');
    engine.stop();
    dLoad.resolve({} as AudioBuffer);
    await p;
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.stopAt).toBe(ctx.currentTime + FADE.outSec);
    expect(engine.note).toBeNull();
  });

  it('a failed crossfade rejects and the current voice keeps playing', async () => {
    const { ctx, load, engine, voiceGain } = setup();
    await engine.start('C');
    ctx.advanceBy(5);
    load.mockRejectedValueOnce(new Error('offline'));
    await expect(engine.crossfadeTo('D')).rejects.toThrow('offline');
    expect(engine.note).toBe('C');
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0]!.stopAt).toBeNull();
    expect(voiceGain(0).gain.valueAt(ctx.currentTime + 1)).toBe(1);
  });
});

describe('setVolume', () => {
  it('applies volume squared with a 30 ms ramp', () => {
    const { ctx, engine, master } = setup();
    engine.setVolume(0.5);
    expect(master.gain.valueAt(ctx.currentTime + 0.03)).toBeCloseTo(0.25, 5);
  });

  it('respects a volume set before start', async () => {
    const { ctx, engine, master } = setup();
    engine.setVolume(0.5);
    await engine.start('C');
    ctx.advanceBy(1);
    expect(master.gain.valueAt(ctx.currentTime)).toBeCloseTo(0.25, 5);
  });

  it('clamps to 0..1', () => {
    const { ctx, engine, master } = setup();
    engine.setVolume(-1);
    expect(master.gain.valueAt(ctx.currentTime + 0.03)).toBe(0);
    ctx.advanceBy(1);
    engine.setVolume(2);
    expect(master.gain.valueAt(ctx.currentTime + 0.03)).toBe(1);
  });
});

describe('gain continuity', () => {
  it('never jumps across start, setVolume, crossfadeTo and stop', async () => {
    const { ctx, engine } = setup();
    const last = new Map<unknown, number>();
    let worst = 0;
    let maxSustained = 0;
    let maxTotal = 0;
    const sample = () => {
      const now = ctx.currentTime;
      const live = ctx.sources.filter((s) => !s.disconnected);
      // A voice being retired (stop within ~100 ms) no longer counts as sustained.
      const sustained = live.filter((s) => s.stopAt === null || s.stopAt - now > 0.1);
      maxSustained = Math.max(maxSustained, sustained.length);
      maxTotal = Math.max(maxTotal, live.length);
      for (const g of ctx.gains) {
        if (g.createdAt > ctx.currentTime) continue;
        const v = g.gain.valueAt(ctx.currentTime);
        // Voice gains must start from 0 (master, the first gain, may start at 1).
        const prev = last.get(g) ?? (g === ctx.gains[0] ? undefined : 0);
        if (prev !== undefined) worst = Math.max(worst, Math.abs(v - prev));
        last.set(g, v);
      }
    };
    const actions = new Map<number, () => Promise<void> | void>([
      [0, () => engine.start('C')],
      [800, () => engine.setVolume(0.3)],
      [1500, () => engine.setVolume(0.9)],
      [2000, () => engine.crossfadeTo('D')],
      [2020, () => engine.stop()],
      [2500, () => engine.start('E')],
      [3000, () => engine.crossfadeTo('F')],
      [3500, () => engine.crossfadeTo('G')],
      [4000, () => engine.stop()],
    ]);
    for (let ms = 0; ms <= 9000; ms += 1) {
      ctx.advanceTo(T0 + ms / 1000);
      const action = actions.get(ms);
      if (action) await action();
      sample();
    }
    expect(ctx.sources.length).toBeGreaterThanOrEqual(4);
    expect(worst).toBeLessThanOrEqual(0.05);
    expect(maxSustained).toBeLessThanOrEqual(2);
    expect(maxTotal).toBeLessThanOrEqual(3);
  });
});

describe('interruptions', () => {
  it('resumes when the context is interrupted, and gives up after 3 s', async () => {
    vi.useFakeTimers();
    const onGiveUp = vi.fn();
    const { ctx, engine } = setup({ onGiveUp });
    await engine.start('C');
    ctx.resumeSucceeds = false;
    ctx.setState('interrupted');
    expect(ctx.resumeCalls).toBe(1);
    vi.advanceTimersByTime(2900);
    expect(onGiveUp).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });

  it('does not give up when the resume works', async () => {
    vi.useFakeTimers();
    const onGiveUp = vi.fn();
    const { ctx, engine } = setup({ onGiveUp });
    await engine.start('C');
    ctx.setState('suspended');
    await vi.advanceTimersByTimeAsync(5000);
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.state).toBe('running');
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('gives up when start cannot get the context running', async () => {
    vi.useFakeTimers();
    const onGiveUp = vi.fn();
    const { ctx, engine } = setup({ onGiveUp });
    ctx.state = 'suspended';
    ctx.resumeSucceeds = false;
    await engine.start('C');
    vi.advanceTimersByTime(3100);
    expect(onGiveUp).toHaveBeenCalledTimes(1);
  });
});

describe('voice cap', () => {
  it('chained crossfades retire the older tails: never more than 2 sustained voices', async () => {
    const { ctx, engine, alive } = setup();
    await engine.start('C');
    await engine.crossfadeTo('D');
    ctx.advanceBy(1);
    await engine.crossfadeTo('E');
    // C was mid-fade: it now has only a short fade left, ending well before D's.
    expect(ctx.sources[0]!.stopAt!).toBeLessThanOrEqual(ctx.currentTime + 0.1);
    expect(alive()).toBe(3);
    ctx.advanceBy(0.1);
    expect(alive()).toBe(2);
  });

  it('start right after stop retires the 3 s tail quickly', async () => {
    const { ctx, engine, alive } = setup();
    await engine.start('C');
    engine.stop();
    ctx.advanceBy(0.5);
    await engine.start('D');
    expect(ctx.sources[0]!.stopAt!).toBeLessThanOrEqual(ctx.currentTime + 0.1);
    ctx.advanceBy(0.1);
    expect(alive()).toBe(1);
  });
});

describe('give-up timer vs stop', () => {
  it('stop() cancels a pending give-up', async () => {
    vi.useFakeTimers();
    const onGiveUp = vi.fn();
    const { ctx, engine } = setup({ onGiveUp });
    ctx.state = 'suspended';
    ctx.resumeSucceeds = false;
    await engine.start('C');
    engine.stop();
    vi.advanceTimersByTime(5000);
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('a failed load that leaves nothing playing cancels the give-up', async () => {
    vi.useFakeTimers();
    const onGiveUp = vi.fn();
    const { ctx, load, engine } = setup({ onGiveUp });
    ctx.state = 'suspended';
    ctx.resumeSucceeds = false;
    load.mockRejectedValueOnce(new Error('offline'));
    await expect(engine.start('C')).rejects.toThrow('offline');
    vi.advanceTimersByTime(5000);
    expect(onGiveUp).not.toHaveBeenCalled();
  });
});

describe('dispose', () => {
  it('cuts and disconnects everything immediately', async () => {
    const { ctx, engine, master } = setup();
    await engine.start('C');
    await engine.crossfadeTo('D');
    engine.dispose();
    expect(ctx.sources.every((s) => s.stopAt !== null && s.stopAt <= ctx.currentTime)).toBe(true);
    expect(ctx.sources.every((s) => s.disconnected)).toBe(true);
    expect(ctx.gains.every((g) => g.disconnected)).toBe(true);
    expect(master.disconnected).toBe(true);
    expect(engine.note).toBeNull();
  });

  it('discards a pending load', async () => {
    const { ctx, load, engine } = setup();
    const d = deferred<AudioBuffer>();
    load.mockReturnValueOnce(d.promise);
    const p = engine.start('C');
    engine.dispose();
    d.resolve({} as AudioBuffer);
    await p;
    expect(ctx.sources).toHaveLength(0);
  });
});

describe('engine + loader buffer budget', () => {
  it('A -> B -> C with B superseded keeps at most 2 distinct buffers', async () => {
    const ctx = new FakeAudioContext();
    ctx.currentTime = T0;
    const gates = new Map<string, ReturnType<typeof deferred<AudioBuffer>>>();
    const decode = vi.fn((b: ArrayBuffer) => {
      const key = String(new Uint8Array(b)[0]);
      const g = deferred<AudioBuffer>();
      gates.set(key, g);
      return g.promise;
    });
    const fetchBytes = vi.fn(async (path: string) => {
      const note = (Object.keys(PAD_SAMPLES) as PadNote[]).find(
        (n) => PAD_SAMPLES[n].storagePath === path,
      )!;
      return new Uint8Array([note.charCodeAt(0)]);
    });
    const ref: { engine?: ReturnType<typeof createPadEngine> } = {};
    const loader = createPadLoader({
      fetchBytes,
      decode,
      keep: (n) => ref.engine?.note === n,
    });
    const engine = createPadEngine({ ctx: ctx.asContext(), load: loader.load });
    ref.engine = engine;
    const buf = (tag: string) => ({ tag }) as unknown as AudioBuffer;
    const flushMicro = () => new Promise((r) => setTimeout(r, 0));

    const a = engine.start('A');
    await flushMicro();
    gates.get(String('A'.charCodeAt(0)))!.resolve(buf('A'));
    await a;
    const b = engine.crossfadeTo('B');
    await flushMicro();
    const c = engine.crossfadeTo('C');
    await flushMicro();
    gates.get(String('B'.charCodeAt(0)))!.resolve(buf('B'));
    gates.get(String('C'.charCodeAt(0)))!.resolve(buf('C'));
    await Promise.all([b, c]);

    const decodesBefore = decode.mock.calls.length;
    void loader.load('B'); // B was superseded: it must not still be cached
    await flushMicro();
    expect(decode.mock.calls.length).toBe(decodesBefore + 1);
    const live = new Set(ctx.sources.filter((s) => !s.disconnected).map((s) => s.buffer));
    expect(live.size).toBeLessThanOrEqual(2);
  });
});
