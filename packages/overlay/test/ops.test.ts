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
      plan([replacement({ collides: true }), replacement({ runKey: 'other' })]),
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

  describe('packed runs', () => {
    // Three chords in one run, 6 apart (one space): D / A/C# / Bm replace A# / F/A / Gm.
    const packed = (overrides: Array<Partial<Replacement>> = []): Replacement[] => [
      replacement({ x: 100, width: 12, replacement: 'D', newWidth: 6, ...overrides[0] }),
      replacement({
        x: 118,
        width: 18,
        replacement: 'A/C#',
        newWidth: 24,
        collides: true,
        ...overrides[1],
      }),
      replacement({ x: 142, width: 12, replacement: 'Bm', newWidth: 12, ...overrides[2] }),
    ];

    it('reflows a packed group that collides into one op with single spaces', () => {
      const ops = overlayOps(plan(packed()));
      expect(ops).toHaveLength(1);
      const [op] = ops;
      expect(op!.text.value).toBe('D A/C# Bm');
      expect(op!.text.x).toBe(100);
      expect(op!.kind).toBe('chord');
      // old extent 100..154 (54); new 6 + 6 + 24 + 6 + 12 = 54; pad 0.4
      expect(op!.rect.x).toBeCloseTo(99.6, 10);
      expect(op!.rect.width).toBeCloseTo(54.8, 10);
      expect(op!.collides).toBe(false);
    });

    it('rect covers the old run when it is wider than the reflowed text', () => {
      const [op] = overlayOps(plan(packed([{ width: 30 }, {}, { width: 30 }])));
      // old: 100 .. 142 + 30 = 172; new 54
      expect(op!.rect.width).toBeCloseTo(72.8, 10);
    });

    it('recomputes the collision of the reflowed text against what follows the group', () => {
      const [op] = overlayOps(plan(packed([{}, {}, { limitX: 140 }])));
      expect(op!.collides).toBe(true);
    });

    it('leaves a packed group alone when nothing collides', () => {
      const ops = overlayOps(plan(packed([{}, { collides: false }])));
      expect(ops.map((o) => o.text.value)).toEqual(['D', 'A/C#', 'Bm']);
    });

    it('does not reflow chords aligned to lyrics (gaps over 1.5 spaces)', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 6 }),
          replacement({ x: 130, newWidth: 24, collides: true, replacement: 'A/C#' }),
          replacement({ x: 170, newWidth: 12, replacement: 'Bm' }),
        ]),
      );
      expect(ops.map((o) => o.text.value)).toEqual(['D', 'A/C#', 'Bm']);
      expect(ops.map((o) => o.collides)).toEqual([false, true, false]);
    });

    it('only groups chords of the same run', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, newWidth: 24, collides: true }),
          replacement({ x: 118, runKey: '1:700:118', replacement: 'Bm' }),
        ]),
      );
      expect(ops).toHaveLength(2);
    });

    it('reflows only the colliding packed segment, keeping others', () => {
      const ops = overlayOps(
        plan([
          replacement({ x: 100, runKey: 'a', replacement: 'D' }),
          replacement({ x: 118, runKey: 'a', replacement: 'G', newWidth: 24, collides: true }),
          replacement({ x: 200, runKey: 'a', replacement: 'Em' }),
        ]),
      );
      // the first two are packed (gap 6) and reflow; the third is aligned and stays
      expect(ops.map((o) => o.text.value)).toEqual(['D G', 'Em']);
    });
  });
});

describe('countCollisions', () => {
  it('counts ops that collide after reflow, not plan collisions', () => {
    const ops = overlayOps(
      plan([
        replacement({ collides: false }),
        replacement({ x: 200, runKey: '1:700:200', collides: true }),
        replacement({ x: 300, runKey: '1:700:300', collides: true }),
      ]),
    );
    expect(countCollisions(ops)).toBe(2);
    expect(countCollisions([])).toBe(0);
  });

  it('does not count a packed run once reflow resolves it', () => {
    const packed = [
      replacement({ x: 100, collides: true, limitX: 400 }),
      replacement({ x: 112, collides: false, limitX: 400 }),
    ];
    const ops = overlayOps(plan(packed));
    expect(countCollisions(ops)).toBe(ops.filter((o) => o.collides).length);
    expect(countCollisions(ops)).toBe(0);
  });
});
