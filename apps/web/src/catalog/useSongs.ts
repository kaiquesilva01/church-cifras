import { useEffect, useState } from 'react';
import type { CatalogApi } from './catalogApi';
import type { SongSummary } from './types';

export interface SongsState {
  status: 'loading' | 'ready' | 'error';
  songs: SongSummary[];
}

export function useSongs(api: CatalogApi): SongsState {
  const [state, setState] = useState<SongsState>({ status: 'loading', songs: [] });
  useEffect(
    () =>
      api.subscribeSongs(
        (songs) => setState({ status: 'ready', songs }),
        () => setState((prev) => ({ status: 'error', songs: prev.songs })),
      ),
    [api],
  );
  return state;
}
