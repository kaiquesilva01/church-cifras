/**
 * JS model of one AudioParam's automation timeline (no Web Audio imports). The engine schedules
 * every event itself, so it can compute the value at any time analytically instead of trusting
 * `AudioParam.value`, whose getter is not guaranteed to report the automated value everywhere.
 * Covers only the event kinds the engine uses: set, linear ramp, value curve and cancel.
 */
type GainEvent =
  | { type: 'set'; time: number; value: number }
  | { type: 'linear'; time: number; value: number }
  | { type: 'curve'; time: number; duration: number; values: Float32Array };

export class GainSchedule {
  private events: GainEvent[] = [];
  constructor(private readonly initial: number) {}

  private add(event: GainEvent): void {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time); // stable: ties keep insertion order
  }

  setValueAtTime(value: number, time: number): void {
    this.add({ type: 'set', time, value });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.add({ type: 'linear', time, value });
  }

  setValueCurveAtTime(values: Float32Array, time: number, duration: number): void {
    this.add({ type: 'curve', time, duration, values: Float32Array.from(values) });
  }

  /** Same rule as the spec: drops events at or after `time` and any curve still active at it. */
  cancelScheduledValues(time: number): void {
    this.events = this.events.filter(
      (e) => !(e.time >= time || (e.type === 'curve' && e.time + e.duration > time)),
    );
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
