import { parseKey } from '@cifras/chords';
import { createMeasure, loadFonts } from '@cifras/overlay';
import { act, renderHook } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFontFromDisk, sheetInG } from './transposeFixtures';
import { useTranspose } from './useTranspose';

let measure: ReturnType<typeof createMeasure>;
beforeAll(async () => {
  measure = createMeasure(await loadFonts(loadFontFromDisk));
});

const setup = (lines = sheetInG()) =>
  renderHook(() => useTranspose({ sourceLines: lines, sourceKey: parseKey('G'), measure }));

describe('useTranspose', () => {
  it('has no plan until a target is chosen', () => {
    const { result } = setup();
    expect(result.current.target).toBeNull();
    expect(result.current.plan).toBeNull();
    expect(result.current.ops).toEqual([]);
  });

  it('builds plan and ops for the target', () => {
    const { result } = setup();
    act(() => result.current.setTarget('D'));
    expect(result.current.plan?.chordCount).toBe(3);
    expect(result.current.ops.map((op) => op.text.value)).toEqual(['D', 'G', 'A/C#', 'D']);
    expect(result.current.collisions).toBe(0);
    expect(result.current.suspects).toEqual([]);
  });

  it('counts collisions from the final ops, not plan.collisions', () => {
    const { result } = setup(
      sheetInG([
        ['G', 50],
        ['C', 65],
      ]),
    );
    act(() => result.current.setTarget('Ab'));
    const { ops } = result.current;
    // The key indicator in the title is not a chord: it is reported on its own.
    expect(result.current.collisions).toBe(
      ops.filter((o) => o.kind === 'chord' && o.collides).length,
    );
    expect(result.current.collisions).toBeGreaterThan(0);
    expect(result.current.keyCollision).toBe(ops.some((o) => o.kind === 'key' && o.collides));
  });

  it('memoizes per target and stays under 100 ms', () => {
    const { result } = setup();
    act(() => result.current.setTarget('A'));
    const first = result.current.ops;
    act(() => result.current.setTarget('D'));
    const started = performance.now();
    act(() => result.current.setTarget('A'));
    expect(performance.now() - started).toBeLessThan(100);
    expect(result.current.ops).toBe(first);
  });

  it('stays empty while fonts or lines are missing', () => {
    const { result } = renderHook(() =>
      useTranspose({ sourceLines: null, sourceKey: parseKey('G'), measure: null }),
    );
    act(() => result.current.setTarget('D'));
    expect(result.current.plan).toBeNull();
    expect(result.current.ops).toEqual([]);
  });
});
