import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigationType,
  useParams,
  useSearchParams,
} from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { stubShare, unstubShare } from '../test/shareStub';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { ActiveSetlistProvider } from '../setlists/ActiveSetlistProvider';
import type { SetlistApi } from '../setlists/setlistApi';
import type { SetlistItem } from '../setlists/types';
import { loadFontFromDisk, sheetInG } from './transposeFixtures';
import type { ChordWriter } from '@cifras/overlay';
import { ViewerPage } from './ViewerPage';

configure({ asyncUtilTimeout: 8000 });

const media = (matches: boolean) => () => ({
  matches,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

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
  unstubShare();
});

const ia: SetlistItem = { id: 'a', songId: 's1', key: 'G' };
const ix: SetlistItem = { id: 'x', songId: 'gone', key: 'C' };
const ib: SetlistItem = { id: 'b', songId: 's2', key: 'F#m' };
const ic: SetlistItem = { id: 'c', songId: 's3', key: 'D' };

function Probe() {
  const where = useLocation();
  const type = useNavigationType();
  return (
    <output data-testid="location" data-nav={type}>{`${where.pathname}${where.search}`}</output>
  );
}

function Page({ api, writer }: { api: ReturnType<typeof fakeCatalogApi>; writer?: ChordWriter }) {
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
      readLines={() => Promise.resolve(sheetInG())}
      loadFont={loadFontFromDisk}
      matchMedia={media(true)}
      writer={writer}
    />
  );
}

function setup(
  path: string,
  items: SetlistItem[] = [ia, ix, ib, ic],
  {
    role = 'member',
    writer,
    history = [],
    setlistOverrides,
    provider = true,
  }: {
    role?: Role;
    writer?: ChordWriter;
    /** Entries before `path` in the history (so `navigate(-1)` has somewhere to go). */
    history?: string[];
    setlistOverrides?: Partial<SetlistApi>;
    /** `false` renders the viewer with no active-setlist context at all. */
    provider?: boolean;
  } = {},
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
  const setlistApi = fakeSetlistApi([makeSetlist({ id: 'r1', items })], setlistOverrides);
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  const { container, unmount } = render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[...history, path]} initialIndex={history.length}>
        <Probe />
        {provider ? (
          <ActiveSetlistProvider api={setlistApi}>
            <Routes>
              <Route
                path="/musicas/:songId"
                element={
                  <SongsProvider api={api}>
                    <Page api={api} writer={writer} />
                  </SongsProvider>
                }
              />
              <Route path="/repertorios/:id" element={<p>lista</p>} />
              <Route path="/" element={<p>home</p>} />
            </Routes>
          </ActiveSetlistProvider>
        ) : (
          <Routes>
            <Route
              path="/musicas/:songId"
              element={
                <SongsProvider api={api}>
                  <Page api={api} writer={writer} />
                </SongsProvider>
              }
            />
            <Route path="/repertorios/:id" element={<p>lista</p>} />
            <Route path="/" element={<p>home</p>} />
          </Routes>
        )}
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { api, setlistApi, container, unmount };
}

