import { addDays, todayInSaoPaulo } from './dates';

export type SettledSetlist = { id: string; date: string; songIds: string[] };

export type UsageDeps = {
  listSettledSetlists(cutoff: string): Promise<SettledSetlist[]>;
  recordUsage(usage: {
    setlistId: string;
    date: string;
    songIds: string[];
  }): Promise<'created' | 'exists'>;
  now(): Date;
};

/** Um repertório conta a partir de D + 2 dias (dia civil de Brasília). */
const SETTLE_DAYS = 2;

/**
 * Registra no histórico de uso cada repertório fechado (data <= hoje - 2 dias).
 * Repertórios já registrados ('exists') não são erro.
 */
export async function countSettledSetlists(
  deps: UsageDeps,
): Promise<{ created: number; alreadyCounted: number }> {
  const cutoff = addDays(todayInSaoPaulo(deps.now()), -SETTLE_DAYS);
  const setlists = await deps.listSettledSetlists(cutoff);

  let created = 0;
  let alreadyCounted = 0;
  for (const setlist of setlists) {
    const songIds = [...new Set(setlist.songIds)];
    const outcome = await deps.recordUsage({ setlistId: setlist.id, date: setlist.date, songIds });
    if (outcome === 'created') created += 1;
    else alreadyCounted += 1;
  }
  return { created, alreadyCounted };
}
