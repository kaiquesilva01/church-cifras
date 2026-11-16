import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { ActiveSetlistProvider } from '../setlists/ActiveSetlistProvider';
import type { SetlistItem } from '../setlists/types';
import { ViewerPage } from './ViewerPage';

vi.mock('./PdfPages', () => ({
  PdfPages: () => <div data-testid="pdf-pages" />,
}));

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ia: SetlistItem = { id: 'a', songId: 's1', key: 'G' };
const ix: SetlistItem = { id: 'x', songId: 'gone', key: 'C' };
const ib: SetlistItem = { id: 'b', songId: 's2', key: 'F#m' };
const ic: SetlistItem = { id: 'c', songId: 's3', key: 'D' };

function Probe() {
  const where = useLocation();
  return <output data-testid="location">{`${where.pathname}${where.search}`}</output>;
}

function Page({ api }: { api: ReturnType<typeof fakeCatalogApi> }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <ViewerPage
      api={api}
      songId={songId}
      tomSlug={params.get('tom')}
      setlistId={params.get('repertorio')}
      itemId={params.get('item')}
      openPdf={vi.fn(() => Promise.resolve({ numPages: 1, destroy: vi.fn() })) as never}
      readLines={() => Promise.resolve([])}
    />
  );
}

function setup(
  path: string,
  items: SetlistItem[] = [ia, ix, ib, ic],
  { role = 'member' }: { role?: Role } = {},
) {
  const api = fakeCatalogApi(sampleSongs, {
    deleteArrangement: vi.fn(() => Promise.resolve()),
    getArrangement: vi.fn((songId: string, key: string) =>
      Promise.resolve({
        source: 'handmade' as const,
        storagePath: `songs/${songId}/${key}-abc.pdf`,
      }),
    ),
  });
  const setlistApi = fakeSetlistApi([makeSetlist({ id: 'r1', items })]);
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
        <ActiveSetlistProvider api={setlistApi}>
          <Routes>
            <Route
              path="/musicas/:songId"
              element={
                <SongsProvider api={api}>
                  <Page api={api} />
                </SongsProvider>
              }
            />
            <Route path="/repertorios/:id" element={<p>lista</p>} />
            <Route path="/" element={<p>home</p>} />
          </Routes>
        </ActiveSetlistProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { api, setlistApi };
}

const where = () => screen.getByTestId('location').textContent;
const setlistOf = (items: SetlistItem[]) => makeSetlist({ id: 'r1', items });

