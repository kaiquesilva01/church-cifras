import { keySlug } from '@cifras/chords';
import type { SongSummary } from '../catalog/types';
import type { SetlistItem } from './types';

export interface ItemNav {
  /** 1-based entre os itens que abrem cifra; 0 se o item atual não está na lista. */
  position: number;
  total: number;
  prev: SetlistItem | null;
  next: SetlistItem | null;
  inList: boolean;
}

export function navigateItems(
  items: SetlistItem[],
  songs: SongSummary[],
  currentItemId: string | null,
): ItemNav {
  const byId = new Map(songs.map((s) => [s.id, s]));
  const openable = items.filter((i) => (byId.get(i.songId)?.keys.length ?? 0) > 0);
  const idx = currentItemId === null ? -1 : openable.findIndex((i) => i.id === currentItemId);
  if (idx === -1) {
    return { position: 0, total: openable.length, prev: null, next: null, inList: false };
  }
  return {
    position: idx + 1,
    total: openable.length,
    prev: openable[idx - 1] ?? null,
    next: openable[idx + 1] ?? null,
    inList: true,
  };
}

export function itemHref(setlistId: string, item: SetlistItem): string {
  return `/musicas/${item.songId}?tom=${keySlug(item.key)}&repertorio=${setlistId}&item=${item.id}`;
}
