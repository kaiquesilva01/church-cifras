import { isExpired } from './dates';
import type { Setlist } from './types';

const createdMs = (s: Setlist): number => (s.createdAt ? s.createdAt.getTime() : Infinity);

const byDateThenCreated = (a: Setlist, b: Setlist): number => {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = createdMs(a);
  const cb = createdMs(b);
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

export function groupSetlists(
  setlists: Setlist[],
  today: string,
  now: Date,
): { upcoming: Setlist[]; recent: Setlist[] } {
  const visible = setlists.filter((s) => !isExpired(s, now));
  const upcoming = visible.filter((s) => s.date >= today).sort(byDateThenCreated);
  const recent = visible
    .filter((s) => s.date < today)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : byDateThenCreated(a, b)));
  return { upcoming, recent };
}

/** Todos os repertórios da menor data >= hoje. */
export function nextCultos(setlists: Setlist[], today: string, now: Date): Setlist[] {
  const { upcoming } = groupSetlists(setlists, today, now);
  const first = upcoming[0];
  return first ? upcoming.filter((s) => s.date === first.date) : [];
}

export function sameContent(a: Setlist | null, b: Setlist | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.date === b.date &&
    a.label === b.label &&
    a.rehearsalAt?.getTime() === b.rehearsalAt?.getTime() &&
    a.items.length === b.items.length &&
    a.items.every((it, i) => {
      const other = b.items[i];
      return !!other && it.id === other.id && it.songId === other.songId && it.key === other.key;
    })
  );
}
