import { beforeEach, describe, expect, it, vi } from 'vitest';

const batchSet = vi.fn();
const batchCommit = vi.fn(() => Promise.resolve());
const callable = vi.fn(() => Promise.resolve({ data: null }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((parent: { path?: string }, name: string) => ({
    path: [parent.path, name].filter(Boolean).join('/'),
  })),
  doc: vi.fn((parent: { path?: string }, ...segments: string[]) => {
    const rest = segments.length > 0 ? segments : ['auto1'];
    return {
      id: rest[rest.length - 1],
      path: [parent.path, ...rest].filter(Boolean).join('/'),
    };
  }),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n: number) => ({ limit: n })),
  onSnapshot: vi.fn(),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  serverTimestamp: vi.fn(() => '<ts>'),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  writeBatch: vi.fn(() => ({ set: batchSet, commit: batchCommit })),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(() => Promise.resolve()),
  deleteObject: vi.fn(() => Promise.resolve()),
  getDownloadURL: vi.fn(() => Promise.resolve('https://dl')),
  getBlob: vi.fn(),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));

import { getDoc, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getBlob, uploadBytes } from 'firebase/storage';
import type { FirebaseServices } from '../lib/firebase';
import { createCatalogApi } from './catalogApi';

const fakeStorage = { name: 'storage' };
const fakeFunctions = { name: 'functions' };
const services = {
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  loadStorage: () => Promise.resolve(fakeStorage),
  loadFunctions: () => Promise.resolve(fakeFunctions),
} as unknown as FirebaseServices;

