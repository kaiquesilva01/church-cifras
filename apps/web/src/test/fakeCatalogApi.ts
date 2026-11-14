import { vi } from 'vitest';
import type { CatalogApi } from '../catalog/catalogApi';
import type { SongSummary } from '../catalog/types';

export function makeSong(overrides: Partial<SongSummary> & { id: string }): SongSummary {
  return {
    title: 'Título',
    titleNormalized: 'titulo',
    artistId: 'artista',
    artistName: 'Artista',
    keys: [],
    handmadeKeys: [],
    ...overrides,
  };
}

export const sampleSongs: SongSummary[] = [
  makeSong({
    id: 's1',
    title: 'Sonda-me',
    titleNormalized: 'sonda me',
    artistId: 'aline-barros',
    artistName: 'Aline Barros',
    keys: ['G', 'A'],
    handmadeKeys: ['G'],
  }),
  makeSong({
    id: 's2',
    title: 'Ressuscita-me',
    titleNormalized: 'ressuscita me',
    artistId: 'aline-barros',
    artistName: 'Aline Barros',
    keys: ['F#m'],
    handmadeKeys: ['F#m'],
  }),
  makeSong({
    id: 's3',
    title: 'Grande é o Senhor',
    titleNormalized: 'grande e o senhor',
    artistId: 'adhemar-de-campos',
    artistName: 'Adhemar de Campos',
    keys: ['D'],
    handmadeKeys: ['D'],
  }),
];

export function fakeCatalogApi(
  songs: SongSummary[] = sampleSongs,
  overrides: Partial<CatalogApi> = {},
): CatalogApi {
  return {
    subscribeSongs: (cb) => {
      cb(songs);
      return () => undefined;
    },
    findSong: vi.fn(() => Promise.resolve(null)),
    getArrangement: vi.fn(() =>
      Promise.resolve({ source: 'handmade' as const, storagePath: 'songs/s1/G-abc.pdf' }),
    ),
    newSongId: vi.fn(() => 'new-id'),
    uploadPdf: vi.fn(() => Promise.resolve('songs/new-id/G-x.pdf')),
    deleteFile: vi.fn(() => Promise.resolve()),
    createSongWithArrangement: vi.fn(() => Promise.resolve('new-id')),
    addArrangement: vi.fn(() => Promise.resolve()),
    replaceArrangement: vi.fn(() => Promise.resolve()),
    getPdfUrl: vi.fn((path: string) => Promise.resolve(`https://storage.test/${path}`)),
    ...overrides,
  };
}
