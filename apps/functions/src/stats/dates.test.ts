import { describe, expect, it } from 'vitest';
import { addDays, todayInSaoPaulo } from './dates';

describe('todayInSaoPaulo', () => {
  it('uses the Sao Paulo calendar day, not UTC', () => {
    expect(todayInSaoPaulo(new Date('2026-11-20T02:30:00Z'))).toBe('2026-11-19');
    expect(todayInSaoPaulo(new Date('2026-11-20T03:00:00Z'))).toBe('2026-11-20');
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('goes backwards across a month boundary', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('subtracts days within a month', () => {
    expect(addDays('2026-11-22', -2)).toBe('2026-11-20');
  });
});
