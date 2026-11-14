import { describe, expect, it } from 'vitest';
import { parseKey } from '@cifras/chords';
import type { Replacement, TransposePlan } from '@cifras/chords';
import { overlayOps } from '../src/ops';

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
    const ops = overlayOps(plan([replacement({ collides: true }), replacement()]));
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
});
