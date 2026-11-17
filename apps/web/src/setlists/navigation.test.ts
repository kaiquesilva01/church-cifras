import { describe, expect, it } from 'vitest';
import type { SongSummary } from '../catalog/types';
import type { SetlistItem } from './types';
import { itemHref, navigateItems } from './navigation';

const song = (id: string, keys: SongSummary['keys'] = ['C']): SongSummary => ({
  id,
  title: id,
  titleNormalized: id,
  artistId: 'a',
  artistName: 'A',
  keys,
  handmadeKeys: [],
});
const item = (id: string, songId: string): SetlistItem => ({ id, songId, key: 'C' });

describe('navigateItems', () => {
  const songs = [song('s1'), song('s2'), song('s3', []), song('s4'), song('s5')];
  const items = [
    item('i1', 's1'),
    item('i2', 's2'),
    item('i3', 's3'),
    item('i4', 'gone'),
    item('i5', 's4'),
    item('i6', 's5'),
  ];

  it('skips items without a song or keys', () => {
    const nav = navigateItems(items, songs, 'i2');
    expect(nav.total).toBe(4);
    expect(nav.position).toBe(2);
    expect(nav.prev?.id).toBe('i1');
    expect(nav.next?.id).toBe('i5');
    expect(nav.inList).toBe(true);
  });

  it('first and last have null neighbours', () => {
    expect(navigateItems(items, songs, 'i1').prev).toBeNull();
    expect(navigateItems(items, songs, 'i6').next).toBeNull();
  });

  it('current item outside the list', () => {
    for (const id of ['nope', 'i3', null]) {
      const nav = navigateItems(items, songs, id);
      expect(nav).toMatchObject({ inList: false, position: 0, prev: null, next: null, total: 4 });
    }
  });
});

describe('itemHref', () => {
  it('uses keySlug for the tom', () => {
    expect(itemHref('r1', { id: 'i1', songId: 's1', key: 'F#m' })).toBe(
      '/musicas/s1?tom=Fsm&repertorio=r1&item=i1',
    );
  });
});
