import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStats, getStatsForAdmin, type StatsDeps } from './getStats';

const NOW = new Date('2026-11-22T15:00:00Z');

type Song = { title: string; artistName: string };
type Usage = { date: string; songIds: string[] };

type Opts = {
  sources?: string[];
  songCount?: number;
  pdfSizes?: number[];
  usage?: Usage[];
  songs?: Record<string, Song>;
  failSettled?: boolean;
};

function setup(opts: Opts = {}) {
  const log: string[] = [];
  const getSongsCalls: string[][] = [];
  const deps: StatsDeps = {
    countSongs: async () => opts.songCount ?? 0,
    listArrangementSources: async () => opts.sources ?? [],
    listPdfSizes: async () => opts.pdfSizes ?? [],
    listUsage: async () => {
      log.push('listUsage');
      return opts.usage ?? [];
    },
    getSongs: async (ids) => {
      getSongsCalls.push(ids);
      return new Map(Object.entries(opts.songs ?? {}).filter(([id]) => ids.includes(id)));
    },
    listSettledSetlists: async () => {
      log.push('listSettled');
      if (opts.failSettled) throw new Error('settled failed');
      return [];
    },
    recordUsage: async () => 'created',
    now: () => NOW,
  };
  return { deps, log, getSongsCalls };
}

