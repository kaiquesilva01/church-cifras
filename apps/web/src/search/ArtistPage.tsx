import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { filterSongs } from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { SearchInput } from '../ui/SearchInput';
import { SongList } from './SongList';

export function ArtistPage() {
  const { artistId } = useParams();
  const { status, songs } = useSongsContext();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true });

  const artistSongs = useMemo(
    () =>
      songs
        .filter((s) => s.artistId === artistId)
        .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [songs, artistId],
  );
  const visible = useMemo(() => filterSongs(artistSongs, query), [artistSongs, query]);

  if (status === 'loading') {
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  }
  const name = artistSongs[0]?.artistName;
  if (!name && status === 'error') {
    return (
      <p role="alert" className="error">
        Não foi possível carregar as cifras.
      </p>
    );
  }
  if (!name) {
    return (
      <p className="status">
        Cantor não encontrado. <Link to="/?aba=cantores">Voltar</Link>
      </p>
    );
  }
  const label = `Filtrar músicas de ${name}…`;
  return (
    <section>
      <h2 className="page-title">
        <Link to="/?aba=cantores" className="back">
          ‹ {name}
        </Link>
      </h2>
      <p className="muted">
        {artistSongs.length === 1 ? '1 música' : `${artistSongs.length} músicas`}
      </p>
      <SearchInput aria-label={label} placeholder={label} value={query} onChange={setQuery} />
      {visible.length === 0 && <p className="status">Nada encontrado para “{query.trim()}”.</p>}
      <SongList songs={visible} />
    </section>
  );
}
