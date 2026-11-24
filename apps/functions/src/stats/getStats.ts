import { HttpsError } from 'firebase-functions/v2/https';
import { countSettledSetlists, type UsageDeps } from './countUsage';
import { addDays, todayInSaoPaulo } from './dates';
import { readMinistryId } from '../ministries/model';
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
  listUsage(): Promise<Array<{ date: string; songIds: string[]; ministryId: string }>>;
  getSongs(ids: string[]): Promise<Map<string, { title: string; artistName: string }>>;
};

type Usage = { date: string; songIds: string[]; ministryId: string };

export type MinistryRanking = {
  id: string;
  name: string;
  topAllTime: TopSong[];
  topLast30Days: TopSong[];
};

/** Resposta de `getStatsForCaller`: cartões gerais (só admin da app) e ranking de um ministério. */
export type StatsCallerResult = {
  general: StatsResult | null;
  ministry: MinistryRanking | null;
};

export type CallerDeps = StatsDeps & {
  readUser(uid: string): Promise<{ appAdmin: boolean } | null>;
  readMembership(mid: string, uid: string): Promise<{ role: 'member' | 'admin' } | null>;
  readMinistry(mid: string): Promise<{ name: string } | null>;
};

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

/** Lê o ministério pedido; sem ele, not-found. Chamado antes de qualquer cálculo caro. */
async function requireMinistry(
  deps: CallerDeps,
  mid: string,
): Promise<{ id: string; name: string }> {
  const ministry = await deps.readMinistry(mid);
  if (!ministry) throw new HttpsError('not-found', 'Ministério não encontrado.');
  return { id: mid, name: ministry.name };
}

/** Ranking de um ministério: só os usos com esse ministryId. Mesmas regras de tally/rank do geral. */
async function rankingOf(
  deps: CallerDeps,
  ministry: { id: string; name: string },
): Promise<MinistryRanking> {
  const usage = (await deps.listUsage()).filter((u) => u.ministryId === ministry.id);
  const since = addDays(todayInSaoPaulo(deps.now()), -(WINDOW_DAYS - 1));
  const allTime = tally(usage);
  const recent = tally(usage.filter((u) => u.date >= since));
  const ids = [...new Set([...allTime.keys(), ...recent.keys()])];
  const songs = await deps.getSongs(ids);
  return {
    id: ministry.id,
    name: ministry.name,
    topAllTime: rank(allTime, songs),
    topLast30Days: rank(recent, songs),
  };
}

export async function getStatsForCaller(
  deps: CallerDeps,
  uid: string | undefined,
  ministryId: unknown,
): Promise<StatsCallerResult> {
  if (!uid) throw new HttpsError('unauthenticated', 'Entre para continuar.');
  // Mesma validação dos callables de ministério: '/' e formato inválido viram invalid-argument.
  const mid =
    ministryId === undefined || ministryId === null || ministryId === ''
      ? undefined
      : readMinistryId({ ministryId });
  const caller = await deps.readUser(uid);
  if (caller?.appAdmin === true) {
    const ministry = mid ? await requireMinistry(deps, mid) : undefined;
    const general = await getStats(deps);
    return {
      general,
      ministry: ministry ? await rankingOf(deps, ministry) : null,
    };
  }
  if (!mid) {
    throw new HttpsError('permission-denied', 'Informe o ministério para ver o ranking.');
  }
  const membership = await deps.readMembership(mid, uid);
  if (membership?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Só o admin do ministério vê este ranking.');
  }
  const ministry = await requireMinistry(deps, mid);
  return { general: null, ministry: await rankingOf(deps, ministry) };
}
