import type { SongSummary } from '../catalog/types';
import { shortDate } from './format';
import type { SetlistItem } from './types';

/** Uma linha da lista já resolvida: título do catálogo e tom escolhido no repertório. */
export interface ShareLine {
  title: string;
  key: string;
}

export interface ShareMessageInput {
  label: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Só os louvores que ainda existem no catálogo, na ordem do repertório. */
  items: ShareLine[];
  link: string;
}

/**
 * Itens do repertório → linhas da mensagem. Louvores cujo catálogo não existe mais saem daqui,
 * então a numeração na mensagem fica contínua.
 */
export function resolveShareLines(
  items: SetlistItem[],
  songsById: ReadonlyMap<string, Pick<SongSummary, 'title'>>,
): ShareLine[] {
  const lines: ShareLine[] = [];
  for (const item of items) {
    const song = songsById.get(item.songId);
    if (song) lines.push({ title: song.title, key: item.key });
  }
  return lines;
}

/** No WhatsApp, `*` é negrito: asteriscos no rótulo ou no título quebrariam a formatação. */
function stripBold(text: string): string {
  return text.replace(/\*/g, '').trim();
}

/**
 * Texto enviado pelo compartilhamento (WhatsApp e outros apps). O link fica no próprio texto.
 * Asteriscos do rótulo saem: no WhatsApp, `*` é negrito e quebraria o título em negrito.
 */
export function buildShareMessage({ label, date, items, link }: ShareMessageInput): string {
  const title = stripBold(label) || 'Repertório';
  const lines = [`🎵 *${title}* — ${shortDate(date)}`];
  items.forEach((item, index) => {
    lines.push(`${index + 1}. ${stripBold(item.title)} (${item.key})`);
  });
  lines.push(link);
  return lines.join('\n');
}
