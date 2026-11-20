import { useEffect, useState } from 'react';
import type { CatalogApi } from './catalogApi';

export interface LyricsState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  lyrics: ReadonlyMap<string, string>;
}

const EMPTY_LYRICS: ReadonlyMap<string, string> = new Map();

/** Assina `songLyrics` apenas enquanto `enabled`; fora disso fica `idle`. */
export function useLyrics(api: CatalogApi, enabled: boolean): LyricsState {
  const [state, setState] = useState<LyricsState>({
    status: enabled ? 'loading' : 'idle',
    lyrics: EMPTY_LYRICS,
  });
  const [subscription, setSubscription] = useState({ api, enabled });
  if (subscription.api !== api || subscription.enabled !== enabled) {
    // Ajusta o estado durante o render (sem setState no effect) ao trocar de assinatura.
    setSubscription({ api, enabled });
    setState((prev) => ({ status: enabled ? 'loading' : 'idle', lyrics: prev.lyrics }));
  }
  useEffect(() => {
    if (!enabled) return;
    return api.subscribeLyrics(
      (lyrics) => setState({ status: 'ready', lyrics }),
      () => setState((prev) => ({ status: 'error', lyrics: prev.lyrics })),
    );
  }, [api, enabled]);
  return state;
}
