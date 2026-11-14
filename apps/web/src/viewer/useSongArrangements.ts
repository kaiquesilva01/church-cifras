import { compareKeys, keySlug, type KeyName } from '@cifras/chords';
import { useEffect, useMemo, useState } from 'react';
import type { CatalogApi } from '../catalog/catalogApi';
import type { ArrangementSummary } from '../catalog/types';

export interface ArrangementView {
  key: KeyName;
  slug: string;
  source: 'handmade' | 'generated';
  storagePath: string;
  derivedFromKey: KeyName | null;
  collisions: number;
}

export interface SongArrangements {
  status: 'idle' | 'loading' | 'ready' | 'error';
  arrangements: ArrangementView[];
}

type Loaded = { songId: string; list: ArrangementSummary[] | 'error' };

const toView = (a: ArrangementSummary): ArrangementView => ({
  key: a.key,
  slug: keySlug(a.key),
  source: a.source,
  storagePath: a.storagePath,
  derivedFromKey: a.derivedFromKey,
  collisions: a.collisions,
});

/** Subscribes only when there is an existing song (`songId` not null). */
export function useSongArrangements(api: CatalogApi, songId: string | null): SongArrangements {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!songId) return;
    return api.subscribeArrangements(
      songId,
      (list) => setLoaded({ songId, list }),
      () => setLoaded({ songId, list: 'error' }),
    );
  }, [api, songId]);

  const current = loaded && loaded.songId === songId ? loaded.list : null;
  return useMemo((): SongArrangements => {
    if (!songId) return { status: 'idle', arrangements: [] };
    if (current === null) return { status: 'loading', arrangements: [] };
    if (current === 'error') return { status: 'error', arrangements: [] };
    return {
      status: 'ready',
      arrangements: current.map(toView).sort((a, b) => compareKeys(a.key, b.key)),
    };
  }, [songId, current]);
}
