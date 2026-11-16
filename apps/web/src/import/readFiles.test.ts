import { describe, expect, it } from 'vitest';
import { runPool } from './readFiles';

describe('runPool', () => {
  it('runs at most `limit` tasks at once and finishes all', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      seen.push(item);
    });
    expect(peak).toBe(2);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
