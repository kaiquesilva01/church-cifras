import { describe, expect, it } from 'vitest';
import { parseKey } from '@cifras/chords';
import type { Replacement, TransposePlan } from '@cifras/chords';
import { countCollisions, overlayOps } from '../src/ops';

const key = (name: string) => parseKey(name)!;

function replacement(overrides: Partial<Replacement> = {}): Replacement {
  return {
    page: 1,
    x: 100,
    y: 700,
    width: 12,
    fontSize: 10,
    fontName: 'Courier-Bold',
    ascent: 0.8,
    descent: -0.2,
    bold: true,
    original: 'Bb',
    replacement: 'D',
    newWidth: 6,
    collides: false,
    runKey: '1:700:100',
    spaceWidth: 6,
    limitX: 580.5,
    nextIsChord: true,
    ...overrides,
  };
}

function plan(chords: Replacement[], keyIndicator: Replacement | null = null): TransposePlan {
  return {
    from: key('Bb'),
    to: key('D'),
    chords,
    keyIndicator,
    chordCount: chords.length,
    collisions: chords.filter((c) => c.collides).length,
    suspectSegments: [],
    ignoredChordLines: 0,
  };
}

describe('overlayOps', () => {
  it('rect covers the wider of old and new text', () => {
    const [wideNew] = overlayOps(plan([replacement({ width: 12, newWidth: 30 })]));
    const [wideOld] = overlayOps(plan([replacement({ width: 30, newWidth: 12 })]));
    // pad = 0.04 * 10 = 0.4
    expect(wideNew!.rect.width).toBeCloseTo(30.8, 10);
    expect(wideOld!.rect.width).toBeCloseTo(30.8, 10);
    expect(wideNew!.rect.x).toBeCloseTo(99.6, 10);
  });

  it('rect height uses ascent and descent', () => {
    const [op] = overlayOps(plan([replacement({ ascent: 0.9, descent: -0.3, fontSize: 20 })]));
    // pad = 0.8; y = 700 + (-0.3 * 20) - 0.8; height = (0.9 + 0.3) * 20 + 1.6
    expect(op!.rect.y).toBeCloseTo(693.2, 10);
    expect(op!.rect.height).toBeCloseTo(25.6, 10);
  });

  it('draws the new text at the original baseline and size with the chosen font', () => {
    const [op] = overlayOps(plan([replacement()]));
    expect(op!.text).toEqual({ value: 'D', x: 100, y: 700, fontId: 'mono-bold', fontSize: 10 });
    expect(op!.kind).toBe('chord');
    expect(op!.page).toBe(1);
  });

  it('keeps the collision flag', () => {
    const ops = overlayOps(
      plan([replacement({ collides: true }), replacement({ y: 680, runKey: 'other' })]),
    );
    expect(ops.map((o) => o.collides)).toEqual([true, false]);
  });

  it('emits ops for key indicator', () => {
    const indicator = replacement({
      original: 'Bb',
      replacement: '(D)',
      fontName: 'Arial',
      bold: false,
      page: 2,
      fontSize: 16,
      newWidth: 20,
    });
    const ops = overlayOps(plan([replacement()], indicator));
    expect(ops).toHaveLength(2);
    const last = ops[1]!;
    expect(last.kind).toBe('key');
    expect(last.page).toBe(2);
    expect(last.text.fontId).toBe('sans-regular');
    expect(last.text.value).toBe('(D)');
  });

  it('returns nothing for an empty plan', () => {
    expect(overlayOps(plan([]))).toEqual([]);
  });

  describe('spacing', () => {
    // spaceWidth 6: two spaces = 12. All chords on page 1, baseline 700.
    it('pushes the next chord to two spaces after a colliding chord', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, runKey: 'b', replacement: 'Bm', newWidth: 12, limitX: 300 }),
        ]),
      );
      expect(ops[1]!.text.x).toBe(136);
      expect(ops[0]!.collides).toBe(false);
      expect(ops[1]!.collides).toBe(false);
    });

    it('chains: a pushed chord that now collides pushes the following one', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, runKey: 'b', newWidth: 12, limitX: 140 }),
          replacement({ x: 140, runKey: 'c', newWidth: 12, limitX: 300 }),
        ]),
      );
      // second: 136..148 > limitX 140, so third goes to 148 + 12 = 160
      expect(ops.map((o) => o.text.x)).toEqual([100, 136, 160]);
      expect(ops.map((o) => o.collides)).toEqual([false, false, false]);
    });

    it('does not move a chord that keeps at least one space from its predecessor', () => {
      const ops = overlayOps(
        plan([replacement({ x: 100, newWidth: 6 }), replacement({ x: 112, runKey: 'b' })]),
      );
      // gap 112 - 106 = 6 = one space
      expect(ops[1]!.text.x).toBe(112);
      expect(ops[0]!.collides).toBe(false);
    });

    it('tolerates float noise on the one-space gap but pushes clearly smaller gaps', () => {
      const pair = (nextX: number) =>
        overlayOps(
          plan([
            replacement({ x: 100, newWidth: 6, collides: true, limitX: 110 }),
            replacement({ x: nextX, runKey: 'b' }),
          ]),
        );
      // prevEnd 106, spaceWidth 6, fontSize 10: threshold = 6 - 0.05 * 10 = 5.5
      expect(pair(112 - 1e-6)[1]!.text.x).toBe(112 - 1e-6);
      expect(pair(112)[1]!.text.x).toBe(112);
      expect(pair(112 - 1e-6)[0]!.collides).toBe(false);
      // 1 pt below the threshold: gap 4.5
      expect(pair(110.5)[1]!.text.x).toBe(118);
    });

    it('does not push when the plan flags a collision but the gap is one space (proportional font)', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 12, spaceWidth: 3, collides: true, limitX: 110 }),
          replacement({ x: 115, runKey: 'b', newWidth: 12, spaceWidth: 3 }),
        ]),
      );
      expect(ops.map((o) => o.text.x)).toEqual([100, 115]);
      expect(ops.map((o) => o.collides)).toEqual([false, false]);
    });

    it('pushes to exactly two spaces when the gap is smaller than one space', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 12, spaceWidth: 3, collides: true, limitX: 108 }),
          replacement({ x: 113, runKey: 'b', newWidth: 12, spaceWidth: 3 }),
        ]),
      );
      // gap 1 < 3: successor goes to 112 + 6 = 118
      expect(ops[1]!.text.x).toBe(118);
      expect(ops[0]!.collides).toBe(false);
    });

    it('keeps output order for unsorted input while spreading by x', () => {
      const first = replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 });
      const second = replacement({ x: 118, runKey: 'b', replacement: 'Bm', limitX: 300 });
      const ops = overlayOps(plan([second, first]));
      expect(ops.map((o) => o.text.value)).toEqual(['Bm', 'D']);
      expect(ops.map((o) => o.text.x)).toEqual([136, 100]);
    });

    it('never moves left', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 200, runKey: 'b' }),
        ]),
      );
      expect(ops[1]!.text.x).toBe(200);
    });

    it('does not move the neighbour when the next token is not a chord', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118, nextIsChord: false }),
          replacement({ x: 118, runKey: 'b' }),
        ]),
      );
      expect(ops[1]!.text.x).toBe(118);
      expect(ops[0]!.collides).toBe(true);
    });

    it('caps the push of a chord without a chord after it at its margin', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, runKey: 'b', newWidth: 12, limitX: 140, nextIsChord: false }),
        ]),
      );
      // wanted 136, capped to 140 - 12 = 128; gap 4 < one space, so the first stays red
      expect(ops[1]!.text.x).toBe(128);
      expect(ops[1]!.collides).toBe(false);
      expect(ops[0]!.collides).toBe(true);
    });

    it('accepts the capped push when two spaces still fit', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, runKey: 'b', newWidth: 12, limitX: 148, nextIsChord: false }),
        ]),
      );
      expect(ops[1]!.text.x).toBe(136);
      expect(ops.map((o) => o.collides)).toEqual([false, false]);
    });

    it('never pushes a chord without a chord after it past its margin', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({
            x: 118,
            runKey: 'b',
            newWidth: 12,
            limitX: 125,
            nextIsChord: false,
            collides: true,
          }),
        ]),
      );
      expect(ops[1]!.text.x).toBe(118);
      expect(ops[0]!.collides).toBe(true);
      expect(ops[1]!.collides).toBe(true);
    });

    it('rect covers the original and the new position of a pushed chord', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, runKey: 'b', width: 12, newWidth: 12, limitX: 300 }),
        ]),
      );
      // union of [118, 130] and [136, 148], pad 0.4
      expect(ops[1]!.rect.x).toBeCloseTo(117.6, 10);
      expect(ops[1]!.rect.width).toBeCloseTo(30.8, 10);
    });

    it('treats baselines up to 1 pt apart as one line, like the pdf reader', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, y: 700, newWidth: 24, collides: true, limitX: 118 }),
          replacement({ x: 118, y: 700.6, runKey: 'b', newWidth: 12, limitX: 130 }),
          replacement({ x: 130, y: 700, runKey: 'c', newWidth: 12, limitX: 300 }),
        ]),
      );
      // Bm is the true next chord of the first: pushed to 136; it then collides and pushes G
      expect(ops.map((o) => o.text.x)).toEqual([100, 136, 160]);
      expect(ops.map((o) => o.collides)).toEqual([false, false, false]);
    });

    it('only chords of the same page and baseline interact', () => {
      const collider = { x: 100, newWidth: 24, collides: true, limitX: 118 };
      const otherLine = overlayOps(
        plan([replacement(collider), replacement({ x: 118, y: 680, runKey: 'b' })]),
      );
      expect(otherLine[1]!.text.x).toBe(118);
      const otherPage = overlayOps(
        plan([replacement(collider), replacement({ x: 118, page: 2, runKey: 'b' })]),
      );
      expect(otherPage[1]!.text.x).toBe(118);
    });
  });
});

describe('countCollisions', () => {
  it('counts ops that collide, not plan collisions', () => {
    const ops = overlayOps(
      plan([
        replacement({ collides: false }),
        replacement({ x: 200, runKey: '1:700:200', collides: true, nextIsChord: false }),
        replacement({ x: 300, runKey: '1:700:300', collides: true }),
      ]),
    );
    expect(countCollisions(ops)).toBe(2);
    expect(countCollisions([])).toBe(0);
  });

  it('does not count a collision resolved by spacing', () => {
    const ops = overlayOps(
      plan([
        replacement({ x: 100, newWidth: 24, collides: true, limitX: 118 }),
        replacement({ x: 118, runKey: 'b', newWidth: 12, limitX: 300 }),
      ]),
    );
    expect(countCollisions(ops)).toBe(0);
  });
});
