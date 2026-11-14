import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { CatalogApi } from '../catalog/catalogApi';
import { filterSongs } from '../catalog/search';
import { useSongs } from '../catalog/useSongs';
import { SongList } from './SongList';

export function ArtistPage({ api }: { api: CatalogApi }) {
  const { artistId } = useParams();
  const { status, songs } = useSongs(api);
  const [query, setQuery] = useState('');

  const artistSongs = useMemo(
    () =>
      songs
        .filter((s) => s.artistId === artistId)
        .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [songs, artistId],
  );
  const visible = useMemo(() => filterSongs(artistSongs, query), [artistSongs, query]);

  if (status === 'loading') return <p className="status">Carregando…</p>;
  const name = artistSongs[0]?.artistName;
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
      <input
        type="search"
        className="search"
        aria-label={label}
        placeholder={label}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {visible.length === 0 && <p className="status">Nada encontrado para “{query.trim()}”.</p>}
      <SongList songs={visible} />
    </section>
  );
}
