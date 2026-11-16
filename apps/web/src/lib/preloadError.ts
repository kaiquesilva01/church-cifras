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
  navigator?: {
    onLine?: boolean;
    serviceWorker?: {
      getRegistration(): Promise<
        { waiting?: { postMessage(message: unknown): void } | null } | undefined
      >;
      addEventListener(type: 'controllerchange', listener: () => void): void;
    };
  };
}

// sessionStorage can throw (privacy modes, disabled storage): the guard must never break the app.
function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

const SKIP_WAITING_FALLBACK_MS = 3_000;

// With `registerType: 'prompt'` a new service worker waits after a deploy, and a plain reload would
// still serve the old precached index.html. Activate the waiting worker first, then reload once.
function reloadPage(win: WindowLike): void {
  const sw = win.navigator?.serviceWorker;
  if (!sw) {
    win.location.reload();
    return;
  }
  let reloaded = false;
  const reloadOnce = (): void => {
    if (reloaded) return;
    reloaded = true;
    win.location.reload();
  };
  sw.getRegistration().then((registration) => {
    const waiting = registration?.waiting;
    if (!waiting) return reloadOnce();
    sw.addEventListener('controllerchange', reloadOnce);
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // If the swap never signals, reload anyway.
    setTimeout(reloadOnce, SKIP_WAITING_FALLBACK_MS);
  }, reloadOnce);
}

// After a deploy the hashed chunks of the old build disappear: a lazy import then fails. Reload to pick
// up the new index.html. The marker holds the time of the last reload: a failure right after one (a
// persistent problem) does not loop, while a later deploy in the same session reloads again. Without a
// writable marker the cooldown cannot work, and offline a reload would only show the browser error page:
// in both cases do not reload.
export function installPreloadErrorReload(
  win: WindowLike,
  storage: StorageLike,
  now: () => number = Date.now,
): void {
  win.addEventListener('vite:preloadError', (event) => {
    if (win.navigator?.onLine === false) return;
    const last = Number(attempt(() => storage.getItem(RELOAD_MARKER)) ?? 0);
    if (last > 0 && now() - last <= RELOAD_COOLDOWN_MS) return;
    const marked =
      attempt(() => {
        storage.setItem(RELOAD_MARKER, String(now()));
        return true;
      }) === true;
    if (!marked) return;
    event.preventDefault();
    reloadPage(win);
  });
}

/** The app booted: the next failure is a new one, not a loop. */
export function clearReloadMarker(storage: StorageLike): void {
  attempt(() => storage.removeItem(RELOAD_MARKER));
}

/** Keeps the marker for a while after boot: a chunk that fails right after a reload is no new deploy. */
export function scheduleClearReloadMarker(
  storage: StorageLike,
  delayMs: number = RELOAD_COOLDOWN_MS,
): void {
  setTimeout(() => clearReloadMarker(storage), delayMs);
}

const NO_STORAGE: StorageLike = {
  getItem: () => null,
  setItem: () => {
    throw new Error('sessionStorage unavailable');
  },
  removeItem: () => undefined,
};

/** `window.sessionStorage` itself throws when storage is blocked; fall back to a no-op. */
export function getSessionStorage(win: { sessionStorage: StorageLike }): StorageLike {
  return attempt(() => win.sessionStorage) ?? NO_STORAGE;
}
