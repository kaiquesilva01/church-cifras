import { describe, expect, it, vi } from 'vitest';
import { ArrangementExistsError, saveUpload, type CatalogApi } from './catalogApi';
import type { UploadPlan } from './types';

function fakeApi(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    subscribeSongs: vi.fn(() => () => undefined),
    findSong: vi.fn(() => Promise.resolve(null)),
    getArrangement: vi.fn(() => Promise.resolve(null)),
    newSongId: vi.fn(() => 'song1'),
    uploadPdf: vi.fn((songId: string) => Promise.resolve(`songs/${songId}/G-abc.pdf`)),
    deleteFile: vi.fn(() => Promise.resolve()),
    createSongWithArrangement: vi.fn((input) => Promise.resolve(input.songId)),
    addArrangement: vi.fn(() => Promise.resolve()),
    replaceArrangement: vi.fn(() => Promise.resolve()),
    getPdfUrl: vi.fn(() => Promise.resolve('https://x')),
    ...overrides,
  };
}

const file = new Blob(['%PDF'], { type: 'application/pdf' });
const base = { file, key: 'G' as const, chordCount: 12 };

describe('saveUpload', () => {
  it('saveUpload creates song and arrangement', async () => {
    const api = fakeApi();
    const plan: UploadPlan = {
      ...base,
      action: 'new-song',
      title: 'Sonda-me',
      artistName: 'Aline',
    };
    await expect(saveUpload(api, plan)).resolves.toEqual({ songId: 'song1', key: 'G' });
    expect(api.uploadPdf).toHaveBeenCalledWith('song1', 'G', file);
    expect(api.createSongWithArrangement).toHaveBeenCalledWith({
      songId: 'song1',
      title: 'Sonda-me',
      artistName: 'Aline',
      key: 'G',
      storagePath: 'songs/song1/G-abc.pdf',
      chordCount: 12,
    });
  });

  it('saveUpload adds key to existing song', async () => {
    const api = fakeApi();
    await saveUpload(api, { ...base, action: 'add-key', songId: 's9' });
    expect(api.addArrangement).toHaveBeenCalledWith('s9', {
      key: 'G',
      storagePath: 'songs/s9/G-abc.pdf',
      chordCount: 12,
    });
    expect(api.createSongWithArrangement).not.toHaveBeenCalled();
  });

  it('saveUpload replaces generated via callable', async () => {
    const api = fakeApi();
    await saveUpload(api, { ...base, action: 'replace-generated', songId: 's9' });
    expect(api.replaceArrangement).toHaveBeenCalledWith('s9', 'G', 'songs/s9/G-abc.pdf', 12);
  });

  it('deletes uploaded file when saving fails', async () => {
    const boom = new Error('exists');
    const api = fakeApi({ addArrangement: vi.fn(() => Promise.reject(boom)) });
    await expect(saveUpload(api, { ...base, action: 'add-key', songId: 's9' })).rejects.toBe(boom);
    expect(api.deleteFile).toHaveBeenCalledWith('songs/s9/G-abc.pdf');
  });

  it('keeps the original error when cleanup also fails', async () => {
    const boom = new Error('exists');
    const api = fakeApi({
      replaceArrangement: vi.fn(() => Promise.reject(boom)),
      deleteFile: vi.fn(() => Promise.reject(new Error('denied'))),
    });
    await expect(
      saveUpload(api, { ...base, action: 'replace-generated', songId: 's9' }),
    ).rejects.toBe(boom);
  });

  it('throws ArrangementExistsError when another person saved the key first', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    for (const action of ['new-song', 'add-key'] as const) {
      const api = fakeApi({
        createSongWithArrangement: vi.fn(() => Promise.reject(denied)),
        addArrangement: vi.fn(() => Promise.reject(denied)),
        getArrangement: vi.fn(() =>
          Promise.resolve({ source: 'handmade' as const, storagePath: 'p' }),
        ),
      });
      const plan: UploadPlan =
        action === 'new-song'
          ? { ...base, action, title: 'T', artistName: 'A' }
          : { ...base, action, songId: 's9' };
      await expect(saveUpload(api, plan)).rejects.toBeInstanceOf(ArrangementExistsError);
      expect(api.deleteFile).toHaveBeenCalledTimes(1);
    }
  });

  it('rethrows permission-denied when the arrangement does not exist', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    const api = fakeApi({ addArrangement: vi.fn(() => Promise.reject(denied)) });
    await expect(saveUpload(api, { ...base, action: 'add-key', songId: 's9' })).rejects.toBe(
      denied,
    );
  });

  it('maps callable failed-precondition to ArrangementExistsError', async () => {
    const pre = Object.assign(new Error('handmade'), { code: 'functions/failed-precondition' });
    const api = fakeApi({ replaceArrangement: vi.fn(() => Promise.reject(pre)) });
    await expect(
      saveUpload(api, { ...base, action: 'replace-generated', songId: 's9' }),
    ).rejects.toBeInstanceOf(ArrangementExistsError);
    expect(api.deleteFile).toHaveBeenCalledTimes(1);
  });
});
