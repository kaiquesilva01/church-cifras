import { describe, expect, it } from 'vitest';
import { GainSchedule } from './padGainModel';

describe('GainSchedule', () => {
  it('starts at the initial value', () => {
    expect(new GainSchedule(0.7).valueAt(5)).toBe(0.7);
  });

  it('follows set then a linear ramp', () => {
    const s = new GainSchedule(1);
    s.setValueAtTime(0, 10);
    s.linearRampToValueAtTime(1, 10.05);
    expect(s.valueAt(9)).toBe(1);
    expect(s.valueAt(10)).toBe(0);
    expect(s.valueAt(10.025)).toBeCloseTo(0.5, 6);
    expect(s.valueAt(11)).toBe(1);
  });

  it('interpolates a value curve and holds its last point', () => {
    const s = new GainSchedule(1);
    s.setValueCurveAtTime(Float32Array.from([1, 0.5, 0]), 2, 2);
    expect(s.valueAt(2)).toBe(1);
    expect(s.valueAt(3)).toBeCloseTo(0.5, 6);
    expect(s.valueAt(3.5)).toBeCloseTo(0.25, 6);
    expect(s.valueAt(10)).toBe(0);
  });

  it('cancel drops later events and an active curve, so a re-pin restarts from the given value', () => {
    const s = new GainSchedule(1);
    s.setValueCurveAtTime(Float32Array.from([1, 0]), 2, 4);
    const mid = s.valueAt(4);
    s.cancelScheduledValues(4);
    s.setValueAtTime(mid, 4);
    expect(s.valueAt(4)).toBeCloseTo(0.5, 6);
    expect(s.valueAt(9)).toBeCloseTo(0.5, 6);
  });
});
