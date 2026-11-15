import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { deriveArtists, filterArtists, filterSongs } from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { SongList } from './SongList';

const TABS = [
  { id: 'musicas', label: 'Músicas', placeholder: 'Buscar música ou cantor…' },
  { id: 'cantores', label: 'Cantores', placeholder: 'Buscar cantor…' },
] as const;

export function HomePage() {
  const { role } = useAuth();
  const { status, songs } = useSongsContext();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // One-time notice passed by navigation state (e.g. after deleting a song).
  const [notice] = useState(() => {
    const value = (location.state as { notice?: unknown } | null)?.notice;
    return typeof value === 'string' ? value : null;
  });
  useEffect(() => {
    if (notice) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // Runs once on arrival: drops the state so a reload or back does not show it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const query = params.get('q') ?? '';
  const tab = params.get('aba') === 'cantores' ? TABS[1] : TABS[0];

  const artists = useMemo(() => deriveArtists(songs), [songs]);
  const visibleSongs = useMemo(
    () =>
      filterSongs(songs, query).sort((a, b) =>
        a.titleNormalized.localeCompare(b.titleNormalized, 'pt-BR'),
      ),
    [songs, query],
  );
  const visibleArtists = useMemo(() => filterArtists(artists, query), [artists, query]);

  const setQuery = (value: string) => {
    const next: Record<string, string> = {};
    if (tab.id === 'cantores') next.aba = 'cantores';
    if (value) next.q = value;
    setParams(next, { replace: true });
  };

  const emptyText = query.trim()
    ? `Nada encontrado para “${query.trim()}”.`
    : 'Nenhuma cifra ainda.';
  const items = tab.id === 'musicas' ? visibleSongs : visibleArtists;

  return (
    <section>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <input
        type="search"
        className="search"
        aria-label={tab.placeholder}
        placeholder={tab.placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <nav aria-label="Seções" className="tabs">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.id === 'cantores' ? '/?aba=cantores' : '/'}
            aria-current={t.id === tab.id ? 'page' : undefined}
            className="tab"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div>
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
