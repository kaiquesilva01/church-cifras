import { PAD_SAMPLES, type PadNote } from './padNotes';

/** Aquece o cache HTTP/SW baixando os samples em sequência; nunca decodifica. */
export function createPadPrefetcher(
  fetchBytes: (path: string) => Promise<Uint8Array>,
): (notes: readonly PadNote[]) => void {
  const requested = new Set<PadNote>();
  let queue: Promise<void> = Promise.resolve();

  return (notes) => {
    for (const note of notes) {
      if (requested.has(note)) continue;
      requested.add(note);
      queue = queue.then(async () => {
        try {
          await fetchBytes(PAD_SAMPLES[note].storagePath);
        } catch {
          requested.delete(note);
        }
      });
    }
  };
}
