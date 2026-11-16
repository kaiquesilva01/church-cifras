import type { KeyName } from '@cifras/chords';
import type { SongSummary } from '../catalog/types';
import type { SetlistItem } from './types';

export function newItemId(): string {
  return crypto.randomUUID();
}

export function copyItems(items: SetlistItem[]): SetlistItem[] {
  return items.map((item) => ({ ...item, id: newItemId() }));
}

export function defaultKeyFor(song: SongSummary): KeyName | null {
  return song.handmadeKeys[0] ?? song.keys[0] ?? null;
}
