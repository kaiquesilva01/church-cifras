import { todayInSaoPaulo } from '../stats/dates';
import { readSetlist, toDate } from './newSetlist';
import type { SendInput } from './send';
import type { Origin } from './token';

// Janela "perto": ensaio em (agora, agora + 30 min].
export const SOON_MS = 30 * 60 * 1000;
// Janela "agora": ensaio em (agora - 5 min, agora].
export const NOW_MS = 5 * 60 * 1000;
// Brasília é UTC-3 o ano todo (sem horário de verão desde 2019).
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

export type RehearsalSetlist = {
  id: string;
  label: string;
  origin: Origin;
  rehearsalAt: Date;
  expiresAt: Date | undefined;
};

export type ReminderPlan = {
  tipo: 'perto' | 'agora';
  rehearsalAtMs: number;
  input: SendInput;
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
  data: Record<string, unknown> | undefined,
): RehearsalSetlist | undefined {
  const setlist = readSetlist(data);
  const rehearsalAt = toDate(data?.rehearsalAt);
  if (setlist === undefined || rehearsalAt === undefined) return undefined;
  return {
    id,
    label: setlist.label,
    origin: setlist.origin,
    rehearsalAt,
    expiresAt: setlist.expiresAt,
  };
}

export function planRehearsalReminder(
  now: Date,
  setlist: RehearsalSetlist,
  earlierSoonMs: number[],
): ReminderPlan | null {
  const nowMs = now.getTime();
  const at = setlist.rehearsalAt.getTime();
  const hour = formatSaoPauloHour(setlist.rehearsalAt);
  const common = {
    link: `/repertorios/${setlist.id}`,
    tag: `setlist-${setlist.id}-ensaio`,
    origin: setlist.origin,
    respectSwitch: true,
  };

  if (at > nowMs && at <= nowMs + SOON_MS) {
    const minutes = Math.max(1, Math.ceil((at - nowMs) / 60000));
    const moved = earlierSoonMs.some((ms) => ms !== at);
    const title = moved ? `Ensaio mudou para ${hour}` : `Ensaio em ${minutes} min`;
    const day = formatSaoPauloDay(setlist.rehearsalAt, now);
    return {
      tipo: 'perto',
      rehearsalAtMs: at,
      input: {
        ...common,
        title,
        body: `${setlist.label} · ${day} às ${hour}. Toque para ver os louvores.`,
      },
    };
  }

  if (at <= nowMs && at > nowMs - NOW_MS) {
    return {
      tipo: 'agora',
      rehearsalAtMs: at,
      input: {
        ...common,
        title: 'Ensaio agora',
        body: `${setlist.label} · começa às ${hour}.`,
      },
    };
  }

  return null;
}
