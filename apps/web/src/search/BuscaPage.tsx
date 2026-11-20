import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { deriveArtists, filterArtists, searchSongSections, splitHarpa } from '../catalog/search';
import type { SongSummary } from '../catalog/types';
import { useSongsContext } from '../catalog/SongsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SearchInput } from '../ui/SearchInput';
import { ArtistList } from './ArtistList';
import { LyricsResults, useLyricSearch } from './LyricsResults';
import { SongList } from './SongList';

const FILTERS = ['Tudo', 'Músicas', 'Cantores', 'Harpa'] as const;
type Filter = (typeof FILTERS)[number];
/** `?tipo=` in the url, so the filtered view survives back/reload and can be shared. */
const TIPO: Record<Filter, string | null> = {
  Tudo: null,
  Músicas: 'musicas',
  Cantores: 'cantores',
  Harpa: 'harpa',
};

/** Global search: singers, songs and Harpa hymns together, with a filter for one of them. */
export function BuscaPage() {
  const { status, songs } = useSongsContext();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const filter: Filter = FILTERS.find((name) => TIPO[name] === params.get('tipo')) ?? 'Tudo';
  const update = (next: { q?: string; tipo?: string | null }): void => {
    const q = next.q ?? query;
    const tipo = next.tipo === undefined ? params.get('tipo') : next.tipo;
    const out: Record<string, string> = {};
    if (q) out.q = q;
    if (tipo) out.tipo = tipo;
    setParams(out, { replace: true });
  };
  const trimmed = query.trim();

  const artists = useMemo(
    () => filterArtists(deriveArtists(splitHarpa(songs).regular), query),
    [songs, query],
  );
  const { musicas: matches, harpa: harpaMatches } = useMemo(
    () => searchSongSections(songs, query),
    [songs, query],
  );
  const showArtists = filter === 'Tudo' || filter === 'Cantores';
  const showSongs = filter === 'Tudo' || filter === 'Músicas';
  const showHarpa = filter === 'Tudo' || filter === 'Harpa';
  // "Na letra" searches the songs of the chosen filter, except songs already listed by title.
  const showLyrics = filter !== 'Cantores';
  const lyricCandidates = useMemo<SongSummary[]>(() => {
    if (filter === 'Cantores') return [];
    if (filter === 'Músicas') return splitHarpa(songs).regular;
    if (filter === 'Harpa') return splitHarpa(songs).harpa;
    return songs;
  }, [songs, filter]);
  const listedByTitle = useMemo(
    () => new Set([...matches, ...harpaMatches].map((song) => song.id)),
    [matches, harpaMatches],
  );
  const lyricSearch = useLyricSearch(lyricCandidates, query, listedByTitle);
  // The lyrics only load once the songs are ready, so without them "Na letra" must not show up
  // (it would be an endless skeleton next to the songs error).
  const songsReady = status === 'ready';
  const lyricsPending = showLyrics && lyricSearch.pending;
  const nothing =
    trimmed !== '' &&
    songsReady &&
    (!showArtists || artists.length === 0) &&
    (!showSongs || matches.length === 0) &&
    (!showHarpa || harpaMatches.length === 0) &&
    lyricSearch.hits.length === 0 &&
    !lyricsPending;

  return (
    <section>
      <ScreenHeader eyebrow="Encontrar" title="Busca" />
      <div className="search-sticky">
        <SearchInput
          aria-label="Buscar música, cantor ou letra…"
          placeholder="Buscar música, cantor ou letra…"
          value={query}
          onChange={(value) => update({ q: value })}
        />
        <div className="filter-row" role="group" aria-label="Filtrar resultados">
          {FILTERS.map((name) => (
            <button
              key={name}
              type="button"
              className="filter-chip"
              aria-pressed={filter === name}
              onClick={() => update({ tipo: TIPO[name] })}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
      {status === 'loading' && (
        <p role="status" className="status">
          Carregando…
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="error">
          Não foi possível carregar as cifras.
        </p>
      )}
      {trimmed === '' && status === 'ready' && (
        <p className="status">Digite para buscar uma música ou um cantor.</p>
      )}
      {nothing && <p className="status">Nada encontrado para “{trimmed}”.</p>}
      {trimmed !== '' && showArtists && artists.length > 0 && (
        <>
          <h2 className="section-title">Cantores</h2>
          <ArtistList artists={artists} />
        </>
      )}
      {trimmed !== '' && showSongs && matches.length > 0 && (
        <>
          <h2 className="section-title">Músicas</h2>
          <SongList songs={matches} />
        </>
      )}
      {trimmed !== '' && showHarpa && harpaMatches.length > 0 && (
        <>
          <h2 className="section-title">Harpa</h2>
          <SongList songs={harpaMatches} />
        </>
      )}
      {trimmed !== '' && songsReady && showLyrics && (
        <LyricsResults hits={lyricSearch.hits} pending={lyricSearch.pending} />
      )}
    </section>
  );
}