describe('ViewerPage in a setlist', () => {
  it('without setlist context nothing is added', async () => {
    setup('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('navigation', { name: 'Repertório' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
  });

  it('shows the bar and the header back link goes to the setlist', async () => {
    setup('/musicas/s2?tom=Fsm&repertorio=r1&item=b');
    await screen.findByTestId('pdf-pages');
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/repertorios/r1');
  });

  it('Anterior and Próxima replace-navigate, skipping removed songs', async () => {
    setup('/musicas/s1?tom=G&repertorio=r1&item=a');
    await screen.findByTestId('pdf-pages');
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(where()).toBe('/musicas/s2?tom=Fsm&repertorio=r1&item=b');
    await screen.findByText('2 de 3');
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(where()).toBe('/musicas/s3?tom=D&repertorio=r1&item=c');
    await screen.findByText('3 de 3');
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled();
  });

  it('visitors see the bar', async () => {
    setup('/musicas/s2?tom=Fsm&repertorio=r1&item=b', undefined, { role: 'viewer' });
    await screen.findByTestId('pdf-pages');
    expect(screen.getByText('2 de 3')).toBeInTheDocument();
  });

  describe('switching the tom from the cifra', () => {
    it('keeps the params and reminds the setlist tom, with a way back', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a');
      await screen.findByTestId('pdf-pages');
      expect(screen.queryByText(/Tom do repertório/)).toBeNull();
      fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
      expect(where()).toBe('/musicas/s1?tom=A&repertorio=r1&item=a');
      expect(screen.getByText('1 de 3')).toBeInTheDocument();
      expect(screen.getByText(/Tom do repertório: G/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('link', { name: 'Voltar ao G' }));
      expect(where()).toBe('/musicas/s1?tom=G&repertorio=r1&item=a');
      expect(screen.queryByText(/Tom do repertório/)).toBeNull();
    });

    it('deleting the open key keeps the params', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, { role: 'admin' });
      fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apagar tom G' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar tom' }));
      await waitFor(() => expect(where()).toBe('/musicas/s1?tom=A&repertorio=r1&item=a'));
    });
  });

  it('warns when the item key no longer exists, naming both keys', async () => {
    setup('/musicas/s1?tom=Bb&repertorio=r1&item=a', [{ ...ia, key: 'Bb' }]);
    await screen.findByTestId('pdf-pages');
    expect(
      screen.getByText('O tom Bb deste louvor não existe mais; abrimos o G.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tom do repertório/)).toBeNull();
  });

  describe('changes by someone else', () => {
    it('shows the banner without changing the PDF; Atualizar follows a changed tom', async () => {
      const { api, setlistApi } = setup('/musicas/s1?tom=G&repertorio=r1&item=a', [ia, ib]);
      await screen.findByTestId('pdf-pages');
      const calls = vi.mocked(api.getPdfBytes).mock.calls.length;
      act(() =>
        setlistApi.push('r1', {
          setlist: setlistOf([{ ...ia, key: 'A' }, ib]),
          fromCache: false,
        }),
      );
      expect(screen.getByText('O tom deste louvor mudou para A')).toBeInTheDocument();
      expect(where()).toBe('/musicas/s1?tom=G&repertorio=r1&item=a');
      expect(vi.mocked(api.getPdfBytes).mock.calls.length).toBe(calls);
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
      expect(where()).toBe('/musicas/s1?tom=A&repertorio=r1&item=a');
      expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    });

    it('Atualizar does not navigate when the open item kept its tom', async () => {
      const { setlistApi } = setup('/musicas/s1?tom=A&repertorio=r1&item=a', [ia, ib]);
      await screen.findByTestId('pdf-pages');
      act(() => setlistApi.push('r1', { setlist: setlistOf([ia, ib, ic]), fromCache: false }));
      expect(screen.getByText('O repertório foi alterado.')).toBeInTheDocument();
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
      expect(where()).toBe('/musicas/s1?tom=A&repertorio=r1&item=a');
      expect(screen.getByText('1 de 3')).toBeInTheDocument();
    });

    it('item removed: the cifra stays and the bar says Fora do repertório', async () => {
      const { setlistApi } = setup('/musicas/s1?tom=G&repertorio=r1&item=a', [ia, ib]);
      await screen.findByTestId('pdf-pages');
      act(() => setlistApi.push('r1', { setlist: setlistOf([ib]), fromCache: false }));
      fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
      expect(where()).toBe('/musicas/s1?tom=G&repertorio=r1&item=a');
      expect(screen.getByTestId('pdf-pages')).toBeInTheDocument();
      expect(screen.getByText('Fora do repertório')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar ao repertório' })).toHaveAttribute(
        'href',
        '/repertorios/r1',
      );
    });

    it('setlist removed: the cifra stays with a banner linking to the tab', async () => {
      const { setlistApi } = setup('/musicas/s1?tom=G&repertorio=r1&item=a', [ia, ib]);
      await screen.findByTestId('pdf-pages');
      act(() => setlistApi.push('r1', { setlist: null, fromCache: false }));
      expect(screen.getByText('Este repertório foi removido.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /repertórios/i })).toHaveAttribute(
        'href',
        '/?aba=repertorios',
      );
      expect(screen.getByTestId('pdf-pages')).toBeInTheDocument();
      expect(screen.getByText('1 de 2')).toBeInTheDocument();
    });
  });

  describe('next cifra preload', () => {
    it('fetches the next item only after the current one is on screen', async () => {
      const { api } = setup('/musicas/s1?tom=G&repertorio=r1&item=a', [ia, ib]);
      expect(api.getPdfBytes).toHaveBeenCalledTimes(1);
      await screen.findByTestId('pdf-pages');
      await waitFor(() => expect(api.getArrangement).toHaveBeenCalledWith('s2', 'F#m'));
      await waitFor(() => expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s2/F#m-abc.pdf'));
    });

    it('nothing is preloaded outside a setlist', async () => {
      const { api } = setup('/musicas/s1?tom=G');
      await screen.findByTestId('pdf-pages');
      expect(api.getArrangement).not.toHaveBeenCalled();
    });
  });
});
