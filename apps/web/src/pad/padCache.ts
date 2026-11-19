import { PAD_NOTES, PAD_SAMPLES, type PadNote } from './padNotes';

/** Cache that the service worker fills with the pad loops (PAD_CACHE in build/pwaConfig.ts). */
export const PAD_CACHE_NAME = 'cifras-pads';

const noteByPath = new Map<string, PadNote>(PAD_NOTES.map((n) => [PAD_SAMPLES[n].storagePath, n]));
// Storage media URLs carry the object path encoded: `.../o/pads%2Fv1%2FDS04-C.m4a?alt=media&...`.
const noteByObject = new Map<string, PadNote>(
  PAD_NOTES.map((n) => [encodeURIComponent(PAD_SAMPLES[n].storagePath), n]),
);

/** The tone of a Storage path (`pads/v1/DS04-C.m4a`); null for anything else. */
export function noteForPadPath(path: string): PadNote | null {
  return noteByPath.get(path) ?? null;
}

/** The tone of a cached Storage media URL; null for other objects or other versions of the loops. */
export function noteForPadUrl(url: string): PadNote | null {
  const object = /\/o\/([^?#]+)/.exec(url)?.[1];
  return object ? (noteByObject.get(object) ?? null) : null;
}

/**
 * Tones whose loop is already saved on this device (in the service worker's pad cache).
 * Empty without the Cache API, without a service worker yet, or when the browser refuses access.
 */
export async function readCachedPadNotes(
  storage: Pick<CacheStorage, 'has' | 'open'> | undefined = globalThis.caches,
): Promise<Set<PadNote>> {
  const found = new Set<PadNote>();
  if (!storage) return found;
  try {
    // `open` would create an empty cache: only look when the worker has made one.
    if (!(await storage.has(PAD_CACHE_NAME))) return found;
    const cache = await storage.open(PAD_CACHE_NAME);
    for (const request of await cache.keys()) {
      const note = noteForPadUrl(request.url);
      if (note) found.add(note);
    }
  } catch {
    // no Cache API (insecure context) or blocked: no tone is shown as saved
  }
  return found;
}