/** Repete um uso da música `songId` `count` vezes na mesma data. */
function uses(songId: string, count: number, date = '2026-11-20'): Usage[] {
  return Array.from({ length: count }, () => ({ date, songIds: [songId] }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getStats counts', () => {
  it('counts arrangement sources and songs', async () => {
    const { deps } = setup({
      sources: ['handmade', 'handmade', 'generated'],
      songCount: 7,
    });
    const result = await getStats(deps);
    expect(result).toMatchObject({
      songCount: 7,
      pdfCount: 3,
      handmadeCount: 2,
      generatedCount: 1,
    });
  });

  it('sums PDF sizes into storage bytes', async () => {
    const withSizes = await getStats(setup({ pdfSizes: [1000, 2000] }).deps);
    expect(withSizes.storageBytes).toBe(3000);

    const empty = await getStats(setup({ pdfSizes: [] }).deps);
    expect(empty.storageBytes).toBe(0);
  });
});

describe('getStats rankings', () => {
  it('orders by uses, then by title with pt-BR collation', async () => {
    const { deps } = setup({
      usage: [...uses('s1', 3), ...uses('s2', 2), ...uses('s3', 2)],
      songs: {
        s1: { title: 'Meio', artistName: 'Ana' },
        s2: { title: 'Zeta', artistName: 'Bruno' },
        s3: { title: 'Alfa', artistName: 'Carla' },
      },
    });
    const result = await getStats(deps);
    expect(result.topAllTime).toEqual([
      { songId: 's1', title: 'Meio', artistName: 'Ana', uses: 3 },
      { songId: 's3', title: 'Alfa', artistName: 'Carla', uses: 2 },
      { songId: 's2', title: 'Zeta', artistName: 'Bruno', uses: 2 },
    ]);
  });

  it('includes only usages from the last 30 days in topLast30Days', async () => {
    const { deps } = setup({
      usage: [
        { date: '2026-10-24', songIds: ['s1'] },
        { date: '2026-10-23', songIds: ['s2'] },
      ],
      songs: {
        s1: { title: 'Recente', artistName: 'Ana' },
        s2: { title: 'Antiga', artistName: 'Bruno' },
      },
    });
    const result = await getStats(deps);
    expect(result.topLast30Days.map((s) => s.songId)).toEqual(['s1']);
    expect(result.topAllTime.map((s) => s.songId).sort()).toEqual(['s1', 's2']);
  });

  it('keeps at most 10 items in each ranking', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
    const songs = Object.fromEntries(
      ids.map((id) => [id, { title: `Música ${id}`, artistName: 'Artista' }]),
    );
    const { deps } = setup({
      usage: ids.flatMap((id) => uses(id, 1)),
      songs,
    });
    const result = await getStats(deps);
    expect(result.topAllTime).toHaveLength(10);
    expect(result.topLast30Days).toHaveLength(10);
  });

  it('drops deleted songs before cutting to 10 so the next one takes the slot', async () => {
    // c01..c11 existem (c01 = mais usada); 'gone' foi apagada mas ainda aparece no histórico.
    const existing = Array.from({ length: 11 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`);
    const songs = Object.fromEntries(
      existing.map((id) => [id, { title: `Música ${id}`, artistName: 'Artista' }]),
    );
    const { deps, getSongsCalls } = setup({
      usage: [...uses('gone', 20), ...existing.flatMap((id, i) => uses(id, 11 - i))],
      songs,
    });
    const result = await getStats(deps);
    expect(result.topAllTime.map((s) => s.songId)).toEqual(existing.slice(0, 10));
    expect(result.topAllTime.some((s) => s.songId === 'gone')).toBe(false);
    expect(getSongsCalls).toHaveLength(1);
    expect(getSongsCalls[0]).toEqual(expect.arrayContaining(['gone', ...existing]));
  });

  it('ignores stored invalid song ids: getSongs only receives valid ids and nothing throws', async () => {
    const { deps, getSongsCalls } = setup({
      usage: [
        { date: '2026-11-20', songIds: ['ok', 'a/b', '', '__x__'] },
        { date: '2026-11-21', songIds: ['ok'] },
      ],
      songs: { ok: { title: 'Boa', artistName: 'Artista' } },
    });
    const result = await getStats(deps);
    expect(getSongsCalls).toEqual([['ok']]);
    expect(result.topAllTime).toEqual([
      { songId: 'ok', title: 'Boa', artistName: 'Artista', uses: 2 },
    ]);
    expect(result.topLast30Days.map((s) => s.songId)).toEqual(['ok']);
  });

  it('returns empty rankings when there is no usage', async () => {
    const result = await getStats(setup().deps);
    expect(result.topAllTime).toEqual([]);
    expect(result.topLast30Days).toEqual([]);
  });
});

describe('getStats settled counting', () => {
  it('counts settled setlists before reading usage', async () => {
    const { deps, log } = setup();
    await getStats(deps);
    expect(log).toEqual(['listSettled', 'listUsage']);
  });

  it('still returns stats and logs the error when counting fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { deps } = setup({
      failSettled: true,
      sources: ['handmade'],
      usage: uses('s1', 2),
      songs: { s1: { title: 'Única', artistName: 'Ana' } },
    });
    const result = await getStats(deps);
    expect(result.pdfCount).toBe(1);
    expect(result.topAllTime).toEqual([
      { songId: 's1', title: 'Única', artistName: 'Ana', uses: 2 },
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('getStatsForAdmin', () => {
  const withRole = (role: unknown) => {
    const { deps, log } = setup({ sources: ['generated'], songCount: 1 });
    return { deps: { ...deps, getUserRole: async () => role }, log };
  };

  it('returns stats for admin', async () => {
    const { deps } = withRole('admin');
    await expect(getStatsForAdmin(deps, 'u1')).resolves.toMatchObject({
      songCount: 1,
      pdfCount: 1,
      generatedCount: 1,
    });
  });

  it('rejects member, viewer and unknown roles with permission-denied', async () => {
    for (const role of ['member', 'viewer', 'root', undefined]) {
      const { deps, log } = withRole(role);
      await expect(getStatsForAdmin(deps, 'u1')).rejects.toMatchObject({
        code: 'permission-denied',
      });
      expect(log).toEqual([]);
    }
  });

  it('rejects a missing uid with unauthenticated', async () => {
    const { deps, log } = withRole('admin');
    await expect(getStatsForAdmin(deps, undefined)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(log).toEqual([]);
  });
});
