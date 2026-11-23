import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { stubShare, unstubShare } from '../test/shareStub';
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
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
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

afterEach(() => {
  vi.restoreAllMocks();
  unstubShare();
});

describe('ViewerPage', () => {
  it('renders saved key chips and selects the query key', async () => {
    const { api } = renderViewer('/musicas/s1?tom=A');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando cifra…');
    expect(screen.getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sonda-me' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/');
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

  it('offers to maximize the pdf once it is on screen', async () => {
    renderViewer('/musicas/s1?tom=A');
    expect(screen.queryByRole('button', { name: 'Tela cheia' })).not.toBeInTheDocument();
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(screen.getByTestId('pdf-frame')).toHaveClass('is-fullscreen');
    expect(screen.getByTestId('pdf-pages')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia' }));
    expect(screen.getByTestId('pdf-frame')).not.toHaveClass('is-fullscreen');
  });

  it('defaults to first handmade key', async () => {
    const song = makeSong({ id: 's5', title: 'X', keys: ['C', 'D'], handmadeKeys: ['D'] });
    const { api } = renderViewer('/musicas/s5', fakeCatalogApi([song]));
    await screen.findByTestId('pdf-pages');
    expect(screen.getByRole('link', { name: 'X, tom D' })).toHaveAttribute('aria-current', 'true');
    expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s5/D-abc.pdf');
  });

  it('has no PDF download button: the bar is WhatsApp (share), Pad and Mudar tom', async () => {
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('button', { name: 'Baixar PDF' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /PDF$/ })).not.toBeInTheDocument();
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

describe('ViewerPage share button', () => {
  const supported = (share: (data: ShareData) => Promise<void> = () => Promise.resolve()) => {
    const fn = vi.fn(share);
    stubShare({ share: fn, canShare: () => true });
    return fn;
  };
  const shareButton = () => screen.getByRole('button', { name: 'Compartilhar' });
  const failure = 'Não foi possível compartilhar. Tente de novo.';

  it('hides the share button when the browser cannot share files', async () => {
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
  });

  it('uses an icon-only share button: the WhatsApp glyph, with a name', async () => {
    supported();
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    expect(shareButton().querySelector('svg.whatsapp-icon')).not.toBeNull();
    expect(shareButton().textContent).toBe('');
  });

  it('disables share until the pdf has loaded', async () => {
    supported();
    renderViewer('/musicas/s1?tom=G');
    expect(shareButton()).toBeDisabled();
    await screen.findByTestId('pdf-pages');
    expect(shareButton()).toBeEnabled();
  });

  it('shares the pdf with a friendly file name', async () => {
    const share = supported();
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [data] = share.mock.calls[0] as [{ files: File[] }];
    expect(data.files).toHaveLength(1);
    const file = data.files[0];
    expect(file?.name).toBe('Sonda-me - Aline Barros (G).pdf');
    expect(file?.type).toBe('application/pdf');
  });

  it('stays silent when the user dismisses the share sheet', async () => {
    const share = supported(() => Promise.reject(new DOMException('x', 'AbortError')));
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    await waitFor(() => expect(share).toHaveBeenCalled());
    await waitFor(() => expect(shareButton()).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when sharing fails, and clears it on the next try', async () => {
    const share = supported(() => Promise.reject(new Error('boom')));
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(failure);
    share.mockImplementation(() => Promise.resolve());
    fireEvent.click(shareButton());
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('clears the share error when the key changes', async () => {
    supported(() => Promise.reject(new Error('boom')));
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(failure);
    fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('does not bring the share error back when returning to the same key', async () => {
    supported(() => Promise.reject(new Error('boom')));
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(failure);
    fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    fireEvent.click(await screen.findByRole('link', { name: 'Sonda-me, tom G' }));
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a second tap while sharing', async () => {
    let finish: () => void = () => undefined;
    const share = supported(() => new Promise<void>((resolve) => (finish = resolve)));
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(shareButton());
    await waitFor(() => expect(shareButton()).toBeDisabled());
    expect(shareButton()).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(shareButton());
    expect(share).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(shareButton()).toBeEnabled());
  });
});
