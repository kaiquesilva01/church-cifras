import type { KeyName } from '@cifras/chords';
import { useEffect } from 'react';
import { padNoteFor } from './padNotes';
import { usePad } from './usePad';

const IDLE_FALLBACK_MS = 1500;

interface Options {
  /** The saved key on screen (never the Mudar tom preview). `null` while arrangements load. */
  key: KeyName | null;
  ready: boolean;
  setlistKeys: readonly KeyName[];
}

/** Makes a playing pad follow the viewer's key and warms the samples once the cifra is on screen. */
export function usePadViewerSync({ key, ready, setlistKeys }: Options): void {
  const pad = usePad();
  const follow = pad?.follow;
  const prefetch = pad?.prefetch;

  useEffect(() => {
    follow?.(key);
  }, [follow, key]);

  const setlistSignature = setlistKeys.join('|');
  useEffect(() => {
    if (!ready || !prefetch) return;
    const keys = [key, ...setlistKeys].filter(
      (k): k is KeyName => k !== null && padNoteFor(k) !== null,
    );
    if (keys.length === 0) return;
    const run = (): void => prefetch(keys);
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(run, IDLE_FALLBACK_MS);
    return () => clearTimeout(id);
    // setlistKeys is tracked by value through its signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetch, ready, key, setlistSignature]);
}
