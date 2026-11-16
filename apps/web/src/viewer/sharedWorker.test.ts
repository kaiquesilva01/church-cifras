import { describe, expect, it, vi } from 'vitest';
import { createSharedWorker } from './sharedWorker';

describe('createSharedWorker', () => {
  it('reuses one worker and recreates it once destroyed', () => {
    const make = vi.fn(() => ({ destroyed: false, promise: Promise.resolve() }));
    const get = createSharedWorker(make);
    const first = get();
    expect(get()).toBe(first);
    first.destroyed = true;
    expect(get()).not.toBe(first);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('recreates the worker when its setup failed', async () => {
    const failing = { destroyed: false, promise: Promise.reject(new Error('boom')) };
    const make = vi
      .fn()
      .mockReturnValueOnce(failing)
      .mockReturnValue({ destroyed: false, promise: Promise.resolve() });
    const get = createSharedWorker(make);
    expect(get()).toBe(failing);
    await new Promise((r) => setTimeout(r, 0));
    expect(get()).not.toBe(failing);
  });
});
