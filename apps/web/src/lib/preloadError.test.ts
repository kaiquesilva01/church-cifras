import { describe, expect, it, vi } from 'vitest';
import {
  clearReloadMarker,
  installPreloadErrorReload,
  RELOAD_MARKER,
  scheduleClearReloadMarker,
} from './preloadError';

function setup(now: { value: number }, broken = false) {
  const store = new Map<string, string>();
  const fail = (): never => {
    throw new Error('denied');
  };
  const storage = {
    getItem: broken ? fail : (k: string) => store.get(k) ?? null,
    setItem: broken ? fail : (k: string, v: string) => void store.set(k, v),
    removeItem: broken ? fail : (k: string) => void store.delete(k),
  };
  const listeners: Array<(event: Event) => void> = [];
  const win = {
    addEventListener: (_: string, l: (event: Event) => void) => void listeners.push(l),
    location: { reload: vi.fn() },
  };
  installPreloadErrorReload(win, storage, () => now.value);
  const fire = () => {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.forEach((l) => l(event));
    return event;
  };
  return { win, fire, store, storage };
}

describe('installPreloadErrorReload', () => {
  it('reloads once on preload error and does not loop', () => {
    const now = { value: 1_000_000 };
    const { win, fire, store } = setup(now);
    const event = fire();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(store.get(RELOAD_MARKER)).toBe('1000000');
    now.value += 2_000;
    const second = fire();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('reloads again for a second deploy later in the same session', () => {
    const now = { value: 1_000_000 };
    const { win, fire } = setup(now);
    fire();
    now.value += 10_001;
    fire();
    expect(win.location.reload).toHaveBeenCalledTimes(2);
  });

  it('clears the marker after a successful boot', () => {
    const now = { value: 5 };
    const { fire, store, storage } = setup(now);
    fire();
    clearReloadMarker(storage);
    expect(store.has(RELOAD_MARKER)).toBe(false);
  });

  it('keeps the marker for 10 s after boot, then clears it', () => {
    vi.useFakeTimers();
    try {
      const now = { value: 5 };
      const { fire, store, storage } = setup(now);
      fire();
      scheduleClearReloadMarker(storage);
      vi.advanceTimersByTime(9_999);
      expect(store.has(RELOAD_MARKER)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(store.has(RELOAD_MARKER)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives an unavailable sessionStorage', () => {
    const now = { value: 5 };
    const { win, fire, storage } = setup(now, true);
    expect(() => fire()).not.toThrow();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(() => clearReloadMarker(storage)).not.toThrow();
  });
});
