import { describe, expect, it } from 'vitest';
import type { SetlistItem } from './types';
import { applySetlistOp, SetlistFullError } from './ops';

const mk = (id: string): SetlistItem => ({ id, songId: `s-${id}`, key: 'C' });
const list = (...ids: string[]): SetlistItem[] => ids.map(mk);
const ids = (items: SetlistItem[]): string[] => items.map((i) => i.id);

describe('applySetlistOp', () => {
  it('add appends to the end without mutating', () => {
    const input = list('a', 'b');
    const r = applySetlistOp(input, { type: 'add', item: mk('c') });
    expect(r.changed).toBe(true);
    expect(ids(r.items)).toEqual(['a', 'b', 'c']);
    expect(ids(input)).toEqual(['a', 'b']);
  });

  it('add with existing id is a no-op', () => {
    const r = applySetlistOp(list('a'), { type: 'add', item: mk('a') });
    expect(r.changed).toBe(false);
    expect(ids(r.items)).toEqual(['a']);
  });

  it('add with 40 items throws SetlistFullError', () => {
    const full = Array.from({ length: 40 }, (_, i) => mk(`i${i}`));
    expect(() => applySetlistOp(full, { type: 'add', item: mk('x') })).toThrow(SetlistFullError);
  });

  it('remove and setKey on an existing item', () => {
    const input = list('a', 'b');
    const removed = applySetlistOp(input, { type: 'remove', itemId: 'a' });
    expect(removed.changed).toBe(true);
    expect(ids(removed.items)).toEqual(['b']);
    const keyed = applySetlistOp(input, { type: 'setKey', itemId: 'b', key: 'D' });
    expect(keyed.changed).toBe(true);
    expect(keyed.items[1]?.key).toBe('D');
    expect(input[1]?.key).toBe('C');
  });

  it('remove/setKey/move of a missing id is unchanged', () => {
    const input = list('a', 'b');
    for (const op of [
      { type: 'remove', itemId: 'z' },
      { type: 'setKey', itemId: 'z', key: 'D' },
      { type: 'move', itemId: 'z', afterItemId: 'a' },
    ] as const) {
      const r = applySetlistOp(input, op);
      expect(r.changed).toBe(false);
      expect(ids(r.items)).toEqual(['a', 'b']);
    }
  });

  it('move with null goes to the start', () => {
    const r = applySetlistOp(list('a', 'b', 'c'), { type: 'move', itemId: 'c', afterItemId: null });
    expect(ids(r.items)).toEqual(['c', 'a', 'b']);
    expect(r.changed).toBe(true);
  });

  it('move relative to a neighbour', () => {
    const abcd = list('a', 'b', 'c', 'd');
    const a = applySetlistOp(abcd, { type: 'move', itemId: 'a', afterItemId: 'c' });
    expect(ids(a.items)).toEqual(['b', 'c', 'a', 'd']);
    const d = applySetlistOp(abcd, { type: 'move', itemId: 'd', afterItemId: 'a' });
    expect(ids(d.items)).toEqual(['a', 'd', 'b', 'c']);
    expect(ids(abcd)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('move with a missing neighbour goes to the end', () => {
    const r = applySetlistOp(list('a', 'b', 'c'), { type: 'move', itemId: 'a', afterItemId: 'zz' });
    expect(ids(r.items)).toEqual(['b', 'c', 'a']);
  });

  it('move after itself is unchanged', () => {
    const r = applySetlistOp(list('a', 'b'), { type: 'move', itemId: 'a', afterItemId: 'a' });
    expect(r.changed).toBe(false);
    expect(ids(r.items)).toEqual(['a', 'b']);
  });
});
