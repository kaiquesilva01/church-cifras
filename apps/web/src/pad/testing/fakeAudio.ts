// Test double for the Web Audio pieces used by padEngine. Not imported by app code.

type GainEvent =
  | { type: 'set'; time: number; value: number }
  | { type: 'linear'; time: number; value: number }
  | { type: 'curve'; time: number; duration: number; values: Float32Array };

export class FakeAudioParam {
  private events: GainEvent[] = [];
  constructor(
    private readonly ctx: FakeAudioContext,
    private readonly initial: number,
  ) {}

  /** Like the real getter: the automated value at the current time. */
  get value(): number {
    return this.valueAt(this.ctx.currentTime);
  }
  set value(v: number) {
    this.setValueAtTime(v, this.ctx.currentTime);
  }

  private add(event: GainEvent): this {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time); // stable: ties keep insertion order
    return this;
  }

  setValueAtTime(value: number, time: number): this {
    for (const e of this.events) {
      if (e.type === 'curve' && time > e.time && time < e.time + e.duration) {
        throw new Error('NotSupportedError: setValueAtTime inside a value curve');
      }
    }
    return this.add({ type: 'set', time, value });
  }

  linearRampToValueAtTime(value: number, time: number): this {
    return this.add({ type: 'linear', time, value });
  }

  setValueCurveAtTime(values: Float32Array, time: number, duration: number): this {
    for (const e of this.events) {
      const end = e.type === 'curve' ? e.time + e.duration : e.time;
      if (end > time && e.time < time + duration) {
        throw new Error('NotSupportedError: setValueCurveAtTime overlaps another event');
      }
    }
    return this.add({ type: 'curve', time, duration, values: Float32Array.from(values) });
  }

  /**
   * Per the spec: removes events at or after `time`, and also cancels an active curve that
   * started earlier (which restores the pre-curve value immediately, i.e. a discontinuity).
   */
  cancelScheduledValues(time: number): this {
    this.events = this.events.filter(
      (e) => !(e.time >= time || (e.type === 'curve' && e.time + e.duration > time)),
    );
    return this;
  }

  valueAt(t: number): number {
    let prevTime = -Infinity;
    let prevValue = this.initial;
    for (const e of this.events) {
      if (e.type === 'linear') {
        if (t < e.time) {
          if (prevTime === -Infinity) return prevValue;
          return prevValue + ((e.value - prevValue) * (t - prevTime)) / (e.time - prevTime);
        }
        prevTime = e.time;
        prevValue = e.value;
      } else if (e.type === 'set') {
        if (t < e.time) return prevValue;
        prevTime = e.time;
        prevValue = e.value;
      } else {
        if (t < e.time) return prevValue;
        const last = e.values.length - 1;
        if (t < e.time + e.duration) {
          const pos = ((t - e.time) / e.duration) * last;
          const i = Math.floor(pos);
          const a = e.values[i] ?? 0;
          const b = e.values[Math.min(i + 1, last)] ?? a;
          return a + (b - a) * (pos - i);
        }
        prevTime = e.time + e.duration;
        prevValue = e.values[last] ?? prevValue;
      }
    }
    return prevValue;
  }
}

export class FakeGainNode {
  readonly gain: FakeAudioParam;
  readonly createdAt: number;
  disconnected = false;
  connectedTo: unknown = null;
  constructor(ctx: FakeAudioContext) {
    this.gain = new FakeAudioParam(ctx, 1);
    this.createdAt = ctx.currentTime;
  }
  connect(target: unknown): unknown {
    this.connectedTo = target;
    return target;
  }
  disconnect(): void {
    this.disconnected = true;
    this.connectedTo = null;
  }
}

export class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt: number | null = null;
  startOffset: number | null = null;
  stopAt: number | null = null;
  disconnected = false;
  connectedTo: unknown = null;
  onended: (() => void) | null = null;
  private ended = false;

  connect(target: unknown): unknown {
    this.connectedTo = target;
    return target;
  }
  start(when = 0, offset = 0): void {
    this.startedAt = when;
    this.startOffset = offset;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
  disconnect(): void {
    this.disconnected = true;
    this.connectedTo = null;
  }
  /** Called by the context clock: fires `onended` once when the stop time has passed. */
  fireEndedIfDue(now: number): void {
    if (this.ended || this.stopAt === null || this.stopAt > now) return;
    this.ended = true;
    this.onended?.();
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: AudioContextState = 'running';
  readonly destination = { kind: 'destination' };
  readonly gains: FakeGainNode[] = [];
  readonly sources: FakeBufferSource[] = [];
  resumeCalls = 0;
  /** When false, resume() leaves the state unchanged (simulates a stuck/blocked context). */
  resumeSucceeds = true;
  private listeners = new Set<() => void>();

  createGain(): FakeGainNode {
    const g = new FakeGainNode(this);
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(): Promise<AudioBuffer> {
    return {} as AudioBuffer;
  }
  async resume(): Promise<void> {
    this.resumeCalls += 1;
    if (this.resumeSucceeds) this.setState('running');
  }
  addEventListener(type: string, fn: () => void): void {
    if (type === 'statechange') this.listeners.add(fn);
  }
  removeEventListener(type: string, fn: () => void): void {
    if (type === 'statechange') this.listeners.delete(fn);
  }
  /** Changes the state and dispatches `statechange`, like the browser does. */
  setState(state: AudioContextState): void {
    if (this.state === state) return;
    this.state = state;
    for (const fn of [...this.listeners]) fn();
  }
  /** Moves the clock forward and fires `onended` for sources whose stop time has passed. */
  advanceTo(time: number): void {
    this.currentTime = time;
    for (const s of this.sources) s.fireEndedIfDue(time);
  }
  advanceBy(seconds: number): void {
    this.advanceTo(this.currentTime + seconds);
  }
  asContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
