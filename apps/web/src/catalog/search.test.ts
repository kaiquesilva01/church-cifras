import { describe, expect, it } from 'vitest';
import { deriveArtists, filterArtists, filterSongs } from './search';
import type { SongSummary } from './types';

const song = (id: string, title: string, artistName: string, artistId: string): SongSummary => ({
  id,
  title,
  titleNormalized: title.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''),
  artistId,
  artistName,
  keys: [],
  handmadeKeys: [],
});

const songs = [
  song('1', 'Sonda-me', 'Aline Barros', 'aline-barros'),
  song('2', 'Grande é o Senhor', 'Damáris Andrade', 'damaris-andrade'),
  song('3', 'Rendido Estou', 'Aline Barros', 'aline-barros'),
];

describe('search', () => {
  it('filters songs by title or artist ignoring accents', () => {
    expect(filterSongs(songs, 'sonda me').map((s) => s.id)).toEqual(['1']);
    expect(filterSongs(songs, 'aline').map((s) => s.id)).toEqual(['1', '3']);
    expect(filterSongs(songs, 'damaris grande').map((s) => s.id)).toEqual(['2']);
    expect(filterSongs(songs, '  ')).toHaveLength(3);
    expect(filterSongs(songs, 'xyz')).toEqual([]);
  });

  it('derives artists with song counts sorted by name', () => {
    expect(deriveArtists(songs)).toEqual([
      { id: 'aline-barros', name: 'Aline Barros', songCount: 2 },
      { id: 'damaris-andrade', name: 'Damáris Andrade', songCount: 1 },
    ]);
  });

  it('filters artists by name only', () => {
    const artists = deriveArtists(songs);
    expect(filterArtists(artists, 'damaris').map((a) => a.id)).toEqual(['damaris-andrade']);
    expect(filterArtists(artists, 'sonda')).toEqual([]);
  });
});
