import { createContext, useContext, type ReactNode } from 'react';
import type { CatalogApi } from './catalogApi';
import { useLyrics, type LyricsState } from './useLyrics';
import { useSongsContext } from './SongsProvider';

const LyricsContext = createContext<LyricsState | null>(null);

/** Assina as letras só depois que `songs` está pronto, para não atrasar a abertura do app. */
export function LyricsProvider({ api, children }: { api: CatalogApi; children: ReactNode }) {
  const { status } = useSongsContext();
  const state = useLyrics(api, status === 'ready');
  return <LyricsContext.Provider value={state}>{children}</LyricsContext.Provider>;
}

export function useLyricsContext(): LyricsState {
  const state = useContext(LyricsContext);
  if (!state) throw new Error('useLyricsContext precisa estar dentro de LyricsProvider');
  return state;
}
