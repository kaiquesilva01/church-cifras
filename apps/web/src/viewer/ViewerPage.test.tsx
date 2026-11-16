import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { ViewerPage } from './ViewerPage';

vi.mock('./PdfPages', () => ({
  PdfPages: ({
    doc,
    onPreviewError,
  }: {
    doc: { numPages: number };
    onPreviewError?: () => void;
  }) => (
    <div data-testid="pdf-pages" data-pages={doc.numPages}>
      <button onClick={onPreviewError}>fail-preview</button>
    </div>
  ),
}));

function Page({ api, openPdf }: { api: ReturnType<typeof fakeCatalogApi>; openPdf: never }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <ViewerPage
      api={api}
      songId={songId}
      tomSlug={params.get('tom')}
      openPdf={openPdf}
      readLines={() => Promise.resolve([])}
    />
  );
}

function renderViewer(path: string, api = fakeCatalogApi()) {
  const openPdf = vi.fn(() => Promise.resolve({ numPages: 3, destroy: vi.fn() }));
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'member',
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/musicas/:songId"
            element={
              <SongsProvider api={api}>
                <Page api={api} openPdf={openPdf as never} />
              </SongsProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { api, openPdf };
}

afterEach(() => vi.restoreAllMocks());

describe('ViewerPage', () => {
  it('renders saved key chips and selects the query key', async () => {
    const { api } = renderViewer('/musicas/s1?tom=A');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando cifra…');
    expect(screen.getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me, tom A' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Sonda-me, tom G' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(await screen.findByTestId('pdf-pages')).toHaveAttribute('data-pages', '3');
    expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s1/A-abc.pdf');
  });

  it('defaults to first handmade key', async () => {
    const song = makeSong({ id: 's5', title: 'X', keys: ['C', 'D'], handmadeKeys: ['D'] });
    const { api } = renderViewer('/musicas/s5', fakeCatalogApi([song]));
    await screen.findByTestId('pdf-pages');
    expect(screen.getByRole('link', { name: 'X, tom D' })).toHaveAttribute('aria-current', 'true');
    expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s5/D-abc.pdf');
  });

  it('downloads with a friendly file name', async () => {
    const createObjectURL = vi.fn(() => 'blob:cifra');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(`${this.download}|${this.href}|${this.isConnected}`);
    });
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(downloads).toEqual(['Sonda-me - Aline Barros (G).pdf|blob:cifra|true']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cifra');
    vi.useRealTimers();
  });

  it('shows not found for unknown song', () => {
    renderViewer('/musicas/nope');
    expect(screen.getByText('Música não encontrada.')).toBeInTheDocument();
  });

  it('shows an error when the pdf cannot be opened', async () => {
    const api = fakeCatalogApi(undefined, {
      getPdfBytes: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    renderViewer('/musicas/s1?tom=G', api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível abrir o PDF.');
  });

  it('shows chips from song.keys while arrangements load', () => {
    const api = fakeCatalogApi(undefined, { subscribeArrangements: () => () => undefined });
    renderViewer('/musicas/s1', api);
    expect(screen.getByRole('link', { name: 'Sonda-me, tom G' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me, tom A' })).toBeInTheDocument();
  });

  it('shows a preview error message', async () => {
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('button', { name: 'fail-preview' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível mostrar a prévia.');
  });

  it('fetches a path once when switching A to B and back to A while A is loading', async () => {
    let resolveA: (bytes: Uint8Array) => void = () => undefined;
    const getPdfBytes = vi.fn((path: string) =>
      path.endsWith('A-abc.pdf')
        ? new Promise<Uint8Array>((resolve) => (resolveA = resolve))
        : Promise.resolve(new Uint8Array([37, 80, 68, 70])),
    );
    const api = fakeCatalogApi(undefined, { getPdfBytes });
    renderViewer('/musicas/s1?tom=A', api);
    fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom G' }));
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
    resolveA(new Uint8Array([37, 80, 68, 70]));
    await screen.findByTestId('pdf-pages');
    const fetchesOfA = getPdfBytes.mock.calls.filter(([path]) => path.endsWith('A-abc.pdf'));
    expect(fetchesOfA).toHaveLength(1);
  });
});
