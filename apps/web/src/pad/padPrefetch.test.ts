import { describe, expect, it, vi } from 'vitest';
import { createPadPrefetcher } from './padPrefetch';

const bytes = new Uint8Array([1, 2, 3]);

describe('createPadPrefetcher', () => {
  it('baixa cada nota uma única vez, em sequência', async () => {
    const fetchBytes = vi.fn().mockResolvedValue(bytes);
    const prefetch = createPadPrefetcher(fetchBytes);
    prefetch(['C', 'C', 'D']);
    await vi.waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(2));
    expect(fetchBytes.mock.calls.map((c) => c[0])).toEqual([
      'pads/v1/DS04-C.m4a',
      'pads/v1/DS06-D.m4a',
    ]);
    prefetch(['C']);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchBytes).toHaveBeenCalledTimes(2);
  });

  it('não lança em erro de rede e permite nova tentativa', async () => {
    const fetchBytes = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(bytes);
    const prefetch = createPadPrefetcher(fetchBytes);
    expect(() => prefetch(['C'])).not.toThrow();
    await vi.waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 10));
    prefetch(['C']);
    await vi.waitFor(() => expect(fetchBytes).toHaveBeenCalledTimes(2));
  });
});
