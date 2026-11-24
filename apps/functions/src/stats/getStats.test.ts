import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStats, getStatsForCaller, type CallerDeps, type StatsDeps } from './getStats';

const NOW = new Date('2026-11-22T15:00:00Z');

type Song = { title: string; artistName: string };
type Usage = { date: string; songIds: string[]; ministryId: string };

type Opts = {
  sources?: string[];
  songCount?: number;
  pdfSizes?: number[];
  usage?: Usage[];
  songs?: Record<string, Song>;
  failSettled?: boolean;
  missingMinistries?: string[];
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

/**
 * Deps do chamador: `users` é uid -> { appAdmin }, `memberships` é 'uid|mid' -> papel.
 * Ministérios existem por padrão, exceto os listados em `missingMinistries`.
 */
function deps(
  users: Record<string, { appAdmin: boolean }>,
  memberships: Record<string, 'member' | 'admin'> = {},
  opts: Opts = {},
): CallerDeps {
  const missing = new Set(opts.missingMinistries ?? []);
  return {
    ...setup(opts).deps,
    readUser: async (uid) => users[uid] ?? null,
    readMembership: async (mid, uid) => {
      const role = memberships[`${uid}|${mid}`];
      return role ? { role } : null;
    },
    readMinistry: async (mid) => (missing.has(mid) ? null : { name: `Ministério ${mid}` }),
  };
}

/** Repete um uso da música `songId` `count` vezes na mesma data. */
function uses(songId: string, count: number, date = '2026-11-20', ministryId = 'hajaluz'): Usage[] {
  return Array.from({ length: count }, () => ({ date, songIds: [songId], ministryId }));
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
        { date: '2026-10-24', songIds: ['s1'], ministryId: 'hajaluz' },
        { date: '2026-10-23', songIds: ['s2'], ministryId: 'hajaluz' },
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
        { date: '2026-11-20', songIds: ['ok', 'a/b', '', '__x__'], ministryId: 'hajaluz' },
        { date: '2026-11-21', songIds: ['ok'], ministryId: 'hajaluz' },
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

describe('getStatsForCaller', () => {
  it('admin da app recebe cartões (general) e o ranking do ministério escolhido', async () => {
    const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }), 'chefe', 'outro');
    expect(res.general).not.toBeNull();
    expect(res.general?.songCount).toBeTypeOf('number');
    expect(res.ministry?.id).toBe('outro');
  });

  it('admin da app sem ministério escolhido recebe só o geral', async () => {
    const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }), 'chefe', undefined);
    expect(res.general).not.toBeNull();
    expect(res.ministry).toBeNull();
  });

  it('admin do ministério recebe só o ranking dele, sem cartões gerais', async () => {
    const res = await getStatsForCaller(
      deps({ adm: { appAdmin: false } }, { 'adm|hajaluz': 'admin' }),
      'adm',
      'hajaluz',
    );
    expect(res.general).toBeNull();
    expect(res.ministry?.id).toBe('hajaluz');
  });

  it('admin do ministério sem ministryId é negado (não há visão geral)', async () => {
    await expect(
      getStatsForCaller(
        deps({ adm: { appAdmin: false } }, { 'adm|hajaluz': 'admin' }),
        'adm',
        undefined,
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('membro comum e admin de outro ministério são negados', async () => {
    await expect(
      getStatsForCaller(
        deps({ ana: { appAdmin: false } }, { 'ana|hajaluz': 'member' }),
        'ana',
        'hajaluz',
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      getStatsForCaller(
        deps({ adm: { appAdmin: false } }, { 'adm|outro': 'admin' }),
        'adm',
        'hajaluz',
      ),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('uso de um ministério não entra no ranking de outro', async () => {
    const res = await getStatsForCaller(
      deps(
        { chefe: { appAdmin: true } },
        {},
        {
          usage: [{ date: '2026-11-20', songIds: ['a'], ministryId: 'outro' }],
        },
      ),
      'chefe',
      'hajaluz',
    );
    expect(res.ministry?.topAllTime).toEqual([]);
  });

  it('ranking do ministério conta só os usos dele, com o nome do ministério', async () => {
    const res = await getStatsForCaller(
      deps(
        { chefe: { appAdmin: true } },
        {},
        {
          usage: [...uses('a', 2, '2026-11-20', 'hajaluz'), ...uses('a', 5, '2026-11-20', 'outro')],
          songs: { a: { title: 'Alfa', artistName: 'Ana' } },
        },
      ),
      'chefe',
      'hajaluz',
    );
    expect(res.ministry).toMatchObject({
      id: 'hajaluz',
      name: 'Ministério hajaluz',
      topAllTime: [{ songId: 'a', uses: 2 }],
    });
  });

  it('ministério escolhido que não existe é não encontrado', async () => {
    await expect(
      getStatsForCaller(
        deps({ chefe: { appAdmin: true } }, {}, { missingMinistries: ['fantasma'] }),
        'chefe',
        'fantasma',
      ),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('sem login é negado com unauthenticated', async () => {
    await expect(
      getStatsForCaller(deps({ chefe: { appAdmin: true } }), undefined, undefined),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
