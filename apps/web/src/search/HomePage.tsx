import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import {
  compareTitles,
  deriveArtists,
  filterArtists,
  filterSongs,
  splitHarpa,
} from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { NextCultoCard } from '../setlists/NextCultoCard';
import { todayLocal } from '../setlists/dates';
import type { SetlistApi } from '../setlists/setlistApi';
import { SetlistFormDialog } from '../setlists/SetlistFormDialog';
import { useSetlistsContext } from '../setlists/SetlistsProvider';
import { SetlistsTab } from '../setlists/SetlistsTab';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SearchInput } from '../ui/SearchInput';
import { dayEyebrow } from '../ui/screenDate';
import { ArtistList } from './ArtistList';
import { SongList } from './SongList';

const TABS = [
  { id: 'musicas', label: 'Músicas', placeholder: 'Buscar música ou cantor…' },
  { id: 'cantores', label: 'Cantores', placeholder: 'Buscar cantor…' },
  { id: 'harpa', label: 'Harpa', placeholder: 'Buscar na Harpa…' },
  { id: 'repertorios', label: 'Repertórios', placeholder: '' },
] as const;

const TAB_PATHS = {
  musicas: '/',
  cantores: '/?aba=cantores',
  harpa: '/?aba=harpa',
  repertorios: '/?aba=repertorios',
};

export function HomePage({ setlistApi }: { setlistApi: SetlistApi }) {
  const { role } = useAuth();
  const { status, songs } = useSongsContext();
  const { setlists, status: setlistsStatus } = useSetlistsContext();
  const [now] = useState(() => new Date());
  const today = todayLocal(now);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // One-time notice passed by navigation state (e.g. after deleting a song).
  const [notice] = useState(() => {
    const value = (location.state as { notice?: unknown } | null)?.notice;
    return typeof value === 'string' ? value : null;
  });
  const cleared = useRef(false);
  const { pathname, search } = location;
  useEffect(() => {
    // Drops the state so a reload or going back does not show the notice again.
    if (!notice || cleared.current) return;
    cleared.current = true;
    navigate(`${pathname}${search}`, { replace: true, state: null });
  }, [notice, navigate, pathname, search]);
  const query = params.get('q') ?? '';
  const abaParam = params.get('aba');
  const tab = TABS.find((t) => t.id === abaParam) ?? TABS[0];

  const { regular, harpa } = useMemo(() => splitHarpa(songs), [songs]);
  const artists = useMemo(() => deriveArtists(regular), [regular]);
  const visibleSongs = useMemo(
    () =>
      filterSongs(tab.id === 'harpa' ? harpa : regular, query).sort((a, b) =>
        compareTitles(a.titleNormalized, b.titleNormalized),
      ),
    [tab.id, harpa, regular, query],
  );
  const visibleArtists = useMemo(() => filterArtists(artists, query), [artists, query]);

  const setQuery = (value: string) => {
    const next: Record<string, string> = {};
    if (tab.id !== 'musicas') next.aba = tab.id;
    if (value) next.q = value;
    setParams(next, { replace: true });
  };

  const emptyText = query.trim()
    ? `Nada encontrado para “${query.trim()}”.`
    : 'Nenhuma cifra ainda.';
  const items = tab.id === 'cantores' ? visibleArtists : visibleSongs;

  const createSetlist = async (value: { date: string; label: string }): Promise<void> => {
    setCreateBusy(true);
    setCreateError(null);
    try {
      const id = await setlistApi.createSetlist({ ...value, items: [] });
      navigate(`/repertorios/${id}`);
    } catch {
      setCreateError('Não foi possível criar o repertório.');
      setCreateBusy(false);
    }
  };

  return (
    <section>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <ScreenHeader
        eyebrow={dayEyebrow(now)}
        title={tab.id === 'repertorios' ? 'Repertório' : tab.id === 'harpa' ? 'Harpa' : 'Músicas'}
      />
      {tab.id !== 'repertorios' && (
        <SearchInput
          aria-label={tab.placeholder}
          placeholder={tab.placeholder}
          value={query}
          onChange={setQuery}
        />
      )}
      {tab.id !== 'repertorios' && (
        <>
          <NextCultoCard setlists={setlists} today={today} now={now} />
          <nav aria-label="Seções" className="tabs">
            {TABS.filter((t) => t.id !== 'repertorios').map((t) => (
              <Link
                key={t.id}
                to={TAB_PATHS[t.id]}
                aria-current={t.id === tab.id ? 'page' : undefined}
                className="tab"
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </>
      )}
      {tab.id === 'repertorios' ? (
        <div>
          {setlistsStatus === 'loading' && (
            <p role="status" className="status">
              Carregando…
            </p>
          )}
          {setlistsStatus === 'error' && (
            <p role="alert" className="error">
              Não foi possível carregar os repertórios.
            </p>
          )}
          {setlistsStatus === 'ready' && (
            <SetlistsTab
              setlists={setlists}
              today={today}
              now={now}
              songs={status === 'ready' ? songs : undefined}
            />
          )}
        </div>
      ) : (
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
          {tab.id === 'cantores' ? (
            <ArtistList artists={visibleArtists} />
          ) : (
            <SongList songs={visibleSongs} />
          )}
        </div>
      )}
      {canEdit(role) &&
        (tab.id === 'repertorios' ? (
          <button
            type="button"
            className="fab"
            onClick={() => {
              setCreateError(null);
              setCreating(true);
            }}
          >
            ＋ Novo repertório
          </button>
        ) : (
          <Link to="/nova" className="fab">
            ＋ Nova cifra
          </Link>
        ))}
      {creating && (
        <SetlistFormDialog
          mode="create"
          busy={createBusy}
          error={createError}
          onSave={(value) => void createSetlist(value)}
          onCancel={() => setCreating(false)}
        />
      )}
    </section>
  );
}
