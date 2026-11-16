import type { ChordWriter } from './overlayWriter';

// Skeleton behind a flag: rewriting the content stream is not implemented yet.
export function createRewriteWriter(): ChordWriter {
  return {
    write: () => Promise.reject(new Error('Modo de reescrita ainda não disponível.')),
  };
}
