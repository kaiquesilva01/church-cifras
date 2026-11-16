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
// Same tolerance as SAME_LINE_TOLERANCE in packages/pdf/src/readTextLines.ts (not exported there):
// the reader keeps runs up to 1 pt apart in one TextLine, so chords must group the same way.
const SAME_LINE_TOLERANCE = 1;
const SPREAD_GAP_SPACES = 2;

function toOp(r: Replacement, kind: OverlayOp['kind'], x = r.x, collides = r.collides): OverlayOp {
  const pad = PAD_EM * r.fontSize;
  const left = Math.min(r.x, x);
  const right = Math.max(r.x + r.width, x + r.newWidth);
  return {
    page: r.page,
    rect: {
      x: left - pad,
      y: r.y + r.descent * r.fontSize - pad,
      width: right - left + 2 * pad,
      height: (r.ascent - r.descent) * r.fontSize + 2 * pad,
    },
    text: {
      value: r.replacement,
      x,
      y: r.y,
      fontId: chooseFont(r.fontName, r.bold),
      fontSize: r.fontSize,
    },
    kind,
    collides,
  };
}

interface Spread {
  r: Replacement;
  x: number;
  collides: boolean;
}

// A chord that collides with the next chord pushes it to exactly two spaces after its own new end
// (never left), cascading along the line. Only chords of one page and baseline interact.
export function spreadChords(chords: Replacement[]): Spread[] {
  const result = new Map<Replacement, Spread>();
  const lines: Replacement[][] = [];
  for (const chord of chords) {
    const line = lines.find(
      (l) => l[0]!.page === chord.page && Math.abs(l[0]!.y - chord.y) <= SAME_LINE_TOLERANCE,
    );
    if (line) line.push(chord);
    else lines.push([chord]);
  }
  for (const line of lines) {
    const sorted = [...line].sort((a, b) => a.x - b.x);
    let prev: Spread | null = null;
    for (const r of sorted) {
      let x = r.x;
      if (prev && prev.collides && prev.r.nextIsChord) {
        x = Math.max(r.x, prev.x + prev.r.newWidth + SPREAD_GAP_SPACES * prev.r.spaceWidth);
        prev.collides = false; // the neighbour moved away
      }
      const collides = x !== r.x ? x + r.newWidth > r.limitX : r.collides;
      prev = { r, x, collides };
      result.set(r, prev);
    }
  }
  return chords.map((c) => result.get(c)!);
}

// Shared by the PDF writer and the browser preview so both draw exactly the same thing.
export function overlayOps(plan: TransposePlan): OverlayOp[] {
  const ops = spreadChords(plan.chords).map((s) => toOp(s.r, 'chord', s.x, s.collides));
  if (plan.keyIndicator) ops.push(toOp(plan.keyIndicator, 'key'));
  return ops;
}

// Collisions as the user sees them: counted on the final ops (after spacing), not on plan.collisions.
export function countCollisions(ops: OverlayOp[]): number {
  return ops.filter((op) => op.collides).length;
}
