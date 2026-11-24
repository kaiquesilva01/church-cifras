import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { LyricsProvider } from '../catalog/LyricsProvider';
import { SongsProvider } from '../catalog/SongsProvider';
import { ArtistPage } from '../search/ArtistPage';
import { BuscaPage } from '../search/BuscaPage';
import { HomePage } from '../search/HomePage';
import { SetlistsProvider } from '../setlists/SetlistsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { authStateFor } from '../test/authState';
import { fakeSetlistApi } from '../test/fakeSetlistApi';
import { ViewerPage } from './ViewerPage';

vi.mock('./PdfPages', () => ({
  PdfPages: () => <div data-testid="pdf-pages" />,
}));

const songs = [
  makeSong({
    id: 'b1',
    title: 'Bênção',
    titleNormalized: 'bencao',
    artistId: 'aline',
    artistName: 'Aline Barros',
    keys: ['G', 'A'],
    handmadeKeys: ['G'],
  }),
  makeSong({
    id: 'g1',
    title: 'Graus',
    titleNormalized: 'graus',
    artistId: 'aline',
    artistName: 'Aline Barros',
    keys: ['D'],
    handmadeKeys: ['D'],
  }),
  makeSong({
    id: 'h1',
    title: '15 Hino',
    titleNormalized: '15 hino',
    artistId: 'harpa',
    artistName: 'Harpa',
    keys: ['C'],
    handmadeKeys: ['C'],
  }),
];

const api = fakeCatalogApi(songs);
const setlistApi = fakeSetlistApi([]);

const auth: AuthState = authStateFor('member');

function ViewerRoute() {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <ViewerPage
      api={api}
      songId={songId}
      tomSlug={params.get('tom')}
      openPdf={(() => Promise.resolve({ numPages: 1, destroy: vi.fn() })) as never}
      readLines={() => Promise.resolve([])}
    />
  );
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{`${pathname}${search}`}</output>;
}

/** The whole route tree: list, busca, singer and cifra, with the URL probe. */
function renderApp(initialEntries: string[], initialIndex = 0) {
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <SongsProvider api={api}>
          <LyricsProvider api={api}>
            <SetlistsProvider api={setlistApi}>
              <Where />
              <Routes>
                <Route path="/" element={<HomePage setlistApi={setlistApi} />} />
                <Route path="/busca" element={<BuscaPage />} />
                <Route path="/cantores/:artistId" element={<ArtistPage />} />
                <Route path="/musicas/:songId" element={<ViewerRoute />} />
              </Routes>
            </SetlistsProvider>
          </LyricsProvider>
        </SongsProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const where = () => screen.getByTestId('where').textContent;
const back = () => fireEvent.click(screen.getByRole('link', { name: 'Voltar' }));

describe('Voltar da cifra volta ao cenário anterior', () => {
  it('returns to the list with the same query', async () => {
    renderApp(['/?q=bencao']);
    fireEvent.click(screen.getByRole('link', { name: /^Bênção Aline/ }));
    await screen.findByRole('heading', { name: 'Bênção' });
    back();
    expect(where()).toBe('/?q=bencao');
    expect(screen.getByRole('searchbox')).toHaveValue('bencao');
  });

  it('returns to Busca with its query and filter', async () => {
    renderApp(['/busca?q=aline&tipo=musicas']);
    fireEvent.click(screen.getByRole('link', { name: /^Graus Aline/ }));
    await screen.findByRole('heading', { name: 'Graus' });
    back();
    expect(where()).toBe('/busca?q=aline&tipo=musicas');
    expect(screen.getByRole('searchbox')).toHaveValue('aline');
    expect(screen.getByRole('button', { name: 'Músicas' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('returns to the Harpa tab with its query', async () => {
    renderApp(['/?aba=harpa&q=hino']);
    fireEvent.click(screen.getByRole('link', { name: /^15 Hino Harpa/ }));
    await screen.findByRole('heading', { name: '15 Hino' });
    back();
    expect(where()).toBe('/?aba=harpa&q=hino');
    expect(screen.getByRole('searchbox')).toHaveValue('hino');
  });

  it('returns to the singer page with its search', async () => {
    renderApp(['/cantores/aline?q=graus', '/musicas/g1'], 1);
    await screen.findByRole('heading', { name: 'Graus' });
    back();
    expect(where()).toBe('/cantores/aline?q=graus');
    expect(screen.getByRole('searchbox')).toHaveValue('graus');
  });

  it('keeps the list when the key is changed before going back', async () => {
    renderApp(['/?q=bencao']);
    fireEvent.click(screen.getByRole('link', { name: /^Bênção Aline/ }));
    await screen.findByRole('heading', { name: 'Bênção' });
    fireEvent.click(screen.getByRole('link', { name: 'Bênção, tom A' }));
    await waitFor(() => expect(where()).toContain('tom=A'));
    back();
    expect(where()).toBe('/?q=bencao');
  });

  it('goes to the list when the cifra was opened directly', async () => {
    renderApp(['/musicas/b1?tom=g']);
    await screen.findByRole('heading', { name: 'Bênção' });
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
    back();
    expect(where()).toBe('/');
  });
});
