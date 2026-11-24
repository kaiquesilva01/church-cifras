import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState, type MinistryRole } from '../auth/useAuth';
import { authStateFor } from '../test/authState';
import type { SongSummary } from '../catalog/types';
import { SongsProvider } from '../catalog/SongsProvider';
import { LyricsProvider } from '../catalog/LyricsProvider';
import type { CatalogApi } from '../catalog/catalogApi';
import { SetlistsProvider } from '../setlists/SetlistsProvider';
import type { Setlist } from '../setlists/types';
import { fakeCatalogApi, makeSong, sampleSongs } from '../test/fakeCatalogApi';
import { fakeSetlistApi, makeSetlist, type FakeSetlistApi } from '../test/fakeSetlistApi';
import { HomePage } from './HomePage';
import { IPHONE_SAFARI } from '../test/installFixtures';
import { PushContext, type PushService } from '../push/types';
import { fakePushService } from '../test/fakePushService';

/** Lyrics for `sampleSongs` (s1 Sonda-me, s2 Ressuscita-me, s3 Grande é o Senhor). */
const LYRICS = {
  s1: 'Sonda-me, Senhor, e conhece o meu coração',
  s2: 'Ressuscita-me, Senhor, e levanta-me',
  s3: 'Grande é o Senhor, rei das nações',
};
const hymn = makeSong({
  id: 'h1',
  title: 'Hino de louvor',
  titleNormalized: 'hino de louvor',
  artistId: 'harpa',
  artistName: 'Harpa',
});
const songsWithHymn: SongSummary[] = [...sampleSongs, hymn];

/** Catalog overrides whose lyrics are ready with `map`. */
function lyricsReady(map: Record<string, string>): Partial<CatalogApi> {
  return {
    subscribeLyrics: (cb) => {
      cb(new Map(Object.entries(map)));
      return () => undefined;
    },
  };
}
/** Catalog overrides whose lyrics never arrive (the skeleton state). */
const lyricsPending: Partial<CatalogApi> = {
  subscribeLyrics: () => () => undefined,
};

function StateProbe() {
  const { state } = useLocation();
  return <output data-testid="state">{JSON.stringify(state)}</output>;
}

