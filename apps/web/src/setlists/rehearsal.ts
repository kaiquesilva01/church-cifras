import { shiftDate } from './dates';

/** O ensaio pode cair até 7 dias antes do culto (Rules: `validRehearsal`). */
export const REHEARSAL_DAYS_BEFORE = 7;
/** Brasília é UTC-3 o ano todo (sem horário de verão). */
const BRASILIA_HOURS = 3;
const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function isValidHour(hour: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hour);
}

/** Dia (YYYY-MM-DD) e hora (HH:MM) em Brasília → instante. */
export function rehearsalInstant(day: string, hour: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const [h, min] = hour.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, h + BRASILIA_HOURS, min));
}

/** Instante → dia e hora em Brasília (inverso de `rehearsalInstant`). */
export function rehearsalParts(at: Date): { day: string; hour: string } {
  const local = new Date(at.getTime() - BRASILIA_HOURS * 3_600_000).toISOString();
  return { day: local.slice(0, 10), hour: local.slice(11, 16) };
}

/** Dias aceitos para o ensaio: de 7 dias antes do culto até o próprio culto, inclusive. */
export function rehearsalWindow(culto: string): { first: string; last: string } {
  return { first: shiftDate(culto, -REHEARSAL_DAYS_BEFORE), last: culto };
}

export function isRehearsalDayInWindow(day: string, culto: string): boolean {
  const { first, last } = rehearsalWindow(culto);
  return day >= first && day <= last;
}

/** Texto "Ensaio {dia da semana} · dd/mm às HHhMM" (sempre com dia e data) e se já passou (`past`). */
export function describeRehearsal(at: Date, now: Date): { text: string; past: boolean } {
  const { day, hour } = rehearsalParts(at);
  const weekday = WEEKDAYS_SHORT[new Date(`${day}T12:00:00Z`).getUTCDay()] as string;
  return {
    text: `Ensaio ${weekday} · ${day.slice(8, 10)}/${day.slice(5, 7)} às ${hour.replace(':', 'h')}`,
    past: at.getTime() <= now.getTime(),
  };
}
