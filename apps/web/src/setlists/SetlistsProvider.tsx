import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SetlistApi } from './setlistApi';
import type { Setlist } from './types';

export interface SetlistsState {
  status: 'loading' | 'ready' | 'error';
  setlists: Setlist[];
}

const SetlistsContext = createContext<SetlistsState | null>(null);

/** Uma única assinatura da lista de repertórios compartilhada por todas as telas. */
export function SetlistsProvider({ api, children }: { api: SetlistApi; children: ReactNode }) {
  const [state, setState] = useState<SetlistsState>({ status: 'loading', setlists: [] });

  useEffect(() => {
    return api.subscribeSetlists(
      (setlists) => setState({ status: 'ready', setlists }),
      () => setState((prev) => ({ ...prev, status: 'error' })),
    );
  }, [api]);

  const value = useMemo(() => state, [state]);
  return <SetlistsContext.Provider value={value}>{children}</SetlistsContext.Provider>;
}

export function useSetlistsContext(): SetlistsState {
  const state = useContext(SetlistsContext);
  if (!state) throw new Error('useSetlistsContext precisa estar dentro de SetlistsProvider');
  return state;
}
