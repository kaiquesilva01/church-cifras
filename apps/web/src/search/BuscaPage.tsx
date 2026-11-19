import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  compareTitles,
  deriveArtists,
  filterArtists,
  filterSongs,
  splitHarpa,
} from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { ArtistList } from './ArtistList';
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

  const { regular, harpa } = useMemo(() => splitHarpa(songs), [songs]);
  const artists = useMemo(() => filterArtists(deriveArtists(regular), query), [regular, query]);
  const matches = useMemo(
    () =>
      filterSongs(regular, query).sort((a, b) =>
        compareTitles(a.titleNormalized, b.titleNormalized),
      ),
    [regular, query],
  );
  const harpaMatches = useMemo(
    () =>
      filterSongs(harpa, query).sort((a, b) => compareTitles(a.titleNormalized, b.titleNormalized)),
    [harpa, query],
  );
  const showArtists = filter === 'Tudo' || filter === 'Cantores';
  const showSongs = filter === 'Tudo' || filter === 'Músicas';
  const showHarpa = filter === 'Tudo' || filter === 'Harpa';
  const nothing =
    trimmed !== '' &&
    status === 'ready' &&
    (!showArtists || artists.length === 0) &&
    (!showSongs || matches.length === 0) &&
    (!showHarpa || harpaMatches.length === 0);

  return (
    <section>
      <ScreenHeader eyebrow="Encontrar" title="Busca" />
      <input
        type="search"
        className="search"
        aria-label="Buscar música ou cantor"
        placeholder="Buscar música ou cantor…"
        value={query}
        onChange={(e) => update({ q: e.target.value })}
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
    </section>
  );
}
