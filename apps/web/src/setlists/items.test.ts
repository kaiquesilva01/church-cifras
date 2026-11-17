import { describe, expect, it } from 'vitest';
import type { SongSummary } from '../catalog/types';
import { copyItems, defaultKeyFor, newItemId } from './items';

const song = (
  keys: SongSummary['keys'],
  handmadeKeys: SongSummary['handmadeKeys'],
): SongSummary => ({
  id: 's',
  title: 'T',
  titleNormalized: 't',
  artistId: 'a',
  artistName: 'A',
  keys,
  handmadeKeys,
});

describe('items', () => {
  it('newItemId returns distinct non-empty ids', () => {
    expect(newItemId()).not.toBe(newItemId());
    expect(newItemId().length).toBeGreaterThan(0);
  });

  it('copyItems keeps songId/key and replaces ids', () => {
    const items = [
      { id: 'a', songId: 's1', key: 'C' as const },
      { id: 'b', songId: 's2', key: 'D' as const },
    ];
    const copy = copyItems(items);
    expect(copy.map((i) => [i.songId, i.key])).toEqual([
      ['s1', 'C'],
      ['s2', 'D'],
    ]);
    expect(copy.some((i) => i.id === 'a' || i.id === 'b')).toBe(false);
    expect(new Set(copy.map((i) => i.id)).size).toBe(2);
  });

  it('defaultKeyFor prefers handmade, then generated, then null', () => {
    expect(defaultKeyFor(song(['C', 'D'], ['D']))).toBe('D');
    expect(defaultKeyFor(song(['E', 'F'], []))).toBe('E');
    expect(defaultKeyFor(song([], []))).toBeNull();
  });
});
