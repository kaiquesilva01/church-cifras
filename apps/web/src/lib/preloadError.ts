export const RELOAD_MARKER = 'cifras:preload-reload';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface WindowLike {
  addEventListener(type: 'vite:preloadError', listener: (event: Event) => void): void;
  location: { reload(): void };
}

// After a deploy the hashed chunks of the old build disappear: a lazy import then fails. Reload once
// to pick up the new index.html; the sessionStorage marker keeps a persistent failure from looping.
export function installPreloadErrorReload(win: WindowLike, storage: StorageLike): void {
  win.addEventListener('vite:preloadError', (event) => {
    if (storage.getItem(RELOAD_MARKER)) return;
    storage.setItem(RELOAD_MARKER, '1');
    event.preventDefault();
    win.location.reload();
  });
}
