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

/** `YYYY-MM-DD` → dia da semana por extenso em pt-BR (ex.: `sexta-feira`). Sem fuso: meio-dia local. */
export function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long' });
}
