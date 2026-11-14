import { describe, expect, it } from 'vitest';
import { discardUpload, type DiscardDeps } from './discardUpload';

const PATH = 'songs/s1/Fs-abc123.pdf';

function setup(opts: { uploadedBy?: string | null; exists?: boolean; referenced?: boolean } = {}) {
  const deleted: string[] = [];
  const checked: Array<[string, string]> = [];
  const deps: DiscardDeps = {
    getUploader: async () =>
      opts.exists === false ? 'missing' : { uploadedBy: opts.uploadedBy ?? 'u1' },
    isReferenced: async (songId, slug) => {
      checked.push([songId, slug]);
      return opts.referenced ?? false;
    },
    deleteFile: async (path) => {
      deleted.push(path);
    },
  };
  return { deps, deleted, checked };
}

describe('discardUpload', () => {
  it('deletes an unreferenced file uploaded by the caller', async () => {
    const { deps, deleted, checked } = setup();
    await expect(discardUpload(deps, { uid: 'u1', storagePath: PATH })).resolves.toEqual({
      deleted: true,
    });
    expect(deleted).toEqual([PATH]);
    expect(checked).toEqual([['s1', 'Fs']]);
  });

  it('is a no-op when the file is missing', async () => {
    const { deps, deleted } = setup({ exists: false });
    await expect(discardUpload(deps, { uid: 'u1', storagePath: PATH })).resolves.toEqual({
      deleted: false,
    });
    expect(deleted).toEqual([]);
  });

  it('denies when the caller is not the uploader', async () => {
    const { deps, deleted } = setup({ uploadedBy: 'other' });
    await expect(discardUpload(deps, { uid: 'u1', storagePath: PATH })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(deleted).toEqual([]);
  });

  it('denies when the file has no uploader metadata', async () => {
    const { deps } = setup({ uploadedBy: null });
    const noMeta: DiscardDeps = { ...deps, getUploader: async () => ({ uploadedBy: undefined }) };
    await expect(discardUpload(noMeta, { uid: 'u1', storagePath: PATH })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('refuses when an arrangement references the file', async () => {
    const { deps, deleted } = setup({ referenced: true });
    await expect(discardUpload(deps, { uid: 'u1', storagePath: PATH })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(deleted).toEqual([]);
  });

  it('rejects malformed paths', async () => {
    const { deps, deleted } = setup();
    for (const storagePath of [
      5,
      'songs/s1/original.pdf',
      'songs/s1/Fs-a.txt',
      'songs/s1/sub/Fs-a.pdf',
      'songs/../Fs-a.pdf',
      'songs/a.b/Fs-a.pdf',
      'other/s1/Fs-a.pdf',
      'songs/s1/H-a.pdf',
      'songs/s1/Fs-a b.pdf',
    ]) {
      await expect(discardUpload(deps, { uid: 'u1', storagePath })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
    expect(deleted).toEqual([]);
  });
});
