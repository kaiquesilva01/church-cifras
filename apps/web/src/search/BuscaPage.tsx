import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { deriveArtists, filterArtists, filterSongs } from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ArtistList } from './ArtistList';
import { SongList } from './SongList';

const FILTERS = ['Tudo', 'Músicas', 'Cantores'] as const;
type Filter = (typeof FILTERS)[number];

/** Global search: singers and songs together, with a filter for one of them. */
export function BuscaPage() {
  const { status, songs } = useSongsContext();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('Tudo');
  const query = params.get('q') ?? '';
  const trimmed = query.trim();

  const artists = useMemo(() => filterArtists(deriveArtists(songs), query), [songs, query]);
  const matches = useMemo(
    () =>
      filterSongs(songs, query).sort((a, b) =>
        a.titleNormalized.localeCompare(b.titleNormalized, 'pt-BR'),
      ),
    [songs, query],
  );
  const showArtists = filter !== 'Músicas';
  const showSongs = filter !== 'Cantores';
  const nothing =
    trimmed !== '' &&
    status === 'ready' &&
    (!showArtists || artists.length === 0) &&
    (!showSongs || matches.length === 0);

  return (
    <section>
      <ScreenHeader eyebrow="Encontrar" title="Busca" />
      <input
        type="search"
        className="search"
        aria-label="Buscar música ou cantor"
        placeholder="Buscar música ou cantor…"
        value={query}
        onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
      />
      <div className="filter-row" role="group" aria-label="Filtrar resultados">
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            className="filter-chip"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
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
    </section>
  );
}
