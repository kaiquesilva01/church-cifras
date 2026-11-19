import { describe, expect, it } from 'vitest';
import { dayEyebrow } from './screenDate';

describe('dayEyebrow', () => {
  it('writes the weekday, day and short month in Portuguese', () => {
    expect(dayEyebrow(new Date(2026, 10, 17))).toBe('Terça, 17 Nov');
    expect(dayEyebrow(new Date(2026, 10, 22))).toBe('Domingo, 22 Nov');
    expect(dayEyebrow(new Date(2026, 0, 1))).toBe('Quinta, 1 Jan');
  });
});
