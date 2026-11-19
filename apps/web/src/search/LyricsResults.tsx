import { useMemo } from 'react';
import { normalizeText } from '@cifras/chords';
import { useLyricsContext } from '../catalog/LyricsProvider';
import { MIN_LYRICS_QUERY } from '../catalog/lyricsLimits';
import { searchLyrics, type LyricHit } from '../catalog/lyricsSearch';
import type { SongSummary } from '../catalog/types';
import { SongList } from './SongList';

export interface LyricSearch {
  hits: LyricHit[];
  /** The query has enough characters to search the lyrics. */
  active: boolean;
  /** Searching, but the lyrics have not arrived yet. */
  pending: boolean;
  /** The lyrics are ready or failed: no more results are expected. */
  settled: boolean;
}

/**
 * Searches the lyrics of `candidates` (not in `exclude`). `hits` stay empty until the lyrics are
 * ready, since the lyrics state can hold a stale map while it is idle or loading.
 */
export function useLyricSearch(
  candidates: SongSummary[],
  query: string,
  exclude: ReadonlySet<string>,
): LyricSearch {
  const { status, lyrics } = useLyricsContext();
  const active = normalizeText(query).length >= MIN_LYRICS_QUERY;
  const ready = status === 'ready';
  const hits = useMemo(
    () => (active && ready ? searchLyrics(candidates, lyrics, query, exclude) : []),
    [active, ready, candidates, lyrics, query, exclude],
  );
  return {
    hits,
    active,
    pending: active && (status === 'idle' || status === 'loading'),
    settled: status === 'ready' || status === 'error',
  };
}

function SkeletonCard() {
  return (
    <li className="list-card song-card lyric-skeleton-card" aria-hidden="true">
      <div className="lyric-skeleton-main">
        <span className="lyric-skeleton-tile" />
        <span className="lyric-skeleton-text">
          <span className="lyric-skeleton-bar" />
          <span className="lyric-skeleton-bar lyric-skeleton-short" />
        </span>
      </div>
      <div className="lyric-skeleton-snippet">
        <span className="lyric-skeleton-bar" />
        <span className="lyric-skeleton-bar lyric-skeleton-short" />
      </div>
    </li>
  );
}

/** The "Na letra" section: skeleton while the lyrics load, the matching songs with their snippets. */
export function LyricsResults({ hits, pending }: { hits: LyricHit[]; pending: boolean }) {
  const snippets = useMemo(() => new Map(hits.map((hit) => [hit.song.id, hit.snippet])), [hits]);
  if (pending) {
    return (
      <>
        <h2 className="section-title">Na letra</h2>
        <ul className="list" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
        </ul>
      </>
    );
  }
  if (hits.length === 0) return null;
  return (
    <>
      <div className="lyric-head">
        <h2 className="section-title">Na letra</h2>
        <span className="lyric-count">
          {hits.length === 1 ? '1 música' : `${hits.length} músicas`}
        </span>
      </div>
      <SongList songs={hits.map((hit) => hit.song)} snippets={snippets} />
    </>
  );
}
