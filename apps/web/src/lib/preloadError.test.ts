import { describe, expect, it, vi } from 'vitest';
import { installPreloadErrorReload, RELOAD_MARKER } from './preloadError';

function setup(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const listeners: Array<(event: Event) => void> = [];
  const win = {
    addEventListener: (_: string, l: (event: Event) => void) => void listeners.push(l),
    location: { reload: vi.fn() },
  };
  installPreloadErrorReload(win, storage);
  const fire = () => {
    const event = { preventDefault: vi.fn() } as unknown as Event;
    listeners.forEach((l) => l(event));
    return event;
  };
  return { win, fire, store };
}

describe('installPreloadErrorReload', () => {
  it('reloads once on preload error', () => {
    const { win, fire, store } = setup();
    const event = fire();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(store.has(RELOAD_MARKER)).toBe(true);
    // a second failure in the same session does not loop
    const second = fire();
    expect(win.location.reload).toHaveBeenCalledTimes(1);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });
});
