import { createContext, useContext } from 'react';
import type { Setlist, SetlistOp } from './types';

export interface ActiveSetlist {
  id: string;
  status: 'loading' | 'ready' | 'not-found' | 'error';
  shown: Setlist | null;
  latest: Setlist | null;
  hasChanges: boolean;
  removed: boolean;
  accept(): void;
  edit(op: SetlistOp): Promise<'ok' | 'noop' | 'full' | 'gone' | 'error'>;
}

export const ActiveSetlistContext = createContext<ActiveSetlist | null>(null);

/** `null` fora do provider ou quando não há repertório ativo. */
export function useActiveSetlist(): ActiveSetlist | null {
  return useContext(ActiveSetlistContext);
}
