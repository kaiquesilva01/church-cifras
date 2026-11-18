import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { PadContext, type PadContextValue } from '../pad/usePad';
import { ActiveSetlistProvider } from '../setlists/ActiveSetlistProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { loadFontFromDisk, sheetInG } from './transposeFixtures';
import { ViewerPage } from './ViewerPage';

configure({ asyncUtilTimeout: 8000 });

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
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const media = () => ({
  matches: true,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});

function fake(): PadContextValue {
  return {
    status: 'off',
    note: null,
    owner: null,
    volume: 0.6,
    notice: null,
    toggle: vi.fn(),
    follow: vi.fn(),
    setVolume: vi.fn(),
    prefetch: vi.fn(),
  };
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
      readLines={() => Promise.resolve(sheetInG())}
      loadFont={loadFontFromDisk}
      matchMedia={media}
    />
  );
}

function setup(path: string, pad: PadContextValue | null) {
  const api = fakeCatalogApi(sampleSongs);
  const setlistApi = fakeSetlistApi([
    makeSetlist({
      id: 'r1',
      items: [
        { id: 'a', songId: 's1', key: 'G' },
        { id: 'b', songId: 's2', key: 'F#m' },
      ],
    }),
  ]);
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'member',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <PadContext.Provider value={pad}>
        <MemoryRouter initialEntries={[path]}>
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
            </Routes>
          </ActiveSetlistProvider>
        </MemoryRouter>
      </PadContext.Provider>
    </AuthContext.Provider>,
  );
}

describe('ViewerPage pad button', () => {
  it('shows the Pad button in the bar inside a provider', async () => {
    setup('/musicas/s1?tom=G', fake());
    await screen.findByTestId('pdf-pages');
    expect(screen.getByRole('button', { name: /Pad/ })).toBeInTheDocument();
  });

  it('shows no Pad button without a provider and the page still works', async () => {
    setup('/musicas/s1?tom=G', null);
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('button', { name: /Pad/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mudar tom' })).toBeInTheDocument();
  });

  it('toggles with a song owner outside a setlist', async () => {
    const pad = fake();
    setup('/musicas/s1?tom=G', pad);
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('button', { name: /Pad/ }));
    expect(pad.toggle).toHaveBeenCalledWith('G', { kind: 'song', songId: 's1' });
  });

  it('toggles with a setlist owner in setlist context', async () => {
    const pad = fake();
    setup('/musicas/s1?tom=G&repertorio=r1&item=a', pad);
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('button', { name: /Pad/ }));
    expect(pad.toggle).toHaveBeenCalledWith('G', { kind: 'setlist', setlistId: 'r1' });
  });

  it('never follows the Mudar tom preview source', async () => {
    const pad = fake();
    setup('/musicas/s1?tom=A', pad);
    await screen.findByTestId('pdf-pages');
    await waitFor(() => expect(pad.follow).toHaveBeenCalledWith('A'));
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar tom' }));
    await screen.findByText('Mudar tom · original', { exact: false });
    await waitFor(() => expect(screen.queryByText('Preparando…')).not.toBeInTheDocument());
    // Source G differs from the selected A: `displayed` is G while the panel is open.
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom acima' }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const calls = vi.mocked(pad.follow).mock.calls.map(([key]) => key);
    expect(calls).not.toContain('G');
    expect(calls).not.toContain('D');
    expect(calls).not.toContain('D#');
    expect(calls.at(-1)).toBe('A');
  });
});
