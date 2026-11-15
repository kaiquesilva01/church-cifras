import { describe, expect, it } from 'vitest';
import { requireRole } from '../auth/requireRole';
import {
  deleteArrangement,
  deleteSong,
  updateSongMeta,
  type AdminDeps,
  type ArrangementInfo,
} from './adminSongs';

const NOW = new Date('2026-11-15T12:00:00Z');

function arr(key: string, source: 'handmade' | 'generated'): ArrangementInfo {
  const slug = key.replace('#', 's');
  return { slug, key, source, storagePath: `songs/s1/${slug}-x.pdf` };
}

function setup(
  opts: {
    song?: boolean;
    arrangements?: ArrangementInfo[];
    identityOwners?: string[];
    failFileDelete?: boolean;
  } = {},
) {
  const log: string[] = [];
  const updates: Array<[string, Record<string, unknown>]> = [];
  const deps: AdminDeps = {
    getSong: async () => (opts.song === false ? null : { title: 'Old', artistName: 'Old' }),
    listArrangements: async () => opts.arrangements ?? [],
    deleteArrangementDoc: async (songId, slug) => {
      log.push(`doc:${songId}/${slug}`);
    },
    deleteSongDoc: async (songId) => {
      log.push(`song:${songId}`);
    },
    deleteFile: async (path) => {
      if (opts.failFileDelete) throw new Error('boom');
      log.push(`file:${path}`);
    },
    findSongsByIdentity: async () => opts.identityOwners ?? [],
    updateSong: async (songId, data) => {
      updates.push([songId, data]);
    },
    now: () => NOW,
  };
  return { deps, log, updates };
}

describe('updateSongMeta', () => {
  it('updates title and artist with normalized fields', async () => {
    const { deps, updates } = setup();
    await updateSongMeta(deps, {
      songId: 's1',
      title: ' Grande é o Senhor ',
      artistName: 'Adhemar',
    });
    expect(updates).toEqual([
      [
        's1',
        {
          title: 'Grande é o Senhor',
          artistName: 'Adhemar',
          titleNormalized: 'grande e o senhor',
          artistId: 'adhemar',
          updatedAt: NOW,
        },
      ],
    ]);
  });

  it('rejects empty normalized names', async () => {
    const { deps, updates } = setup();
    await expect(
      updateSongMeta(deps, { songId: 's1', title: '   ', artistName: 'A' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      updateSongMeta(deps, { songId: 's1', title: 'T', artistName: '' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      updateSongMeta(deps, { songId: 's1', title: 'x'.repeat(121), artistName: 'A' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(updates).toEqual([]);
  });

  it('rejects identity of another song', async () => {
    const { deps, updates } = setup({ identityOwners: ['s2'] });
    await expect(
      updateSongMeta(deps, { songId: 's1', title: 'T', artistName: 'A' }),
    ).rejects.toMatchObject({
      code: 'already-exists',
      message: 'Já existe uma música com esse nome e cantor.',
    });
    expect(updates).toEqual([]);
  });

  it('rejects when duplicates already exist, even if the song itself is listed', async () => {
    const { deps, updates } = setup({ identityOwners: ['s1', 's2'] });
    await expect(
      updateSongMeta(deps, { songId: 's1', title: 'T', artistName: 'A' }),
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(updates).toEqual([]);
  });

  it('allows keeping the same identity', async () => {
    const { deps, updates } = setup({ identityOwners: ['s1'] });
    await updateSongMeta(deps, { songId: 's1', title: 'OLD', artistName: 'old' });
    expect(updates).toHaveLength(1);
  });

  it('rejects a missing song', async () => {
    const { deps } = setup({ song: false });
    await expect(
      updateSongMeta(deps, { songId: 's1', title: 'T', artistName: 'A' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('deleteArrangement', () => {
  it('deletes a generated key and its file', async () => {
    const { deps, log } = setup({ arrangements: [arr('G', 'handmade'), arr('A', 'generated')] });
    await deleteArrangement(deps, { songId: 's1', key: 'A' });
    expect(log).toEqual(['doc:s1/A', 'file:songs/s1/A-x.pdf']);
  });

  it('deletes a handmade key when another handmade remains', async () => {
    const { deps, log } = setup({
      arrangements: [arr('G', 'handmade'), arr('F#', 'handmade'), arr('A', 'generated')],
    });
    await deleteArrangement(deps, { songId: 's1', key: 'F#' });
    expect(log).toEqual(['doc:s1/Fs', 'file:songs/s1/Fs-x.pdf']);
  });

  it('refuses deleting the last handmade while generated exist', async () => {
    const { deps, log } = setup({ arrangements: [arr('G', 'handmade'), arr('A', 'generated')] });
    await expect(deleteArrangement(deps, { songId: 's1', key: 'G' })).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Não é possível apagar o último PDF feito à mão enquanto houver tons gerados.',
    });
    expect(log).toEqual([]);
  });

  it('deletes the last handmade when no generated exist', async () => {
    const { deps, log } = setup({ arrangements: [arr('G', 'handmade')] });
    await deleteArrangement(deps, { songId: 's1', key: 'G' });
    expect(log).toEqual(['doc:s1/G', 'file:songs/s1/G-x.pdf']);
  });

  it('keeps going when file delete fails', async () => {
    const { deps, log } = setup({
      arrangements: [arr('G', 'handmade'), arr('A', 'generated')],
      failFileDelete: true,
    });
    await expect(deleteArrangement(deps, { songId: 's1', key: 'A' })).resolves.toEqual({
      songId: 's1',
      key: 'A',
    });
    expect(log).toEqual(['doc:s1/A']);
  });

  it('rejects invalid input and missing keys', async () => {
    const { deps } = setup({ arrangements: [arr('G', 'handmade')] });
    await expect(deleteArrangement(deps, { songId: 's1', key: 'H' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(deleteArrangement(deps, { songId: '../x', key: 'G' })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(deleteArrangement(deps, { songId: 's1', key: 'A' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('deleteSong', () => {
  it('deletes song with all arrangements and files', async () => {
    const { deps, log } = setup({ arrangements: [arr('G', 'handmade'), arr('A', 'generated')] });
    await deleteSong(deps, { songId: 's1' });
    expect(log).toEqual([
      'doc:s1/G',
      'file:songs/s1/G-x.pdf',
      'doc:s1/A',
      'file:songs/s1/A-x.pdf',
      'song:s1',
    ]);
  });

  it('deleting a missing song is ok', async () => {
    const { deps, log } = setup({ song: false });
    await expect(deleteSong(deps, { songId: 's1' })).resolves.toEqual({ songId: 's1' });
    expect(log).toEqual(['song:s1']);
  });

  it('keeps going when a file delete fails', async () => {
    const { deps, log } = setup({ arrangements: [arr('G', 'handmade')], failFileDelete: true });
    await deleteSong(deps, { songId: 's1' });
    expect(log).toEqual(['doc:s1/G', 'song:s1']);
  });
});

describe('admin only', () => {
  it('non-admin is rejected', async () => {
    const roleDeps = { getUserRole: async () => 'member' };
    await expect(requireRole(roleDeps, 'u1', ['admin'])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(requireRole(roleDeps, undefined, ['admin'])).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(requireRole({ getUserRole: async () => 'admin' }, 'u1', ['admin'])).resolves.toBe(
      'admin',
    );
  });
});