describe('createCatalogApi payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createSongWithArrangement writes song and arrangement docs', async () => {
    const api = createCatalogApi(services);
    const id = await api.createSongWithArrangement({
      songId: 's1',
      title: 'Sonda-me',
      artistName: 'Aline Barros',
      key: 'C#',
      storagePath: 'songs/s1/Cs-abc.pdf',
      chordCount: 12,
      lyrics: '',
    });
    expect(id).toBe('s1');
    expect(batchSet).toHaveBeenCalledTimes(2);
    const [songRef, songData] = batchSet.mock.calls[0] as [{ path: string }, object];
    expect(songRef.path).toBe('songs/s1');
    expect(Object.keys(songData).sort()).toEqual(
      [
        'artistId',
        'artistName',
        'createdAt',
        'createdBy',
        'handmadeKeys',
        'keys',
        'title',
        'titleNormalized',
        'updatedAt',
      ].sort(),
    );
    expect(songData).toMatchObject({
      title: 'Sonda-me',
      titleNormalized: 'sonda me',
      artistId: 'aline-barros',
      artistName: 'Aline Barros',
      keys: [],
      handmadeKeys: [],
      createdBy: 'u1',
      createdAt: '<ts>',
      updatedAt: '<ts>',
    });
    const [arrRef, arrData] = batchSet.mock.calls[1] as [{ path: string }, object];
    expect(arrRef.path).toBe('songs/s1/arrangements/Cs');
    expect(arrData).toEqual({
      key: 'C#',
      storagePath: 'songs/s1/Cs-abc.pdf',
      source: 'handmade',
      derivedFromKey: null,
      writer: 'upload',
      chordCount: 12,
      collisions: 0,
      createdBy: 'u1',
      createdAt: '<ts>',
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('createSongWithArrangement writes songLyrics in the same batch', async () => {
    await createCatalogApi(services).createSongWithArrangement({
      songId: 's1',
      title: 'Sonda-me',
      artistName: 'Aline Barros',
      key: 'G',
      storagePath: 'songs/s1/G-abc.pdf',
      chordCount: 12,
      lyrics: 'Sonda-me, Senhor',
    });
    expect(batchSet).toHaveBeenCalledTimes(3);
    const [ref, data] = batchSet.mock.calls[2] as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe('songLyrics/s1');
    expect(data).toEqual({
      text: 'Sonda-me, Senhor',
      createdBy: 'u1',
      createdAt: '<ts>',
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('does not write songLyrics when lyrics is blank', async () => {
    await createCatalogApi(services).createSongWithArrangement({
      songId: 's1',
      title: 'Sonda-me',
      artistName: 'Aline Barros',
      key: 'G',
      storagePath: 'songs/s1/G-abc.pdf',
      chordCount: 12,
      lyrics: '   \n ',
    });
    expect(batchSet).toHaveBeenCalledTimes(2);
    const paths = batchSet.mock.calls.map((call) => (call[0] as { path: string }).path);
    expect(paths).not.toContain('songLyrics/s1');
  });

  it('cuts lyrics at 20000 characters', async () => {
    await createCatalogApi(services).createSongWithArrangement({
      songId: 's1',
      title: 'Sonda-me',
      artistName: 'Aline Barros',
      key: 'G',
      storagePath: 'songs/s1/G-abc.pdf',
      chordCount: 12,
      lyrics: 'a'.repeat(25_000),
    });
    const [ref, data] = batchSet.mock.calls[2] as [{ path: string }, { text: string }];
    expect(ref.path).toBe('songLyrics/s1');
    expect(data.text.length).toBe(20_000);
  });

  it('addArrangement writes one arrangement doc', async () => {
    await createCatalogApi(services).addArrangement('s1', {
      key: 'F#m',
      storagePath: 'songs/s1/Fsm-abc.pdf',
      chordCount: 7,
    });
    expect(batchSet).toHaveBeenCalledTimes(1);
    const [ref, data] = batchSet.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe('songs/s1/arrangements/Fsm');
    expect(data).toMatchObject({
      key: 'F#m',
      source: 'handmade',
      writer: 'upload',
      derivedFromKey: null,
      chordCount: 7,
      createdBy: 'u1',
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('uploadPdf uses slug path and immutable pdf metadata', async () => {
    const file = new Blob(['%PDF']);
    const path = await createCatalogApi(services).uploadPdf('s1', 'F#m', file);
    expect(path).toMatch(/^songs\/s1\/Fsm-[A-Za-z0-9]+\.pdf$/);
    expect(uploadBytes).toHaveBeenCalledWith({ path }, file, {
      contentType: 'application/pdf',
      cacheControl: 'public, max-age=31536000, immutable',
      customMetadata: { uploadedBy: 'u1' },
    });
  });

  it('deleteFile calls the discardUpload callable', async () => {
    await createCatalogApi(services).deleteFile('songs/s1/G-abc.pdf');
    expect(httpsCallable).toHaveBeenCalledWith(fakeFunctions, 'discardUpload');
    expect(callable).toHaveBeenCalledWith({ storagePath: 'songs/s1/G-abc.pdf' });
  });

  it('subscribeArrangements maps docs, skips unknown source and sorts by key', () => {
    const unsubscribe = vi.fn();
    vi.mocked(onSnapshot).mockImplementationOnce(((
      _ref: { path: string },
      next: (snap: unknown) => void,
    ) => {
      const docData = (data: Record<string, unknown>) => ({ data: () => data });
      next({
        docs: [
          docData({
            key: 'A',
            source: 'generated',
            storagePath: 'songs/s1/A-x.pdf',
            derivedFromKey: 'G',
            collisions: 2,
          }),
          docData({ key: 'G', source: 'handmade', storagePath: 'songs/s1/G-x.pdf' }),
          docData({ key: 'B', source: 'weird', storagePath: 'songs/s1/B-x.pdf' }),
        ],
      });
      return unsubscribe;
    }) as never);
    const cb = vi.fn();
    const stop = createCatalogApi(services).subscribeArrangements('s1', cb);
    expect(vi.mocked(onSnapshot).mock.calls[0]?.[0]).toMatchObject({
      path: 'songs/s1/arrangements',
    });
    expect(cb).toHaveBeenCalledWith([
      {
        key: 'G',
        source: 'handmade',
        storagePath: 'songs/s1/G-x.pdf',
        derivedFromKey: null,
        collisions: 0,
      },
      {
        key: 'A',
        source: 'generated',
        storagePath: 'songs/s1/A-x.pdf',
        derivedFromKey: 'G',
        collisions: 2,
      },
    ]);
    expect(stop).toBe(unsubscribe);
  });

  it('getArrangement maps missing and known sources, null for unknown', async () => {
    const api = createCatalogApi(services);
    const snap = (exists: boolean, source?: unknown) => ({
      exists: () => exists,
      data: () => ({ source, storagePath: 'songs/s1/G-x.pdf' }),
    });
    vi.mocked(getDoc).mockResolvedValueOnce(snap(false) as never);
    await expect(api.getArrangement('s1', 'G')).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce(snap(true, 'generated') as never);
    await expect(api.getArrangement('s1', 'G')).resolves.toEqual({
      source: 'generated',
      storagePath: 'songs/s1/G-x.pdf',
    });
    vi.mocked(getDoc).mockResolvedValueOnce(snap(true, 'handmade') as never);
    await expect(api.getArrangement('s1', 'G')).resolves.toEqual({
      source: 'handmade',
      storagePath: 'songs/s1/G-x.pdf',
    });
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ source: 'handmade', storagePath: '' }),
    } as never);
    await expect(api.getArrangement('s1', 'G')).resolves.toBeNull();
    vi.mocked(getDoc).mockResolvedValueOnce(snap(true, 'weird') as never);
    await expect(api.getArrangement('s1', 'G')).resolves.toBeNull();
  });

  it('findSong queries by title and artist and maps the summary', async () => {
    const api = createCatalogApi(services);
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 's1',
          data: () => ({
            title: 'Sonda-me',
            titleNormalized: 'sonda me',
            artistId: 'aline-barros',
            artistName: 'Aline Barros',
            keys: ['Am', 'G'],
            handmadeKeys: ['G'],
          }),
        },
      ],
    } as never);
    await expect(api.findSong('sonda me', 'aline-barros')).resolves.toEqual({
      id: 's1',
      title: 'Sonda-me',
      titleNormalized: 'sonda me',
      artistId: 'aline-barros',
      artistName: 'Aline Barros',
      keys: ['G', 'Am'],
      handmadeKeys: ['G'],
    });
    expect(where).toHaveBeenCalledWith('titleNormalized', '==', 'sonda me');
    expect(where).toHaveBeenCalledWith('artistId', '==', 'aline-barros');
    expect(limit).toHaveBeenCalledWith(1);
    expect(query).toHaveBeenCalledTimes(1);

    vi.mocked(getDocs).mockResolvedValueOnce({ docs: [] } as never);
    await expect(api.findSong('x', 'y')).resolves.toBeNull();
  });

  it('replaceArrangement calls the callable with the payload', async () => {
    await createCatalogApi(services).replaceArrangement('s1', 'G', 'songs/s1/G-abc.pdf', 9);
    expect(httpsCallable).toHaveBeenCalledWith(fakeFunctions, 'replaceArrangement');
    expect(callable).toHaveBeenCalledWith({
      songId: 's1',
      key: 'G',
      storagePath: 'songs/s1/G-abc.pdf',
      chordCount: 9,
    });
  });

  it('updateSongMeta calls the callable with the payload', async () => {
    await createCatalogApi(services).updateSongMeta('s1', {
      title: 'Nova',
      artistName: 'Outra Pessoa',
    });
    expect(httpsCallable).toHaveBeenCalledWith(fakeFunctions, 'updateSongMeta');
    expect(callable).toHaveBeenCalledWith({
      songId: 's1',
      title: 'Nova',
      artistName: 'Outra Pessoa',
    });
  });

  it('deleteArrangement calls the callable with song and key', async () => {
    await createCatalogApi(services).deleteArrangement('s1', 'F#m');
    expect(httpsCallable).toHaveBeenCalledWith(fakeFunctions, 'deleteArrangement');
    expect(callable).toHaveBeenCalledWith({ songId: 's1', key: 'F#m' });
  });

  it('deleteSong calls the callable with the song id', async () => {
    await createCatalogApi(services).deleteSong('s1');
    expect(httpsCallable).toHaveBeenCalledWith(fakeFunctions, 'deleteSong');
    expect(callable).toHaveBeenCalledWith({ songId: 's1' });
  });

  it('createGeneratedArrangement writes a generated overlay arrangement', async () => {
    await createCatalogApi(services).createGeneratedArrangement('s1', {
      key: 'A',
      storagePath: 'songs/s1/A-abc.pdf',
      derivedFromKey: 'G',
      chordCount: 14,
      collisions: 2,
      createdBy: 'u1',
    });
    expect(batchSet).toHaveBeenCalledTimes(1);
    const [ref, data] = batchSet.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe('songs/s1/arrangements/A');
    expect(data).toEqual({
      key: 'A',
      storagePath: 'songs/s1/A-abc.pdf',
      source: 'generated',
      derivedFromKey: 'G',
      writer: 'overlay',
      chordCount: 14,
      collisions: 2,
      createdBy: 'u1',
      createdAt: '<ts>',
    });
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('getPdfBytes uses getBlob', async () => {
    const blob = { arrayBuffer: () => Promise.resolve(new Uint8Array([37, 80, 68, 70]).buffer) };
    vi.mocked(getBlob).mockResolvedValueOnce(blob as never);
    const bytes = await createCatalogApi(services).getPdfBytes('songs/s1/G-abc.pdf');
    expect(getBlob).toHaveBeenCalledWith({ path: 'songs/s1/G-abc.pdf' });
    expect(bytes).toEqual(new Uint8Array([37, 80, 68, 70]));
  });
});
