import { TTL_DAYS, type Setlist } from './types';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const parse = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return [y, m, d];
};

const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const dayMs = (date: string): number => {
  const [y, m, d] = parse(date);
  return Date.UTC(y, m - 1, d);
};

const weekday = (date: string): number => new Date(dayMs(date)).getUTCDay();

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Data de hoje (YYYY-MM-DD) em America/Sao_Paulo. */
export function todayLocal(now: Date): string {
  return formatter.format(now);
}

/** Fim do dia de `date` em America/Sao_Paulo (UTC−3 fixo) + TTL_DAYS. */
export function expiresAtFor(date: string): Date {
  const [y, m, d] = parse(date);
  return new Date(Date.UTC(y, m - 1, d + 1, 3) + TTL_DAYS * DAY_MS);
}

/** Próxima quinta ou domingo a partir de `today` (inclusive). */
export function defaultCultoDate(today: string): string {
  const wd = weekday(today);
  const ahead = wd === 0 || wd === 4 ? 0 : wd < 4 ? 4 - wd : 7 - wd;
  return toIso(dayMs(today) + ahead * DAY_MS);
}

export function defaultLabel(date: string): string {
  return WEEKDAYS[weekday(date)] as string;
}

/** `date` anterior a 29 dias atrás é barrada. */
export function isTooOld(date: string, today: string): boolean {
  return date < toIso(dayMs(today) - (TTL_DAYS - 1) * DAY_MS);
}

export function isExpired(setlist: Setlist, now: Date): boolean {
  return setlist.expiresAt.getTime() <= now.getTime();
}
