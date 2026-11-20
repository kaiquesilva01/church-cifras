import { describe, expect, it } from 'vitest';
import { backfillLyrics, type BackfillDeps } from './backfill';

interface FakeSong {
  hasLyrics?: boolean;
  storagePath?: string | null;
  pdf?: Uint8Array;
  readError?: string;
  lyrics?: string;
  /** writeLyrics result; false means the doc already existed. */
  created?: boolean;
}

function setup(songs: Record<string, FakeSong>) {
  const written: Array<[string, string]> = [];
  // Each song's PDF bytes are unique, so lyricsFromPdf can look the lyrics up by content.
  const lyricsByPdf = new Map<string, string>();
  for (const song of Object.values(songs)) {
    if (song.pdf && song.lyrics !== undefined) lyricsByPdf.set(String(song.pdf[0]), song.lyrics);
  }
  const byPath = new Map(
    Object.values(songs)
      .filter((s) => s.storagePath)
      .map((s) => [s.storagePath as string, s]),
  );
  const deps: BackfillDeps = {
    listSongIds: async () => Object.keys(songs),
    hasLyrics: async (songId) => songs[songId]?.hasLyrics ?? false,
    handmadeStoragePath: async (songId) => songs[songId]?.storagePath ?? null,
    readPdf: async (storagePath) => {
      const song = byPath.get(storagePath);
      if (song?.readError) throw new Error(song.readError);
      return song?.pdf ?? new Uint8Array([0]);
    },
    lyricsFromPdf: async (pdf) => lyricsByPdf.get(String(pdf[0])) ?? '',
    writeLyrics: async (songId, text) => {
      written.push([songId, text]);
      return songs[songId]?.created ?? true;
    },
  };
  return { deps, written };
}

const pdfOf = (tag: number): Uint8Array => new Uint8Array([tag, tag, tag]);

