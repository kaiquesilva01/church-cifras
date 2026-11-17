import type { Setlist } from './types';

/** `YYYY-MM-DD` → `DD/MM`. */
export function shortDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}

export function songCount(setlist: Setlist): string {
  const n = setlist.items.length;
  return n === 1 ? '1 louvor' : `${n} louvores`;
}
