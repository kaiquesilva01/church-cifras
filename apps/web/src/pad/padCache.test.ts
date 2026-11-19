import { describe, expect, it, vi } from 'vitest';
import { PAD_CACHE } from '../../build/pwaConfig';
import { PAD_CACHE_NAME, noteForPadPath, noteForPadUrl, readCachedPadNotes } from './padCache';
import { PAD_SAMPLES } from './padNotes';

const BUCKET = 'https://firebasestorage.googleapis.com/v0/b/b1/o';
const urlOf = (path: string, query = '?alt=media&token=t') =>
  `${BUCKET}/${encodeURIComponent(path)}${query}`;

function fakeStorage(urls: string[], exists = true) {
  const cache = { keys: vi.fn(() => Promise.resolve(urls.map((url) => ({ url })))) };
  return {
    has: vi.fn(() => Promise.resolve(exists)),
    open: vi.fn(() => Promise.resolve(cache)),
  } as unknown as CacheStorage;
}

describe('padCache', () => {
  it('uses the cache name the service worker fills', () => {
    expect(PAD_CACHE_NAME).toBe(PAD_CACHE);
  });

  it('maps a storage path to its note', () => {
    expect(noteForPadPath(PAD_SAMPLES['G'].storagePath)).toBe('G');
    expect(noteForPadPath(PAD_SAMPLES['A#'].storagePath)).toBe('A#');
    expect(noteForPadPath('songs/s1/G-abc.pdf')).toBeNull();
  });

  it('maps a Storage media URL to its note, ignoring the query', () => {
    expect(noteForPadUrl(urlOf(PAD_SAMPLES['D#'].storagePath))).toBe('D#');
    expect(noteForPadUrl(urlOf(PAD_SAMPLES['D#'].storagePath, '?alt=media'))).toBe('D#');
  });

  it('ignores other objects and other versions of the pad files', () => {
    expect(noteForPadUrl(urlOf('songs/s1/G-abc.pdf'))).toBeNull();
    expect(noteForPadUrl(urlOf('pads/v0/DS11-G.m4a'))).toBeNull();
    expect(noteForPadUrl('https://example.com/')).toBeNull();
  });

  it('lists the notes that are in the pad cache', async () => {
    const storage = fakeStorage([
      urlOf(PAD_SAMPLES['C'].storagePath),
      urlOf(PAD_SAMPLES['A#'].storagePath),
      urlOf('songs/s1/G-abc.pdf'),
    ]);
    expect([...(await readCachedPadNotes(storage))].sort()).toEqual(['A#', 'C']);
    expect(storage.has).toHaveBeenCalledWith(PAD_CACHE_NAME);
  });

  it('does not create the cache when it does not exist yet', async () => {
    const storage = fakeStorage([], false);
    expect((await readCachedPadNotes(storage)).size).toBe(0);
    expect(storage.open).not.toHaveBeenCalled();
  });

  it('is empty without the Cache API or when it fails', async () => {
    expect((await readCachedPadNotes(undefined)).size).toBe(0);
    const broken = {
      has: () => Promise.reject(new Error('denied')),
      open: () => Promise.reject(new Error('denied')),
    } as unknown as CacheStorage;
    expect((await readCachedPadNotes(broken)).size).toBe(0);
  });
});
