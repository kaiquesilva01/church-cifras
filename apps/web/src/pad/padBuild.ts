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
  const loader = createPadLoader({ fetchBytes, decode: (b) => ctx.decodeAudioData(b) });
  return createPadEngine({ ctx, load: loader.load, onGiveUp });
}
