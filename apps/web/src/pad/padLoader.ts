import { PAD_SAMPLES, type PadNote } from './padNotes';

export interface PadLoaderDeps {
  fetchBytes: (path: string) => Promise<Uint8Array>;
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  maxBuffers?: number;
  /** Whether a finished decode is still wanted; unwanted buffers are returned but not cached. */
  keep?: (note: PadNote) => boolean;
}

export function createPadLoader(deps: PadLoaderDeps): {
  load(note: PadNote): Promise<AudioBuffer>;
} {
  const { fetchBytes, decode, maxBuffers = 2, keep } = deps;
  const ready = new Map<PadNote, AudioBuffer>(); // ordem de inserção = LRU
  const inFlight = new Map<PadNote, Promise<AudioBuffer>>();

  async function fetchAndDecode(note: PadNote): Promise<AudioBuffer> {
    const bytes = await fetchBytes(PAD_SAMPLES[note].storagePath);
    // decodeAudioData destaca o buffer: entrega uma cópia.
    return decode(bytes.slice().buffer);
  }

  return {
    load(note) {
      const cached = ready.get(note);
      if (cached) {
        ready.delete(note);
        ready.set(note, cached);
        return Promise.resolve(cached);
      }
      const pending = inFlight.get(note);
      if (pending) return pending;

      const promise = fetchAndDecode(note)
        .then((buffer) => {
          if (keep && !keep(note)) return buffer;
          ready.set(note, buffer);
          while (ready.size > maxBuffers) {
            const oldest = ready.keys().next().value;
            if (oldest === undefined) break;
            ready.delete(oldest);
          }
          return buffer;
        })
        .finally(() => inFlight.delete(note));
      inFlight.set(note, promise);
      return promise;
    },
  };
}
