import { describe, expect, it } from 'vitest';
import { afterIdForDrop } from './dnd';
import type { SetlistItem } from './types';

const items: SetlistItem[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, songId: id, key: 'G' }));

describe('afterIdForDrop', () => {
  it('moves down: item ends right below the over item', () => {
    expect(afterIdForDrop(items, 'a', 'c')).toBe('c');
  });
  it('moves up: item ends right below the previous one', () => {
    expect(afterIdForDrop(items, 'd', 'b')).toBe('a');
  });
  it('returns null when dropped at the start', () => {
    expect(afterIdForDrop(items, 'c', 'a')).toBeNull();
  });
  it('returns undefined when there is nothing to move', () => {
    expect(afterIdForDrop(items, 'a', 'a')).toBeUndefined();
    expect(afterIdForDrop(items, 'x', 'a')).toBeUndefined();
    expect(afterIdForDrop(items, 'a', 'x')).toBeUndefined();
  });
});
