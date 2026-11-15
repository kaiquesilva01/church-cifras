// Light entry (`@cifras/overlay/ops`): no pdf-lib and no fontkit, safe for the initial bundle.
export { FONT_FILES, chooseFont } from './fonts';
export type { FontBytesLoader, FontId } from './fonts';
export { countCollisions, overlayOps } from './ops';
export type { OverlayOp } from './ops';