function PathProbe() {
  const { pathname } = useLocation();
  return <output data-testid="path">{pathname}</output>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

function renderHome(
  options: {
    /** Vínculo no ministério (padrão: membro). `null`: sem vínculo. */
    ministry?: MinistryRole | null;
    canUploadSong?: boolean;
    appAdmin?: boolean;
    /** Vínculo com o documento do ministério ainda carregando. */
    ministryPending?: boolean;
    path?: string;
    songs?: SongSummary[];
    state?: unknown;
    setlists?: Setlist[];
    setlistApi?: FakeSetlistApi;
    catalog?: Partial<CatalogApi>;
    push?: PushService;
  } = {},
) {
  const setlistApi = options.setlistApi ?? fakeSetlistApi(options.setlists);
  const catalogApi = fakeCatalogApi(options.songs, options.catalog);
  const base = authStateFor(options.ministry === undefined ? 'member' : options.ministry);
  const auth: AuthState = {
    ...base,
    appAdmin: options.appAdmin ?? false,
    canUploadSong: options.canUploadSong ?? base.canUploadSong,
    ministryPending: options.ministryPending ?? false,
  };
  return render(
    <AuthContext.Provider value={auth}>
      <PushContext.Provider value={options.push ?? null}>
        <MemoryRouter
          initialEntries={[
            options.state === undefined
              ? (options.path ?? '/')
              : { pathname: options.path ?? '/', state: options.state },
          ]}
        >
          <SongsProvider api={catalogApi}>
            <LyricsProvider api={catalogApi}>
              <SetlistsProvider api={setlistApi}>
                <HomePage setlistApi={setlistApi} />
                <StateProbe />
                <PathProbe />
              </SetlistsProvider>
            </LyricsProvider>
          </SongsProvider>
        </MemoryRouter>
      </PushContext.Provider>
    </AuthContext.Provider>,
  );
}

describe('HomePage', () => {
  it('shows the notice passed by navigation state once', async () => {
    renderHome({ state: { notice: 'Música apagada.' } });
    expect(screen.getByText('Música apagada.').closest('[role="status"]')).not.toBeNull();
  });

  it('clears the navigation state after showing the notice', async () => {
    renderHome({ state: { notice: 'Música apagada.' } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('null'));
    expect(screen.getByText('Música apagada.')).toBeInTheDocument();
  });

  it('shows no notice without navigation state', () => {
    renderHome();
    expect(screen.queryByText('Música apagada.')).not.toBeInTheDocument();
  });

  it('lists songs with key chips linking to the key', () => {
    renderHome();
    const row = screen.getByText('Sonda-me').closest('a')!;
    expect(row).toHaveAttribute('href', '/musicas/s1');
    expect(within(row).getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me, tom A' })).toHaveAttribute(
      'href',
      '/musicas/s1?tom=A',
    );
    expect(screen.getByRole('link', { name: 'Ressuscita-me, tom F#m' })).toHaveAttribute(
      'href',
      '/musicas/s2?tom=Fsm',
    );
  });

  it('lists songs sorted by normalized title', () => {
    renderHome();
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.song-title')?.textContent)
      .filter(Boolean);
    expect(titles).toEqual(['Grande é o Senhor', 'Ressuscita-me', 'Sonda-me']);
  });

  it('searches by artist', () => {
    renderHome();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }), {
      target: { value: 'adhemar' },
    });
    expect(screen.getByText('Grande é o Senhor')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
  });

  it('switches to Cantores tab and filters artists', () => {
    renderHome();
    expect(screen.getByRole('link', { name: 'Músicas' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Cantores' }));
    expect(screen.getByRole('link', { name: 'Cantores' })).toHaveAttribute('aria-current', 'page');
    const aline = screen.getByRole('link', { name: /Aline Barros/ });
    expect(aline).toHaveAttribute('href', '/cantores/aline-barros');
    expect(aline).toHaveTextContent('2 músicas');
    expect(screen.getByRole('link', { name: /Adhemar de Campos/ })).toHaveTextContent('1 música ›');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cantor…' }), {
      target: { value: 'aline' },
    });
    expect(screen.queryByText('Adhemar de Campos')).not.toBeInTheDocument();
  });

  it('opens the Cantores tab from the url', () => {
    renderHome({ path: '/?aba=cantores' });
    expect(screen.getByRole('link', { name: 'Cantores' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the search when navigating back', () => {
    renderHome({ path: '/?q=aline' });
    expect(screen.getByRole('searchbox')).toHaveValue('aline');
    expect(screen.queryByText('Grande é o Senhor')).not.toBeInTheDocument();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('clears the search when switching tabs', () => {
    renderHome({ path: '/?q=aline' });
    fireEvent.click(screen.getByRole('link', { name: 'Cantores' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('shows the error copy when loading fails', () => {
    const api = fakeCatalogApi([], {
      subscribeSongs: (_cb, onError) => {
        onError(new Error('x'));
        return () => undefined;
      },
    });
    render(
      <AuthContext.Provider value={authStateFor('member')}>
        <MemoryRouter>
          <SongsProvider api={api}>
            <LyricsProvider api={api}>
              <SetlistsProvider api={fakeSetlistApi()}>
                <HomePage setlistApi={fakeSetlistApi()} />
                <StateProbe />
              </SetlistsProvider>
            </LyricsProvider>
          </SongsProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as cifras.');
  });

  it('shows Nova cifra only with the canUploadSong claim', () => {
    const { unmount } = renderHome({ ministry: null });
    expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
    unmount();
    const member = renderHome({ ministry: 'member' });
    expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
    member.unmount();
    renderHome({ ministry: 'admin', canUploadSong: true });
    expect(screen.getByRole('link', { name: '＋ Nova cifra' })).toHaveAttribute('href', '/nova');
  });

  it('shows Nova cifra to the app admin without ministry when the claim allows upload', () => {
    renderHome({ ministry: null, appAdmin: true, canUploadSong: true });
    expect(screen.getByRole('link', { name: '＋ Nova cifra' })).toHaveAttribute('href', '/nova');
  });

  it('shows empty catalog message', () => {
    renderHome({ songs: [] });
    expect(screen.getByText('Nenhuma cifra ainda.')).toBeInTheDocument();
  });

  describe('letra nas abas', () => {
    it('Músicas tab shows a "Na letra" section for a lyric match', () => {
      renderHome({ path: '/?q=nações', catalog: lyricsReady(LYRICS) });
      expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
      expect(screen.getByText('nações').tagName).toBe('MARK');
      const card = screen.getByText('nações').closest('li')!;
      expect(within(card).getByText('Grande é o Senhor')).toBeInTheDocument();
    });

    it('does not repeat in "Na letra" a song already listed by title', () => {
      renderHome({ path: '/?q=sonda', catalog: lyricsReady(LYRICS) });
      expect(screen.getByText('Sonda-me')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('shows skeleton cards while lyrics load, with the title matches already visible', () => {
      const { container } = renderHome({ path: '/?q=senhor', catalog: lyricsPending });
      expect(screen.getByText('Grande é o Senhor')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
      expect(container.querySelectorAll('.lyric-skeleton-card')).toHaveLength(2);
    });

    it('does not show "Nada encontrado" while lyrics load; shows it when ready and nothing matched', () => {
      const { unmount } = renderHome({ path: '/?q=zzz', catalog: lyricsPending });
      expect(screen.queryByText('Nada encontrado para “zzz”.')).not.toBeInTheDocument();
      unmount();
      renderHome({ path: '/?q=zzz', catalog: lyricsReady({}) });
      expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
    });

    it('shows only "Na letra" when no title matches but a lyric does', () => {
      renderHome({ path: '/?q=nações', catalog: lyricsReady(LYRICS) });
      expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
    });

    it('Harpa tab shows a "Na letra" section for a hymn whose lyrics match', () => {
      renderHome({
        path: '/?aba=harpa&q=eternos',
        songs: songsWithHymn,
        catalog: lyricsReady({ h1: 'Hino de louvor, rei dos reis eternos' }),
      });
      expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
      expect(screen.getByText('eternos').tagName).toBe('MARK');
      expect(screen.getByText('Hino de louvor', { selector: '.song-title' })).toBeInTheDocument();
    });

    it('Harpa tab shows skeleton cards while lyrics load, with the title matches visible', () => {
      const { container } = renderHome({
        path: '/?aba=harpa&q=hino',
        songs: songsWithHymn,
        catalog: lyricsPending,
      });
      expect(screen.getByText('Hino de louvor')).toBeInTheDocument();
      expect(container.querySelectorAll('.lyric-skeleton-card')).toHaveLength(2);
      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
    });

    it('Harpa tab does not repeat a hymn already listed by title', () => {
      renderHome({
        path: '/?aba=harpa&q=hino',
        songs: songsWithHymn,
        catalog: lyricsReady({ h1: 'Hino de louvor, hino antigo' }),
      });
      expect(screen.getByText('Hino de louvor')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('Harpa tab shows "Nada encontrado" only when ready and nothing matched', () => {
      const { unmount } = renderHome({
        path: '/?aba=harpa&q=zzz',
        songs: songsWithHymn,
        catalog: lyricsPending,
      });
      expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
      unmount();
      renderHome({
        path: '/?aba=harpa&q=zzz',
        songs: songsWithHymn,
        catalog: lyricsReady({}),
      });
      expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
    });

    it('Cantores tab does not search lyrics', () => {
      renderHome({ path: '/?aba=cantores&q=nações', catalog: lyricsReady(LYRICS) });
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('Músicas tab does not search Harpa hymns by lyric', () => {
      renderHome({
        path: '/?q=reis',
        songs: songsWithHymn,
        catalog: lyricsReady({ h1: 'Hino de louvor, rei dos reis eternos' }),
      });
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('Harpa tab does not search regular songs by lyric', () => {
      renderHome({
        path: '/?aba=harpa&q=nações',
        songs: songsWithHymn,
        catalog: lyricsReady(LYRICS),
      });
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('lists the whole catalog and no "Na letra" when the search is empty', () => {
      renderHome({ catalog: lyricsReady(LYRICS) });
      expect(document.querySelectorAll('.song-title')).toHaveLength(3);
      expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    });

    it('names the search field of each tab', () => {
      const { unmount } = renderHome();
      expect(
        screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }),
      ).toHaveAttribute('placeholder', 'Buscar música, cantor ou letra…');
      unmount();
      const harpa = renderHome({ path: '/?aba=harpa' });
      expect(
        screen.getByRole('searchbox', { name: 'Buscar na Harpa ou na letra…' }),
      ).toHaveAttribute('placeholder', 'Buscar na Harpa ou na letra…');
      harpa.unmount();
      renderHome({ path: '/?aba=cantores' });
      expect(screen.getByRole('searchbox', { name: 'Buscar cantor…' })).toHaveAttribute(
        'placeholder',
        'Buscar cantor…',
      );
    });
  });

  describe('Repertórios', () => {
    it('opens the tab from the url without the search box', () => {
      renderHome({ path: '/?aba=repertorios' });
      expect(screen.getByRole('heading', { level: 1, name: 'Repertório' })).toBeInTheDocument();
      // The bottom bar owns this tab now: the Músicas/Cantores segment is not shown here.
      expect(screen.queryByRole('navigation', { name: 'Seções' })).not.toBeInTheDocument();
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum repertório ainda.')).toBeInTheDocument();
    });

    it('keeps the search box and the sections segment together in the sticky block', () => {
      for (const path of ['/', '/?aba=harpa', '/?aba=cantores']) {
        const { container, unmount } = renderHome({ path });
        const sticky = container.querySelector('.search-sticky');
        expect(sticky).not.toBeNull();
        expect(sticky).toContainElement(screen.getByRole('searchbox'));
        expect(sticky).toContainElement(screen.getByRole('navigation', { name: 'Seções' }));
        unmount();
      }
    });

    it('keeps the search box on the other tabs', () => {
      renderHome();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('shows the next-service card on the home tabs', () => {
      renderHome({ setlists: [makeSetlist({ id: 'a', date: '2026-11-22', label: 'Domingo' })] });
      expect(screen.getByText('Próximo culto')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Domingo · 22\/11/ })).toHaveAttribute(
        'href',
        '/repertorios/a',
      );
    });

    it('shows the next-service card on the Músicas tab only when a future setlist exists', () => {
      const { unmount } = renderHome({
        setlists: [makeSetlist({ id: 'a', date: '2026-11-22', label: 'Domingo' })],
      });
      expect(screen.getByText('Próximo culto')).toBeInTheDocument();
      unmount();
      const second = renderHome();
      expect(screen.queryByText('Próximo culto')).not.toBeInTheDocument();
      second.unmount();
      // The Repertório tab lists the setlists itself, so it has no extra card.
      renderHome({
        path: '/?aba=repertorios',
        setlists: [makeSetlist({ id: 'a', date: '2026-11-22', label: 'Domingo' })],
      });
      expect(screen.queryByText('Próximo culto')).not.toBeInTheDocument();
    });

    it('shows the right FAB per tab and role', () => {
      const { unmount } = renderHome({ ministry: 'admin', path: '/?aba=repertorios' });
      expect(screen.getByRole('button', { name: '＋ Novo repertório' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
      unmount();
      const second = renderHome({ ministry: 'admin', canUploadSong: true });
      expect(screen.getByRole('link', { name: '＋ Nova cifra' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Novo repertório/ })).not.toBeInTheDocument();
      second.unmount();
      // Membro vê os repertórios, mas não cria: só admin do ministério.
      const third = renderHome({ ministry: 'member', path: '/?aba=repertorios' });
      expect(screen.queryByRole('button', { name: /Novo repertório/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
      third.unmount();
      renderHome({ ministry: null, path: '/?aba=repertorios' });
      expect(screen.queryByRole('button', { name: /Novo repertório/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
    });

    it('hides the Repertórios tab from an app admin without ministry', () => {
      renderHome({ ministry: null, appAdmin: true, path: '/?aba=repertorios' });
      expect(screen.queryByRole('heading', { name: 'Repertório' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1, name: 'Músicas' })).toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });

    it('waits for the ministry before deciding on the Repertórios tab', () => {
      renderHome({ ministry: null, ministryPending: true, path: '/?aba=repertorios' });
      expect(screen.getByRole('heading', { level: 1, name: 'Repertório' })).toBeInTheDocument();
      expect(screen.getByText('Carregando…')).toHaveAttribute('role', 'status');
      expect(screen.queryByRole('button', { name: /Novo repertório/ })).not.toBeInTheDocument();
    });

    it('keeps the Repertórios tab for an app admin who is a member while the ministry loads', () => {
      renderHome({
        ministry: null,
        appAdmin: true,
        ministryPending: true,
        path: '/?aba=repertorios',
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Repertório' })).toBeInTheDocument();
      expect(screen.getByText('Carregando…')).toHaveAttribute('role', 'status');
    });

    it('shows the list for that app admin once the ministry resolves', () => {
      renderHome({
        ministry: 'admin',
        appAdmin: true,
        canUploadSong: true,
        path: '/?aba=repertorios',
      });
      expect(screen.getByRole('heading', { level: 1, name: 'Repertório' })).toBeInTheDocument();
      expect(screen.getByText('Nenhum repertório ainda.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '＋ Novo repertório' })).toBeInTheDocument();
    });

    it('creates a setlist and navigates to it', async () => {
      const setlistApi = fakeSetlistApi();
      renderHome({ ministry: 'admin', path: '/?aba=repertorios', setlistApi });
      fireEvent.click(screen.getByRole('button', { name: '＋ Novo repertório' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      await waitFor(() =>
        expect(screen.getByTestId('path')).toHaveTextContent('/repertorios/new-1'),
      );
      expect(setlistApi.createSetlist).toHaveBeenCalledWith({
        date: '2026-11-19',
        label: 'Quinta',
        items: [],
        rehearsalAt: null,
      });
    });

    it('shows an error and keeps the dialog when creating fails', async () => {
      const setlistApi = fakeSetlistApi([], {
        createSetlist: vi.fn(() => Promise.reject(new Error('boom'))),
      });
      renderHome({ ministry: 'admin', path: '/?aba=repertorios', setlistApi });
      fireEvent.click(screen.getByRole('button', { name: '＋ Novo repertório' }));
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Não foi possível criar o repertório.',
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('path')).toHaveTextContent('/');
      expect(screen.getByTestId('path')).not.toHaveTextContent('/repertorios');
    });

    it('closes the dialog on cancel', () => {
      renderHome({ ministry: 'admin', path: '/?aba=repertorios' });
      fireEvent.click(screen.getByRole('button', { name: '＋ Novo repertório' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('install card on the Músicas tab', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_SAFARI, configurable: true });
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    localStorage.clear();
  });

  it('shows on Músicas (iPhone Safari case)', () => {
    renderHome({ path: '/' });
    expect(screen.getByRole('region', { name: 'Cifras como app' })).toBeInTheDocument();
  });

  it('is not shown on the other tabs', () => {
    renderHome({ path: '/?aba=cantores' });
    expect(screen.queryByRole('region', { name: 'Cifras como app' })).not.toBeInTheDocument();
  });
});

describe('avisos card on the Músicas tab', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === '(display-mode: standalone)' }),
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    localStorage.clear();
  });

  it('aparece na Músicas para membro, no app instalado, com o estado disponível', async () => {
    renderHome({ ministry: 'member', path: '/', push: fakePushService() });
    expect(await screen.findByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cifras como app' })).not.toBeInTheDocument();
  });

  it('não aparece nas outras abas', async () => {
    const service = fakePushService();
    renderHome({ ministry: 'member', path: '/?aba=cantores', push: service });
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    expect(service.load).not.toHaveBeenCalled();
  });

  it('não aparece para visitante', async () => {
    const service = fakePushService();
    renderHome({ ministry: null, path: '/', push: service });
    expect(screen.queryByRole('region', { name: 'Ative os avisos' })).not.toBeInTheDocument();
    expect(service.load).not.toHaveBeenCalled();
  });
});
