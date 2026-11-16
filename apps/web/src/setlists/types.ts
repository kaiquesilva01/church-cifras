import type { KeyName } from '@cifras/chords';

export interface SetlistItem {
  id: string;
  songId: string;
  key: KeyName;
}

export interface Setlist {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  label: string;
  items: SetlistItem[];
  expiresAt: Date;
  /** `null` enquanto o timestamp do servidor está pendente. */
  createdAt: Date | null;
}

export type SetlistOp =
  | { type: 'add'; item: SetlistItem }
  | { type: 'remove'; itemId: string }
  | { type: 'move'; itemId: string; afterItemId: string | null }
  | { type: 'setKey'; itemId: string; key: KeyName };

export const MAX_ITEMS = 40;
export const LABEL_MAX = 60;
export const TTL_DAYS = 30;
