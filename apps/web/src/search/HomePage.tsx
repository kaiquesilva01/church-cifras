import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { CatalogApi } from '../catalog/catalogApi';
import { deriveArtists, filterArtists, filterSongs } from '../catalog/search';
import { useSongs } from '../catalog/useSongs';
import { SongList } from './SongList';

const TABS = [
  { id: 'musicas', label: 'Músicas', placeholder: 'Buscar música ou cantor…' },
  { id: 'cantores', label: 'Cantores', placeholder: 'Buscar cantor…' },
] as const;

export function HomePage({ api }: { api: CatalogApi }) {
  const { role } = useAuth();
  const { status, songs } = useSongs(api);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const tab = params.get('aba') === 'cantores' ? TABS[1] : TABS[0];

  const artists = useMemo(() => deriveArtists(songs), [songs]);
  const visibleSongs = useMemo(() => filterSongs(songs, query), [songs, query]);
  const visibleArtists = useMemo(() => filterArtists(artists, query), [artists, query]);

  const selectTab = (id: string) => {
    setParams(id === 'cantores' ? { aba: 'cantores' } : {}, { replace: true });
    setQuery('');
  };

  const emptyText = query.trim()
    ? `Nada encontrado para “${query.trim()}”.`
    : 'Nenhuma cifra ainda.';
  const items = tab.id === 'musicas' ? visibleSongs : visibleArtists;

  return (
    <section>
      <input
        type="search"
        className="search"
        aria-label={tab.placeholder}
        placeholder={tab.placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div role="tablist" aria-label="Seções" className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === tab.id}
            aria-controls="tabpanel"
            className="tab"
            onClick={() => selectTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab.id}`}>
        {status === 'loading' && <p className="status">Carregando…</p>}
        {status === 'error' && (
          <p role="alert" className="error">
            Não foi possível carregar as cifras.
          </p>
        )}
        {status === 'ready' && items.length === 0 && <p className="status">{emptyText}</p>}
        {tab.id === 'musicas' ? (
          <SongList songs={visibleSongs} />
        ) : (
          <ul className="list">
            {visibleArtists.map((artist) => (
              <li key={artist.id} className="list-card">
                <Link to={`/cantores/${artist.id}`} className="list-main artist-row">
                  <span className="avatar avatar-lg" aria-hidden="true">
                    {artist.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="song-title">{artist.name}</span>
                  <span className="muted">
                    {artist.songCount === 1 ? '1 música' : `${artist.songCount} músicas`} ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canEdit(role) && (
        <Link to="/nova" className="fab">
          ＋ Nova cifra
        </Link>
      )}
    </section>
  );
}
