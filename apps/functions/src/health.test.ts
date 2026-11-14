import { describe, expect, it } from 'vitest';
import { buildHealth } from './health';

describe('buildHealth', () => {
  it('returns ok status with ISO time', () => {
    expect(buildHealth(new Date('2026-01-02T03:04:05.000Z'))).toEqual({
      status: 'ok',
      service: 'church-cifras',
      time: '2026-01-02T03:04:05.000Z',
    });
  });
});
