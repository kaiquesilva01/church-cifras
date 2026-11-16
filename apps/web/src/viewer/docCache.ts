import type { PdfDocument } from './PdfPages';

export interface CachedDoc {
  doc: PdfDocument;
  /** Original bytes (pdf.js got a copy), kept for the download and the writer. */
  bytes: Uint8Array;
}

// LRU of open documents by storage path: switching back to a key already seen costs nothing.
// Evicted and cleared documents are destroyed to free the pdf.js worker memory.
export function createDocCache(limit = 3) {
  const entries = new Map<string, CachedDoc>();
  const destroy = (entry: CachedDoc): void => {
    try {
      void Promise.resolve(entry.doc.destroy?.()).catch(() => undefined);
    } catch {
      // Already gone.
    }
  };
  return {
    /** Reads without touching the recency (safe during render). */
    peek: (path: string): CachedDoc | undefined => entries.get(path),
    get(path: string): CachedDoc | undefined {
      const entry = entries.get(path);
      if (entry) {
        entries.delete(path);
        entries.set(path, entry);
      }
      return entry;
    },
    /** `keep` is the path on screen: it is never evicted, whatever its recency. */
    set(path: string, entry: CachedDoc, keep?: string): void {
      if (entries.has(path)) return destroy(entry);
      entries.set(path, entry);
      while (entries.size > limit) {
        const victim = [...entries.keys()].find((key) => key !== keep && key !== path);
        if (victim === undefined) break;
        destroy(entries.get(victim)!);
        entries.delete(victim);
      }
    },
    clear(): void {
      for (const entry of entries.values()) destroy(entry);
      entries.clear();
    },
  };
}

export type DocCache = ReturnType<typeof createDocCache>;
