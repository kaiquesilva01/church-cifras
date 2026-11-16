export const RELOAD_MARKER = 'cifras:preload-reload';
const RELOAD_COOLDOWN_MS = 10_000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface WindowLike {
  addEventListener(type: 'vite:preloadError', listener: (event: Event) => void): void;
  location: { reload(): void };
}

// sessionStorage can throw (privacy modes, disabled storage): the guard must never break the app.
function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

// After a deploy the hashed chunks of the old build disappear: a lazy import then fails. Reload to pick
// up the new index.html. The marker holds the time of the last reload: a failure right after one (a
// persistent problem) does not loop, while a later deploy in the same session reloads again.
export function installPreloadErrorReload(
  win: WindowLike,
  storage: StorageLike,
  now: () => number = Date.now,
): void {
  win.addEventListener('vite:preloadError', (event) => {
    const last = Number(attempt(() => storage.getItem(RELOAD_MARKER)) ?? 0);
    if (last > 0 && now() - last <= RELOAD_COOLDOWN_MS) return;
    attempt(() => storage.setItem(RELOAD_MARKER, String(now())));
    event.preventDefault();
    win.location.reload();
  });
}

/** The app booted: the next failure is a new one, not a loop. */
export function clearReloadMarker(storage: StorageLike): void {
  attempt(() => storage.removeItem(RELOAD_MARKER));
}

const NO_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/** `window.sessionStorage` itself throws when storage is blocked; fall back to a no-op. */
export function getSessionStorage(win: { sessionStorage: StorageLike }): StorageLike {
  return attempt(() => win.sessionStorage) ?? NO_STORAGE;
}
