import { sameContent } from './selectors';
import type { Setlist } from './types';

export interface SetlistSnapshot {
  setlist: Setlist | null;
  fromCache: boolean;
}

export interface SyncState {
  phase: 'loading' | 'ready' | 'not-found';
  /** Último estado conhecido do servidor/cache. */
  latest: Setlist | null;
  /** O que a tela mostra. */
  shown: Setlist | null;
  /** `true` após o primeiro snapshot que não veio só do cache. */
  synced: boolean;
}

export type SyncEvent =
  | { type: 'snapshot'; snap: SetlistSnapshot }
  | { type: 'accept' }
  | { type: 'adopt'; setlist: Setlist }
  | { type: 'optimistic'; setlist: Setlist };

export const initialSync: SyncState = {
  phase: 'loading',
  latest: null,
  shown: null,
  synced: false,
};

export function syncReducer(state: SyncState, event: SyncEvent): SyncState {
  switch (event.type) {
    case 'snapshot': {
      const { setlist, fromCache } = event.snap;
      if (setlist === null) {
        // Cache vazio não prova inexistência.
        if (fromCache) return state;
        if (state.shown === null) {
          return { phase: 'not-found', latest: null, shown: null, synced: true };
        }
        return { ...state, phase: 'ready', latest: null, synced: true };
      }
      const synced = state.synced || !fromCache;
      // `shown` acompanha `latest` até o primeiro snapshot do servidor (inclusive ele).
      const follow = !state.synced;
      return {
        phase: 'ready',
        latest: setlist,
        shown: follow ? setlist : state.shown,
        synced,
      };
    }
    case 'accept':
      if (state.latest === null) return state;
      return { ...state, shown: state.latest };
    case 'adopt':
      return { ...state, phase: 'ready', latest: event.setlist, shown: event.setlist };
    case 'optimistic':
      return { ...state, phase: 'ready', shown: event.setlist };
  }
}

export function hasChanges(state: SyncState): boolean {
  return state.latest !== null && !sameContent(state.shown, state.latest);
}

/** O repertório foi apagado depois de carregado. */
export function isRemoved(state: SyncState): boolean {
  return state.synced && state.phase === 'ready' && state.latest === null && state.shown !== null;
}
