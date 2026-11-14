import { describe, expect, it, vi } from 'vitest';
import { replaceArrangement, type ReplaceDeps } from './replaceArrangement';

const NOW = new Date('2026-11-14T12:00:00Z');
const NEW_PATH = 'songs/s1/Fs-new123.pdf';

function setup(
  existing: { source: string; storagePath: string } | null = {
    source: 'generated',
    storagePath: 'songs/s1/Fs-old.pdf',
  },
  opts: { fileExists?: boolean; deleteFails?: boolean } = {},
) {
  const writes: Array<[string, string, Record<string, unknown>]> = [];
  const deleted: string[] = [];
  const deps: ReplaceDeps = {
    replaceIfGenerated: async (songId, slug, data) => {
      if (!existing) return 'missing';
      if (existing.source === 'handmade') return 'handmade';
      if (existing.storagePath === data.storagePath) return 'same-file';
      writes.push([songId, slug, data]);
      return { previousPath: existing.storagePath };
    },
    deleteFile: async (path) => {
      if (opts.deleteFails) throw new Error('boom');
      deleted.push(path);
    },
    fileExists: async () => opts.fileExists ?? true,
    now: () => NOW,
  };
  return { deps, writes, deleted };
}

const input = { uid: 'u1', songId: 's1', key: 'F#', storagePath: NEW_PATH, chordCount: 12 };

describe('replaceArrangement', () => {
  it('replaces generated with handmade and deletes old file', async () => {
    const { deps, writes, deleted } = setup();
    await expect(replaceArrangement(deps, input)).resolves.toEqual({ songId: 's1', key: 'F#' });
    expect(writes).toEqual([
      [
        's1',
        'Fs',
        {
          key: 'F#',
          storagePath: NEW_PATH,
          source: 'handmade',
          derivedFromKey: null,
          writer: 'upload',
          chordCount: 12,
          collisions: 0,
          createdBy: 'u1',
          createdAt: NOW,
        },
      ],
    ]);
    expect(deleted).toEqual(['songs/s1/Fs-old.pdf']);
  });

  it('rejects replacing handmade', async () => {
    const { deps, writes } = setup({ source: 'handmade', storagePath: 'songs/s1/Fs-old.pdf' });
    await expect(replaceArrangement(deps, input)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(writes).toEqual([]);
  });

  it('not-found when missing', async () => {
    const { deps } = setup(null);
    await expect(replaceArrangement(deps, input)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects path outside song folder', async () => {
    const { deps } = setup();
    for (const storagePath of ['songs/other/Fs-a.pdf', 'songs/s1/Cs-a.pdf', 'songs/s1/Fs-a.txt']) {
      await expect(replaceArrangement(deps, { ...input, storagePath })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
  });

  it('rejects invalid input types', async () => {
    const { deps } = setup();
    await expect(replaceArrangement(deps, { ...input, key: 'H' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(replaceArrangement(deps, { ...input, chordCount: 0 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(replaceArrangement(deps, { ...input, songId: 5 })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });

  it('rejects reusing the existing file', async () => {
    const { deps, writes } = setup();
    await expect(
      replaceArrangement(deps, { ...input, storagePath: 'songs/s1/Fs-old.pdf' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(writes).toEqual([]);
  });

  it('rejects unsafe song ids', async () => {
    const { deps } = setup();
    for (const songId of ['.', '..', 'a b', 'a.b']) {
      await expect(replaceArrangement(deps, { ...input, songId })).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    }
  });

  it('rejects missing file', async () => {
    const { deps, writes } = setup(undefined, { fileExists: false });
    await expect(replaceArrangement(deps, input)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(writes).toEqual([]);
  });

  it('keeps going when old file delete fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { deps, writes } = setup(undefined, { deleteFails: true });
    await expect(replaceArrangement(deps, input)).resolves.toEqual({ songId: 's1', key: 'F#' });
    expect(writes).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
