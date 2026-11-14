import type { Replacement, TransposePlan } from '@cifras/chords';
import { chooseFont } from './fonts';
import type { FontId } from './fonts';

export interface OverlayOp {
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  text: { value: string; x: number; y: number; fontId: FontId; fontSize: number };
  kind: 'chord' | 'key';
  collides: boolean;
}

const PAD_EM = 0.04;

function toOp(r: Replacement, kind: OverlayOp['kind']): OverlayOp {
  const pad = PAD_EM * r.fontSize;
  return {
    page: r.page,
    rect: {
      x: r.x - pad,
      y: r.y + r.descent * r.fontSize - pad,
      width: Math.max(r.width, r.newWidth) + 2 * pad,
      height: (r.ascent - r.descent) * r.fontSize + 2 * pad,
    },
    text: {
      value: r.replacement,
      x: r.x,
      y: r.y,
      fontId: chooseFont(r.fontName, r.bold),
      fontSize: r.fontSize,
    },
    kind,
    collides: r.collides,
  };
}

// Shared by the PDF writer and the browser preview so both draw exactly the same thing.
export function overlayOps(plan: TransposePlan): OverlayOp[] {
  const ops = plan.chords.map((c) => toOp(c, 'chord'));
  if (plan.keyIndicator) ops.push(toOp(plan.keyIndicator, 'key'));
  return ops;
}
