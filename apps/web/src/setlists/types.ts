import type { KeyName } from '@cifras/chords';

export interface SetlistItem {
  id: string;
  songId: string;
  key: KeyName;
}

export type SetlistOrigin = 'producao' | 'teste';

export interface Setlist {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  label: string;
  items: SetlistItem[];
  expiresAt: Date;
  /** `null` enquanto o timestamp do servidor está pendente. */
  createdAt: Date | null;
  /** Hora do ensaio como instante absoluto (dia e hora saem em UTC-3). Ausente sem ensaio ou em repertório antigo. */
  rehearsalAt?: Date;
  /** Site que criou o repertório. Ausente em repertório antigo. */
  origin?: SetlistOrigin;
}

export type SetlistOp =
  | { type: 'add'; item: SetlistItem }
  | { type: 'remove'; itemId: string }
  | { type: 'move'; itemId: string; afterItemId: string | null }
  | { type: 'setKey'; itemId: string; key: KeyName };

export const MAX_ITEMS = 40;
export const LABEL_MAX = 60;
export const TTL_DAYS = 30;
