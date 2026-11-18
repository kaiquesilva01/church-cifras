import { createPadEngine, type PadEngine } from './padEngine';
import { createPadLoader } from './padLoader';

/** Lazy chunk: wires the loader and the engine onto an already-created AudioContext. */
export function buildPadEngine({
  ctx,
  fetchBytes,
  onGiveUp,
}: {
  ctx: AudioContext;
  fetchBytes: (path: string) => Promise<Uint8Array>;
  onGiveUp: () => void;
}): PadEngine {
  // Late-bound: the loader only caches what the engine is still heading to.
  let engine: PadEngine | null = null;
  const loader = createPadLoader({
    fetchBytes,
    decode: (b) => ctx.decodeAudioData(b),
    keep: (note) => engine?.note === note,
  });
  engine = createPadEngine({ ctx, load: loader.load, onGiveUp });
  return engine;
}
