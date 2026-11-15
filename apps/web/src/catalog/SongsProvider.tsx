import { createContext, useContext, type ReactNode } from 'react';
import type { CatalogApi } from './catalogApi';
import { useSongs, type SongsState } from './useSongs';

const SongsContext = createContext<SongsState | null>(null);

/** Uma única assinatura de `songs` compartilhada por todas as telas. */
export function SongsProvider({ api, children }: { api: CatalogApi; children: ReactNode }) {
  const state = useSongs(api);
  return <SongsContext.Provider value={state}>{children}</SongsContext.Provider>;
}

export function useSongsContext(): SongsState {
  const state = useContext(SongsContext);
  if (!state) throw new Error('useSongsContext precisa estar dentro de SongsProvider');
  return state;
}
