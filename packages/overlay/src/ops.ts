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

// Chords of one pdf run whose original tokens sit within this many spaces of each other were typed
// as running text ("A/C#G9 A F#mBm"), not aligned to lyrics.
const PACKED_GAP_SPACES = 1.5;

const isPacked = (prev: Replacement, next: Replacement): boolean =>
  prev.page === next.page &&
  prev.runKey === next.runKey &&
  next.x - (prev.x + prev.width) <= PACKED_GAP_SPACES * prev.spaceWidth;

// Consecutive chords of a packed run that include a collision become one replacement: the new
// chords joined by single spaces from the first token, checked against what follows the group.
function reflow(group: Replacement[]): Replacement {
  const first = group[0]!;
  const last = group[group.length - 1]!;
  const newWidth =
    group.reduce((sum, r) => sum + r.newWidth, 0) + first.spaceWidth * (group.length - 1);
  return {
    ...first,
    width: last.x + last.width - first.x,
    replacement: group.map((r) => r.replacement).join(' '),
    newWidth,
    limitX: last.limitX,
    collides: first.x + newWidth > last.limitX,
  };
}

function reflowPackedRuns(chords: Replacement[]): Replacement[] {
  const result: Replacement[] = [];
  let group: Replacement[] = [];
  const flush = (): void => {
    if (group.length > 1 && group.some((r) => r.collides)) result.push(reflow(group));
    else result.push(...group);
    group = [];
  };
  for (const chord of chords) {
    const prev = group[group.length - 1];
    if (prev && !isPacked(prev, chord)) flush();
    group.push(chord);
  }
  flush();
  return result;
}

// Shared by the PDF writer and the browser preview so both draw exactly the same thing.
export function overlayOps(plan: TransposePlan): OverlayOp[] {
  const ops = reflowPackedRuns(plan.chords).map((c) => toOp(c, 'chord'));
  if (plan.keyIndicator) ops.push(toOp(plan.keyIndicator, 'key'));
  return ops;
}
