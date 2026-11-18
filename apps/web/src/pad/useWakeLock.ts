import { useEffect } from 'react';

/**
 * Keeps the screen on while `active` is true (Screen Wake Lock API).
 * Unsupported browsers and rejected requests are ignored silently.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wakeLock) return;

    let cancelled = false;
    let pending = false;
    let sentinel: WakeLockSentinel | null = null;

    const releaseQuietly = (s: WakeLockSentinel) => {
      try {
        s.release().catch(() => {});
      } catch {
        // ignore
      }
    };

    const acquire = async () => {
      if (cancelled || pending || sentinel) return;
      pending = true;
      try {
        const acquired = await wakeLock.request('screen');
        if (cancelled) {
          releaseQuietly(acquired);
          return;
        }
        sentinel = acquired;
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) sentinel = null;
        });
      } catch {
        // NotAllowedError, low battery, etc.: nothing breaks, nothing is shown.
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel) releaseQuietly(sentinel);
      sentinel = null;
    };
  }, [active]);
}
