// Full entry: pulls in pdf-lib and fontkit. Import it dynamically; use `./light` for types and ops.
export * from './light';
export { createMeasure, loadFonts } from './measure';
export type { LoadedFonts } from './measure';
export { createOverlayWriter } from './overlayWriter';
export type { ChordWriter } from './overlayWriter';
export { createRewriteWriter } from './rewriteWriter';
