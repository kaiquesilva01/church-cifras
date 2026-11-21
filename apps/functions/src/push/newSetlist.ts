import type { SendInput } from './send';
import { parseOrigin, type Origin } from './token';

/** Quantidade de louvores em que o repertório passa a valer o aviso. */
export const NEW_SETLIST_MIN_ITEMS = 4;

/**
 * Só repertórios criados a partir daqui podem avisar: os antigos (já com 4 ou mais,
 * sem marca) não devem virar "Novo repertório" numa troca de música. 22/11/2026 00:00 de Brasília.
 */
export const NEW_SETLIST_ANNOUNCE_SINCE = new Date(Date.UTC(2026, 10, 22, 3, 0, 0));

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export type SetlistSnapshot = {
  date: string;
  label: string;
  itemCount: number;
  origin: Origin;
  createdBy: string;
  updatedBy: string;
  expiresAt?: Date | undefined;
  createdAt?: Date | undefined;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Aceita Date e Timestamp do Admin SDK (qualquer objeto com toDate()).
function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date: unknown = value.toDate();
    return date instanceof Date ? date : undefined;
  }
  return undefined;
}

/** Lê o documento de `setlists` sem depender do Admin SDK. Sem dados, `undefined`. */
export function readSetlist(
  data: Record<string, unknown> | undefined,
): SetlistSnapshot | undefined {
  if (data === undefined) return undefined;
  const items = data.items;
  return {
    date: text(data.date),
    label: text(data.label),
    itemCount: Array.isArray(items) ? items.length : 0,
    origin: parseOrigin(data.origin) ?? 'producao',
    createdBy: text(data.createdBy),
    updatedBy: text(data.updatedBy),
    expiresAt: toDate(data.expiresAt),
    createdAt: toDate(data.createdAt),
  };
}

/**
 * Avisa só na travessia de menos de 4 para 4 ou mais (ou na criação já com 4 ou mais),
 * e só de repertório criado a partir de `NEW_SETLIST_ANNOUNCE_SINCE`. Sem `createdAt` legível, não avisa.
 */
export function shouldAnnounce(
  before: SetlistSnapshot | undefined,
  after: SetlistSnapshot | undefined,
): boolean {
  if (after === undefined || after.itemCount < NEW_SETLIST_MIN_ITEMS) return false;
  if (after.createdAt === undefined || after.createdAt < NEW_SETLIST_ANNOUNCE_SINCE) return false;
  return before === undefined || before.itemCount < NEW_SETLIST_MIN_ITEMS;
}

/** Ex.: `2026-11-22` vira `dom 22/11`; `null` se a data não existe. */
export function formatCultoDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.toISOString().slice(0, 10) !== date) return null;
  const weekday = WEEKDAYS[utc.getUTCDay()];
  if (weekday === undefined) return null;
  return `${weekday} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Mensagem do aviso. Não envia nada: quem chama passa o resultado a `sendToDevices`. */
export function buildNewSetlistMessage(
  setlistId: string,
  setlist: SetlistSnapshot,
  before: SetlistSnapshot | undefined,
): SendInput | null {
  const when = formatCultoDate(setlist.date);
  if (when === null) return null;
  // Quem fez a mudança não recebe o aviso: o criador na criação, quem editou na atualização.
  const actor = before ? setlist.updatedBy : setlist.createdBy;
  return {
    title: 'Novo repertório',
    body: `${setlist.label} · ${when}`,
    link: `/repertorios/${setlistId}`,
    tag: `setlist-${setlistId}-novo`,
    origin: setlist.origin,
    excludeUid: actor || undefined,
    respectSwitch: true,
  };
}
