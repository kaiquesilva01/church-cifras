import { describe, expect, it, vi } from 'vitest';
import { ArrangementExistsError, type CatalogApi } from '../catalog/catalogApi';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { saveGenerated } from './saveGenerated';

const input = {
  songId: 's1',
  key: 'A' as const,
  bytes: new Uint8Array([1, 2, 3]),
  derivedFromKey: 'G' as const,
  chordCount: 12,
  collisions: 2,
  uid: 'u1',
};

const api = (overrides: Partial<CatalogApi> = {}) =>
  fakeCatalogApi(undefined, {
    uploadPdf: vi.fn(() => Promise.resolve('songs/s1/A-x.pdf')),
    ...overrides,
  });

describe('saveGenerated', () => {
  it('saveGenerated creates generated arrangement', async () => {
    const a = api();
    await expect(saveGenerated(a, input)).resolves.toEqual({ key: 'A', status: 'created' });
    expect(a.uploadPdf).toHaveBeenCalledWith('s1', 'A', expect.any(Blob));
    const blob = vi.mocked(a.uploadPdf).mock.calls[0]![2];
    expect(blob.type).toBe('application/pdf');
    expect(a.createGeneratedArrangement).toHaveBeenCalledWith('s1', {
      key: 'A',
      storagePath: 'songs/s1/A-x.pdf',
      derivedFromKey: 'G',
      chordCount: 12,
      collisions: 2,
      createdBy: 'u1',
    });
    expect(a.deleteFile).not.toHaveBeenCalled();
  });

  it('opens existing key on conflict and discards upload', async () => {
    for (const error of [
      new ArrangementExistsError(),
      Object.assign(new Error('denied'), { code: 'permission-denied' }),
    ]) {
      const a = api({
        createGeneratedArrangement: vi.fn(() => Promise.reject(error)),
        getArrangement: vi.fn(() =>
          Promise.resolve({ source: 'generated' as const, storagePath: 'songs/s1/A-y.pdf' }),
        ),
      });
      await expect(saveGenerated(a, input)).resolves.toEqual({ key: 'A', status: 'existing' });
      expect(a.deleteFile).toHaveBeenCalledWith('songs/s1/A-x.pdf');
    }
  });

  it('discards upload and rethrows on other failures', async () => {
    const boom = new Error('offline');
    const a = api({ createGeneratedArrangement: vi.fn(() => Promise.reject(boom)) });
    await expect(saveGenerated(a, input)).rejects.toBe(boom);
    expect(a.deleteFile).toHaveBeenCalledWith('songs/s1/A-x.pdf');
  });

  it('rethrows permission-denied when no arrangement exists, even if cleanup fails', async () => {
    const denied = Object.assign(new Error('denied'), { code: 'permission-denied' });
    const a = api({
      createGeneratedArrangement: vi.fn(() => Promise.reject(denied)),
      getArrangement: vi.fn(() => Promise.resolve(null)),
      deleteFile: vi.fn(() => Promise.reject(new Error('x'))),
    });
    await expect(saveGenerated(a, input)).rejects.toBe(denied);
  });
});
