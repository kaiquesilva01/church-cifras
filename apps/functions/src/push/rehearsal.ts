import { todayInSaoPaulo } from '../stats/dates';
import { formatCultoDate, readSetlist, toDate } from './newSetlist';
import type { RepertorioSend } from './send';
import type { Origin } from './token';

// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
// Consulta dos ensaios: (agora, agora + 24 h].
export const LOOKAHEAD_MS = DAY_MS;
// Véspera: 24 h antes, nos 10 min finais da janela.
const VESPERA_WINDOW_MS = 10 * MIN_MS;
// Aviso "1 hora": ensaio em (agora, agora + 60 min].
const PERTO_MS = HOUR_MS;
// "No dia": entre 8h00 e 8h10 de Brasília, para ensaio às 11h00 ou depois.
const DIA_START_MINUTE = 8 * 60;
const DIA_END_MINUTE = 8 * 60 + 10;
const DIA_MIN_REHEARSAL_MINUTE = 11 * 60;

export type RehearsalTipo = 'vespera' | 'dia' | 'perto';

export type RehearsalSetlist = {
  id: string;
  ministryId: string;
  label: string;
  origin: Origin;
  rehearsalAt: Date;
  expiresAt: Date | undefined;
};

// Hora de Brasília no formato "18h30", sem depender do fuso da máquina.
export function formatSaoPauloHour(date: Date): string {
  const local = new Date(date.getTime() - SAO_PAULO_OFFSET_MS);
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hours}h${minutes}`;
}

export function formatSaoPauloDay(rehearsalAt: Date, now: Date): 'hoje' | 'amanhã' {
  return todayInSaoPaulo(rehearsalAt) === todayInSaoPaulo(now) ? 'hoje' : 'amanhã';
}

export function readRehearsalSetlist(
  id: string,
  ministryId: string,
  data: Record<string, unknown> | undefined,
): RehearsalSetlist | undefined {
  const setlist = readSetlist(data);
  const rehearsalAt = toDate(data?.rehearsalAt);
  if (setlist === undefined || rehearsalAt === undefined) return undefined;
  return {
    id,
    ministryId,
    label: setlist.label,
    origin: setlist.origin,
    rehearsalAt,
    expiresAt: setlist.expiresAt,
  };
}

// Minutos desde 00h00 de Brasília (mesmo cálculo de formatSaoPauloHour).
export function saoPauloMinuteOfDay(date: Date): number {
  const local = new Date(date.getTime() - SAO_PAULO_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

// Qual aviso é devido agora para um ensaio, sem I/O. Null: nenhum.
export function dueRehearsalNotice(now: Date, rehearsalAt: Date): RehearsalTipo | null {
  const diff = rehearsalAt.getTime() - now.getTime();
  if (diff <= 0) return null;
  if (diff <= PERTO_MS) return 'perto';
  if (diff <= DAY_MS && diff > DAY_MS - VESPERA_WINDOW_MS) return 'vespera';
  const nowMinute = saoPauloMinuteOfDay(now);
  if (
    nowMinute >= DIA_START_MINUTE &&
    nowMinute < DIA_END_MINUTE &&
    saoPauloMinuteOfDay(rehearsalAt) >= DIA_MIN_REHEARSAL_MINUTE &&
    todayInSaoPaulo(now) === todayInSaoPaulo(rehearsalAt)
  ) {
    return 'dia';
  }
  return null;
}

function isRehearsalTipo(value: unknown): value is RehearsalTipo {
  return value === 'vespera' || value === 'dia' || value === 'perto';
}

// Horário do ensaio da marca mais recente (maior createdAt) cujo ensaio ainda não passou.
export function lastRehearsalAt(
  markers: Array<Record<string, unknown>>,
  now: Date,
): Date | undefined {
  let latest: { createdAt: number; rehearsalAt: Date } | undefined;
  for (const marker of markers) {
    if (!isRehearsalTipo(marker.tipo)) continue;
    const createdAt = toDate(marker.createdAt);
    const rehearsalAt = toDate(marker.rehearsalAt);
    if (createdAt === undefined || rehearsalAt === undefined) continue;
    if (rehearsalAt.getTime() <= now.getTime()) continue;
    if (latest === undefined || createdAt.getTime() > latest.createdAt) {
      latest = { createdAt: createdAt.getTime(), rehearsalAt };
    }
  }
  return latest?.rehearsalAt;
}

// Título e corpo do aviso. `previous` é o horário da última marca viva: se mudou, sai "mudou".
export function buildRehearsalReminder(
  now: Date,
  setlist: RehearsalSetlist,
  tipo: RehearsalTipo,
  previous: Date | undefined,
): RepertorioSend {
  const at = setlist.rehearsalAt;
  const hour = formatSaoPauloHour(at);
  const weekdayDate = formatCultoDate(todayInSaoPaulo(at)) ?? '';
  const common = {
    ministryId: setlist.ministryId,
    link: `/repertorios/${setlist.id}`,
    tag: `setlist-${setlist.id}-ensaio`,
    origin: setlist.origin,
    respectSwitch: true,
  };
  const body = `${setlist.label} · ${weekdayDate}. Toque para ver os louvores.`;

  if (previous !== undefined && previous.getTime() !== at.getTime()) {
    const sameDay = todayInSaoPaulo(previous) === todayInSaoPaulo(at);
    const title = sameDay
      ? `Ensaio mudou para ${hour}`
      : `Ensaio mudou para ${weekdayDate} às ${hour}`;
    return { ...common, title, body };
  }

  if (tipo === 'perto') {
    const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / MIN_MS));
    const title = minutes >= 59 ? 'Ensaio em 1 hora' : `Ensaio em ${minutes} min`;
    return {
      ...common,
      title,
      body: `${setlist.label} · ${formatSaoPauloDay(at, now)} às ${hour}. Toque para ver os louvores.`,
    };
  }

  const title = tipo === 'vespera' ? `Ensaio amanhã às ${hour}` : `Ensaio hoje às ${hour}`;
  return { ...common, title, body };
}