describe('backfillLyrics', () => {
  it('writes lyrics for a song without a lyrics doc', async () => {
    const { deps, written } = setup({
      s1: { storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: 'Luz\nCanto' },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report).toEqual({
      written: 1,
      existing: 0,
      noPdf: [],
      noText: [],
      failed: [],
      samples: [{ songId: 's1', text: 'Luz\nCanto' }],
    });
    expect(written).toEqual([['s1', 'Luz\nCanto']]);
  });

  it('skips songs that already have lyrics', async () => {
    const { deps, written } = setup({
      s1: { hasLyrics: true, storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: 'Luz' },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report.existing).toBe(1);
    expect(report.written).toBe(0);
    expect(written).toEqual([]);
  });

  it('reports songs without a handmade arrangement as noPdf', async () => {
    const { deps, written } = setup({ s1: { storagePath: null } });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report.noPdf).toEqual(['s1']);
    expect(written).toEqual([]);
  });

  it('reports songs whose extracted lyrics are empty as noText and writes nothing', async () => {
    const { deps, written } = setup({
      s1: { storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: '   \n  ' },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report.noText).toEqual(['s1']);
    expect(report.written).toBe(0);
    expect(written).toEqual([]);
  });

  it('records a failing song and keeps going with the others', async () => {
    const { deps, written } = setup({
      s1: { storagePath: 'songs/s1/a.pdf', readError: 'boom' },
      s2: { storagePath: 'songs/s2/b.pdf', pdf: pdfOf(2), lyrics: 'Rio' },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report.failed).toEqual([{ songId: 's1', error: 'boom' }]);
    expect(report.written).toBe(1);
    expect(written).toEqual([['s2', 'Rio']]);
  });

  it('dry run counts what would be written, samples it and writes nothing', async () => {
    const songs: Record<string, FakeSong> = {};
    for (let i = 1; i <= 5; i++) {
      songs[`s${i}`] = { storagePath: `songs/s${i}/a.pdf`, pdf: pdfOf(i), lyrics: `letra ${i}` };
    }
    const { deps, written } = setup(songs);
    const report = await backfillLyrics(deps, { dryRun: true });
    expect(written).toEqual([]);
    expect(report.written).toBe(5);
    expect(report.samples).toEqual([
      { songId: 's1', text: 'letra 1' },
      { songId: 's2', text: 'letra 2' },
      { songId: 's3', text: 'letra 3' },
    ]);
  });

  it('honors a custom sample count, including zero', async () => {
    const song = { s1: { storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: 'Luz' } };
    const { deps } = setup(song);
    const none = await backfillLyrics(deps, { dryRun: true, samples: 0 });
    expect(none.samples).toEqual([]);
    expect(none.written).toBe(1);
    expect((await backfillLyrics(deps, { dryRun: true, samples: 1 })).samples).toHaveLength(1);
  });

  it('truncates lyrics longer than 20000 characters', async () => {
    const long = 'a'.repeat(25_000);
    const { deps, written } = setup({
      s1: { storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: long },
    });
    await backfillLyrics(deps, { dryRun: false });
    expect(written).toHaveLength(1);
    expect(written[0]?.[1]).toHaveLength(20_000);
  });

  it('counts a second run as existing when writeLyrics reports the doc already exists', async () => {
    const { deps, written } = setup({
      s1: { storagePath: 'songs/s1/a.pdf', pdf: pdfOf(1), lyrics: 'Luz', created: false },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(written).toEqual([['s1', 'Luz']]);
    expect(report.existing).toBe(1);
    expect(report.written).toBe(0);
  });
});

describe('backfillLyrics: samples and progress', () => {
  it('does not record a sample when writeLyrics reports the doc already existed', async () => {
    const { deps } = setup({
      s1: { storagePath: 'a.pdf', pdf: pdfOf(1), lyrics: 'Luz', created: false },
      s2: { storagePath: 'b.pdf', pdf: pdfOf(2), lyrics: 'Canto' },
    });
    const report = await backfillLyrics(deps, { dryRun: false });
    expect(report.existing).toBe(1);
    expect(report.written).toBe(1);
    expect(report.samples).toEqual([{ songId: 's2', text: 'Canto' }]);
  });

  it('still records samples in dry-run (the doc would be created)', async () => {
    const { deps } = setup({
      s1: { storagePath: 'a.pdf', pdf: pdfOf(1), lyrics: 'Luz', created: false },
    });
    const report = await backfillLyrics(deps, { dryRun: true });
    expect(report.samples).toEqual([{ songId: 's1', text: 'Luz' }]);
  });

  it('reports progress every 25 songs and at the end', async () => {
    const songs: Record<string, FakeSong> = {};
    for (let i = 1; i <= 60; i++) songs[`s${i}`] = { hasLyrics: true };
    const { deps } = setup(songs);
    const calls: Array<[number, number]> = [];
    await backfillLyrics(deps, {
      dryRun: true,
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toEqual([
      [25, 60],
      [50, 60],
      [60, 60],
    ]);
  });

  it('reports progress once at the end when the total is a multiple of 25, and for an empty list', async () => {
    const songs: Record<string, FakeSong> = {};
    for (let i = 1; i <= 25; i++) songs[`s${i}`] = { hasLyrics: true };
    const calls: Array<[number, number]> = [];
    await backfillLyrics(setup(songs).deps, {
      dryRun: true,
      onProgress: (done, total) => calls.push([done, total]),
    });
    expect(calls).toEqual([[25, 25]]);

    const empty: Array<[number, number]> = [];
    await backfillLyrics(setup({}).deps, {
      dryRun: true,
      onProgress: (done, total) => empty.push([done, total]),
    });
    expect(empty).toEqual([[0, 0]]);
  });

  it('counts failed songs as processed and works without onProgress', async () => {
    const { deps } = setup({
      s1: { storagePath: 'a.pdf', pdf: pdfOf(1), readError: 'boom' },
    });
    const calls: Array<[number, number]> = [];
    const withCb = await backfillLyrics(deps, {
      dryRun: true,
      onProgress: (done, total) => calls.push([done, total]),
    });
    const without = await backfillLyrics(deps, { dryRun: true });
    expect(calls).toEqual([[1, 1]]);
    expect(withCb).toEqual(without);
  });
});