const where = () => screen.getByTestId('location').textContent;
const navType = () => screen.getByTestId('location').getAttribute('data-nav');
const openPanel = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Mudar tom' }));
  await screen.findByText('Mudar tom · original', { exact: false });
  await waitFor(() => expect(screen.queryByText('Preparando…')).not.toBeInTheDocument());
};
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

  it('back goes to the setlist, not the history, while the setlist is still loading', async () => {
    setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, {
      history: ['/'],
      setlistOverrides: { subscribeSetlist: () => () => undefined },
    });
    await screen.findByTestId('pdf-pages');
    const back = screen.getByRole('link', { name: 'Voltar' });
    expect(back).toHaveAttribute('href', '/repertorios/r1');
    fireEvent.click(back);
    expect(where()).toBe('/repertorios/r1');
  });

  it('back never uses the history while a setlist is in the URL, even without its context', async () => {
    setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, {
      history: ['/repertorios/other'],
      provider: false,
    });
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('link', { name: 'Voltar' }));
    expect(where()).toBe('/');
  });

  it('Anterior and Próxima replace-navigate, skipping removed songs', async () => {
    setup('/musicas/s1?tom=G&repertorio=r1&item=a');
    await screen.findByTestId('pdf-pages');
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled();
    expect(navType()).toBe('POP');
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    expect(where()).toBe('/musicas/s2?tom=Fsm&repertorio=r1&item=b');
    expect(navType()).toBe('REPLACE');
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
      expect(navType()).toBe('REPLACE');
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

  it('marks the layout only in a setlist, so the taller bar clears the cifra', async () => {
    const inList = setup('/musicas/s1?tom=G&repertorio=r1&item=a');
    await screen.findByTestId('pdf-pages');
    expect(inList.container.querySelector('.viewer')).toHaveClass('has-setlist');
    cleanup();
    const plain = setup('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    expect(plain.container.querySelector('.viewer')).not.toHaveClass('has-setlist');
  });

  describe('Mudar tom', () => {
    it('opening a saved tom keeps repertorio and item', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a');
      await openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'A, salvo' }));
      fireEvent.click(screen.getByRole('button', { name: 'Abrir A' }));
      expect(where()).toBe('/musicas/s1?tom=A&repertorio=r1&item=a');
      expect(navType()).toBe('REPLACE');
      expect(screen.getByText(/Tom do repertório: G/)).toBeInTheDocument();
    });

    it('moving to another song closes the panel', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a');
      await openPanel();
      fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
      await screen.findByText('2 de 3');
      expect(screen.queryByText('Mudar tom · original', { exact: false })).toBeNull();
    });
  });

  describe('tom generation in flight', () => {
    const startGeneration = async () => {
      let finish: (bytes: Uint8Array) => void = () => undefined;
      const writer: ChordWriter = {
        write: vi.fn(() => new Promise<Uint8Array>((resolve) => (finish = resolve))),
      };
      const view = setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, { writer });
      await openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'D' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
      await screen.findByRole('button', { name: 'Gerando PDF…' });
      return { ...view, finish: (bytes = new Uint8Array([9, 9, 9])) => finish(bytes) };
    };

    it('does not send the member back to the previous song', async () => {
      const { finish, api } = await startGeneration();
      fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
      await screen.findByText('2 de 3');
      const next = where();
      await act(async () => {
        finish();
        await waitFor(() => expect(api.createGeneratedArrangement).toHaveBeenCalled());
      });
      expect(where()).toBe(next);
      expect(next).toContain('/musicas/s2');
      expect(screen.queryByRole('button', { name: 'Gerando PDF…' })).toBeNull();
    });

    it('does nothing when the viewer unmounts during generation', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { finish, unmount } = await startGeneration();
      unmount();
      await act(async () => {
        finish();
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(error).not.toHaveBeenCalled();
    });
  });

  describe('per-song UI state', () => {
    const saveMeta = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Editar nome e cantor' }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText('Cantor'), { target: { value: 'Outra' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
      await screen.findByText('Dados atualizados.');
    };

    it('the saved-data notice survives a tom switch but not another song', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, { role: 'admin' });
      await saveMeta();
      fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
      expect(screen.getByText('Dados atualizados.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
      await screen.findByText('2 de 3');
      expect(screen.queryByText('Dados atualizados.')).toBeNull();
    });

    it('an open manage menu does not follow to the next song', async () => {
      setup('/musicas/s1?tom=G&repertorio=r1&item=a', undefined, { role: 'admin' });
      fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
      expect(screen.getByRole('group', { name: 'Gerenciar música' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
      await screen.findByText('2 de 3');
      expect(screen.queryByRole('group', { name: 'Gerenciar música' })).toBeNull();
    });
  });

  it('a share that fails after moving to the next cifra shows no error there', async () => {
    let fail: (error: Error) => void = () => undefined;
    const share = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    stubShare({ share, canShare: () => true });
    setup('/musicas/s1?tom=G&repertorio=r1&item=a');
    await screen.findByTestId('pdf-pages');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Próxima/ }));
    await screen.findByText('2 de 3');
    await act(async () => {
      fail(new Error('boom'));
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.queryByText('Não foi possível compartilhar. Tente de novo.')).toBeNull();
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
