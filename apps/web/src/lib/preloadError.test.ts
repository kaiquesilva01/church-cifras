import { describe, expect, it, vi } from 'vitest';
import {
  clearReloadMarker,
  installPreloadErrorReload,
  RELOAD_MARKER,
  scheduleClearReloadMarker,
} from './preloadError';

function setup(now: { value: number }, broken = false, navigator?: Record<string, unknown>) {
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
    navigator,
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

  it('does not reload when sessionStorage is unavailable (it could loop forever)', () => {
    const now = { value: 5 };
    const { win, fire, storage } = setup(now, true);
    const event = fire();
    expect(win.location.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(() => clearReloadMarker(storage)).not.toThrow();
  });

  it('does not reload while offline', () => {
    const { win, fire, store } = setup({ value: 5 }, false, { onLine: false });
    const event = fire();
    expect(win.location.reload).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(store.has(RELOAD_MARKER)).toBe(false);
  });

  describe('with a service worker', () => {
    function swNavigator(waiting: { postMessage: ReturnType<typeof vi.fn> } | null) {
      const listeners: Array<() => void> = [];
      return {
        listeners,
        navigator: {
          onLine: true,
          serviceWorker: {
            getRegistration: vi.fn(() => Promise.resolve({ waiting })),
            addEventListener: (_: string, l: () => void) => void listeners.push(l),
          },
        },
      };
    }

    it('activates the waiting worker and reloads once on controllerchange', async () => {
      const waiting = { postMessage: vi.fn() };
      const { navigator, listeners } = swNavigator(waiting);
      const { win, fire } = setup({ value: 5 }, false, navigator);
      const event = fire();
      expect(event.preventDefault).toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' }),
      );
      expect(win.location.reload).not.toHaveBeenCalled();
      listeners.forEach((l) => l());
      listeners.forEach((l) => l());
      expect(win.location.reload).toHaveBeenCalledTimes(1);
    });

    it('reloads right away when no worker is waiting', async () => {
      const { navigator } = swNavigator(null);
      const { win, fire } = setup({ value: 5 }, false, navigator);
      fire();
      await vi.waitFor(() => expect(win.location.reload).toHaveBeenCalledTimes(1));
    });

    it('keeps the cooldown with a waiting worker', async () => {
      const waiting = { postMessage: vi.fn() };
      const { navigator } = swNavigator(waiting);
      const now = { value: 5 };
      const { fire } = setup(now, false, navigator);
      fire();
      now.value += 1_000;
      const second = fire();
      expect(second.preventDefault).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(waiting.postMessage).toHaveBeenCalledTimes(1));
    });
  });
});
