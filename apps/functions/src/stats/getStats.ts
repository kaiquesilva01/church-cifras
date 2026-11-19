import { requireRole, type RoleDeps } from '../auth/requireRole';
import { countSettledSetlists, type UsageDeps } from './countUsage';
import { addDays, todayInSaoPaulo } from './dates';
import { isSongId } from './songId';

export type TopSong = { songId: string; title: string; artistName: string; uses: number };

export type StatsResult = {
  songCount: number;
  pdfCount: number;
  handmadeCount: number;
  generatedCount: number;
  storageBytes: number;
  topAllTime: TopSong[];
  topLast30Days: TopSong[];
};

export type StatsDeps = UsageDeps & {
  countSongs(): Promise<number>;
  listArrangementSources(): Promise<string[]>;
  listPdfSizes(): Promise<number[]>;
  listUsage(): Promise<Array<{ date: string; songIds: string[] }>>;
  getSongs(ids: string[]): Promise<Map<string, { title: string; artistName: string }>>;
};

type Usage = { date: string; songIds: string[] };

const TOP_SIZE = 10;
/** Janela "últimos 30 dias": hoje e os 29 dias anteriores. */
const WINDOW_DAYS = 30;

function tally(usages: Usage[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const usage of usages) {
    for (const songId of new Set(usage.songIds.filter(isSongId))) {
      counts.set(songId, (counts.get(songId) ?? 0) + 1);
    }
  }
  return counts;
}

// Descarta músicas apagadas antes de ordenar e cortar, para a próxima ocupar a vaga.
function rank(
  counts: Map<string, number>,
  songs: Map<string, { title: string; artistName: string }>,
): TopSong[] {
  return [...counts]
    .flatMap(([songId, uses]) => {
      const song = songs.get(songId);
      return song ? [{ songId, title: song.title, artistName: song.artistName, uses }] : [];
    })
    .sort((a, b) => b.uses - a.uses || a.title.localeCompare(b.title, 'pt-BR'))
    .slice(0, TOP_SIZE);
}

export async function getStats(deps: StatsDeps): Promise<StatsResult> {
  try {
    await countSettledSetlists(deps);
  } catch (error) {
    console.error('Failed to count settled setlists', error);
  }

  const [songCount, sources, pdfSizes, usage] = await Promise.all([
    deps.countSongs(),
    deps.listArrangementSources(),
    deps.listPdfSizes(),
    deps.listUsage(),
  ]);

  const since = addDays(todayInSaoPaulo(deps.now()), -(WINDOW_DAYS - 1));
  const allTime = tally(usage);
  const recent = tally(usage.filter((u) => u.date >= since));
  const ids = [...new Set([...allTime.keys(), ...recent.keys()])];
  const songs = await deps.getSongs(ids);

  return {
    songCount,
    pdfCount: sources.length,
    handmadeCount: sources.filter((s) => s === 'handmade').length,
    generatedCount: sources.filter((s) => s === 'generated').length,
    storageBytes: pdfSizes.reduce((sum, size) => sum + size, 0),
    topAllTime: rank(allTime, songs),
    topLast30Days: rank(recent, songs),
  };
}

export async function getStatsForAdmin(
  deps: StatsDeps & RoleDeps,
  uid: string | undefined,
): Promise<StatsResult> {
  await requireRole(deps, uid, ['admin']);
  return getStats(deps);
}
