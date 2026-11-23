import { describe, expect, it } from 'vitest';
import { countSettledSetlists, type SettledSetlist, type UsageDeps } from './countUsage';

const SETLISTS: SettledSetlist[] = [
  { id: 's20', date: '2026-11-20', songIds: ['a'] },
  { id: 's21', date: '2026-11-21', songIds: ['b'] },
];

function setup(opts: { now: string; setlists?: SettledSetlist[]; existing?: string[] }) {
  const cutoffs: string[] = [];
  const recorded: Array<{
    setlistId: string;
    date: string;
    songIds: string[];
    ministryId: string;
  }> = [];
  const existing = new Set(opts.existing ?? []);
  const deps: UsageDeps = {
    listSettledSetlists: async (cutoff) => {
      cutoffs.push(cutoff);
      return (opts.setlists ?? SETLISTS).filter((s) => s.date <= cutoff);
    },
    recordUsage: async (usage) => {
      recorded.push(usage);
      if (existing.has(usage.setlistId)) return 'exists';
      return 'created';
    },
    now: () => new Date(opts.now),
  };
  return { deps, cutoffs, recorded };
}

describe('countSettledSetlists', () => {
  it('records only setlists dated on or before today minus 2 days', async () => {
    const { deps, cutoffs, recorded } = setup({ now: '2026-11-22T15:00:00Z' });

    const result = await countSettledSetlists(deps);

    expect(cutoffs).toEqual(['2026-11-20']);
    expect(recorded.map((r) => r.setlistId)).toEqual(['s20']);
    expect(result).toEqual({ created: 1, alreadyCounted: 0 });
  });

  it('does not record a setlist dated today minus 1 day', async () => {
    const { deps, cutoffs, recorded } = setup({ now: '2026-11-21T15:00:00Z' });

    await countSettledSetlists(deps);

    expect(cutoffs).toEqual(['2026-11-19']);
    expect(recorded).toEqual([]);
  });

  it('computes the cutoff from the Sao Paulo day (still the 21st in Brasilia)', async () => {
    const { deps, cutoffs } = setup({ now: '2026-11-22T02:30:00Z' });

    await countSettledSetlists(deps);

    expect(cutoffs).toEqual(['2026-11-19']);
  });

  it('deduplicates songIds keeping their first-seen order', async () => {
    const { deps, recorded } = setup({
      now: '2026-11-22T15:00:00Z',
      setlists: [{ id: 's1', date: '2026-11-20', songIds: ['a', 'b', 'a'] }],
    });

    await countSettledSetlists(deps);

    expect(recorded).toEqual([
      { setlistId: 's1', date: '2026-11-20', songIds: ['a', 'b'], ministryId: 'hajaluz' },
    ]);
  });

  it('drops invalid song ids before deduplicating and recording', async () => {
    const { deps, recorded } = setup({
      now: '2026-11-22T15:00:00Z',
      setlists: [{ id: 's1', date: '2026-11-20', songIds: ['ok', 'a/b', '', '__x__', 'ok2'] }],
    });

    await countSettledSetlists(deps);

    expect(recorded).toEqual([
      { setlistId: 's1', date: '2026-11-20', songIds: ['ok', 'ok2'], ministryId: 'hajaluz' },
    ]);
  });

  it('still records a setlist that only has invalid song ids, with an empty list', async () => {
    const { deps, recorded } = setup({
      now: '2026-11-22T15:00:00Z',
      setlists: [{ id: 's1', date: '2026-11-20', songIds: ['a/b', ''] }],
    });

    await countSettledSetlists(deps);

    expect(recorded).toEqual([
      { setlistId: 's1', date: '2026-11-20', songIds: [], ministryId: 'hajaluz' },
    ]);
  });

  it('records an empty setlist with an empty songIds list', async () => {
    const { deps, recorded } = setup({
      now: '2026-11-22T15:00:00Z',
      setlists: [{ id: 's1', date: '2026-11-20', songIds: [] }],
    });

    await countSettledSetlists(deps);

    expect(recorded).toEqual([
      { setlistId: 's1', date: '2026-11-20', songIds: [], ministryId: 'hajaluz' },
    ]);
  });

  it('counts an already recorded setlist as alreadyCounted without throwing', async () => {
    const { deps } = setup({
      now: '2026-11-22T15:00:00Z',
      setlists: [
        { id: 's20', date: '2026-11-20', songIds: ['a'] },
        { id: 's19', date: '2026-11-19', songIds: ['b'] },
      ],
      existing: ['s20'],
    });

    const result = await countSettledSetlists(deps);

    expect(result).toEqual({ created: 1, alreadyCounted: 1 });
  });
});
