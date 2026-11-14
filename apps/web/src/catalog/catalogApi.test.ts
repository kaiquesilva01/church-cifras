import { describe, expect, it, vi } from 'vitest';
import { saveUpload, type CatalogApi } from './catalogApi';
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
});
