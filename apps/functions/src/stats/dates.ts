const DAY_MS = 24 * 60 * 60 * 1000;

const saoPauloDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Dia civil atual em America/Sao_Paulo, no formato YYYY-MM-DD. */
export function todayInSaoPaulo(now: Date): string {
  return saoPauloDay.format(now);
}

/** Soma `days` (pode ser negativo) a uma data YYYY-MM-DD, em aritmética UTC. */
export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(time).toISOString().slice(0, 10);
}
