import type { ChordWriter, OverlayOp } from '@cifras/overlay';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { ArrangementExistsError } from '../catalog/catalogApi';
import type { SongSummary } from '../catalog/types';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { loadFontFromDisk, sheetInG } from './transposeFixtures';
import { ViewerPage, type ViewerPageProps } from './ViewerPage';

vi.mock('./PreviewLayer', () => ({
  PreviewLayer: ({ ops, highlight }: { ops: OverlayOp[]; highlight?: boolean }) => (
    <i
      data-testid="layer"
      data-highlight={String(highlight)}
      data-ops={ops.map((op) => op.text.value).join('|')}
    />
  ),
}));

const pageRender = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
const fakeDoc = () => ({
  numPages: 1,
  destroy: vi.fn(),
  getPage: () =>
    Promise.resolve({
      getViewport: ({ scale }: { scale: number }) => ({
        scale,
        width: 600 * scale,
        height: 800 * scale,
        convertToViewportPoint: (x: number, y: number) => [x * scale, 800 * scale - y * scale],
      }),
      render: pageRender,
    }),
});

beforeEach(() => {
  pageRender.mockClear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const media =
  (matches: boolean): NonNullable<ViewerPageProps['matchMedia']> =>
  () => ({ matches, addEventListener: () => undefined, removeEventListener: () => undefined });

function Probe() {
  const where = useLocation();
  return <output data-testid="location">{`${where.pathname}${where.search}`}</output>;
}

function Page(props: Omit<ViewerPageProps, 'songId' | 'tomSlug'>) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return <ViewerPage {...props} songId={songId} tomSlug={params.get('tom')} />;
}

const songG = makeSong({
  id: 's1',
  title: 'Sonda-me',
  artistName: 'Aline Barros',
  keys: ['G', 'A'],
  handmadeKeys: ['G'],
});

interface Options {
  role?: Role;
  path?: string;
  songs?: SongSummary[];
  api?: ReturnType<typeof fakeCatalogApi>;
  lines?: ReturnType<typeof sheetInG>;
  writer?: ChordWriter;
  writerMode?: 'overlay' | 'rewrite';
  wide?: boolean;
  readLines?: () => Promise<ReturnType<typeof sheetInG>>;
}

function renderViewer(options: Options = {}) {
  const api = options.api ?? fakeCatalogApi(options.songs ?? [songG]);
  const writer: ChordWriter = options.writer ?? {
    write: vi.fn(() => Promise.resolve(new Uint8Array([9, 9, 9]))),
  };
  const readLines = vi.fn(
    options.readLines ?? (() => Promise.resolve(options.lines ?? sheetInG())),
  );
  const openPdf = vi.fn(() => Promise.resolve(fakeDoc()));
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: options.role ?? 'member',
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  const { container } = render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[options.path ?? '/musicas/s1?tom=G']}>
        <Probe />
        <Routes>
          <Route
            path="/musicas/:songId"
            element={
              <SongsProvider api={api}>
                <Page
                  api={api}
                  openPdf={openPdf as never}
                  readLines={readLines as never}
                  loadFont={loadFontFromDisk}
                  writer={writer}
                  writerMode={options.writerMode ?? 'overlay'}
                  matchMedia={media(options.wide ?? false)}
                />
              </SongsProvider>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { api, writer, readLines, openPdf, container };
}

const openPanel = async () => {
  fireEvent.click(await screen.findByRole('button', { name: '♪ Mudar tom' }));
  await screen.findByText('Mudar tom · original', { exact: false });
  await waitFor(() => expect(screen.queryByText('Preparando…')).not.toBeInTheDocument());
};
const where = () => screen.getByTestId('location').textContent;

describe('ViewerPage change key', () => {
  it('visitor does not see Mudar tom', async () => {
    renderViewer({ role: 'viewer' });
    await waitFor(() => expect(screen.getByRole('button', { name: '⬇ PDF' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: '♪ Mudar tom' })).not.toBeInTheDocument();
  });

  it('opens panel with source key title', async () => {
    let release: (lines: ReturnType<typeof sheetInG>) => void = () => undefined;
    renderViewer({ readLines: () => new Promise((resolve) => (release = resolve)) });
    fireEvent.click(await screen.findByRole('button', { name: '♪ Mudar tom' }));
    expect(await screen.findByText('Preparando…')).toBeInTheDocument();
    release(sheetInG());
    await waitFor(() => expect(screen.queryByText('Preparando…')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog')).toHaveTextContent('Mudar tom · original G');
  });

  it('selecting a key shows preview with changed chords', async () => {
    renderViewer();
    await openPanel();
    expect(screen.queryByTestId('layer')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    const layer = await screen.findByTestId('layer');
    expect(layer).toHaveAttribute('data-ops', 'D|G|A/C#|D');
    expect(layer).toHaveAttribute('data-highlight', 'true');
  });

  it('switching keys repaints the layer without re-rendering the page', async () => {
    renderViewer();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    await screen.findByTestId('layer');
    await waitFor(() => expect(pageRender).toHaveBeenCalled());
    const renders = pageRender.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'E' }));
    await waitFor(() =>
      expect(screen.getByTestId('layer').getAttribute('data-ops')).toMatch(/^E\|/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eb' }));
    await waitFor(() =>
      expect(screen.getByTestId('layer').getAttribute('data-ops')).toMatch(/^Eb\|/),
    );
    expect(pageRender.mock.calls.length).toBe(renders);
  });

  it('saved key shows Abrir and navigates', async () => {
    renderViewer();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'A, salvo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir A' }));
    expect(where()).toBe('/musicas/s1?tom=A');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirm generates, saves and navigates', async () => {
    let finish: (bytes: Uint8Array) => void = () => undefined;
    const writer: ChordWriter = {
      write: vi.fn(() => new Promise<Uint8Array>((resolve) => (finish = resolve))),
    };
    const { api } = renderViewer({ writer });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
    expect(await screen.findByRole('button', { name: 'Gerando PDF…' })).toBeDisabled();
    finish(new Uint8Array([9, 9, 9]));
    await waitFor(() => expect(where()).toBe('/musicas/s1?tom=D'));
    expect(vi.mocked(writer.write).mock.calls[0]![0]).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(api.uploadPdf).toHaveBeenCalledWith('s1', 'D', expect.any(Blob));
    expect(api.createGeneratedArrangement).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ key: 'D', derivedFromKey: 'G', chordCount: 3, collisions: 0 }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText(/já tinha sido salvo/)).not.toBeInTheDocument();
  });

  it('shows existing notice on conflict', async () => {
    const api = fakeCatalogApi([songG], {
      createGeneratedArrangement: vi.fn(() => Promise.reject(new ArrangementExistsError())),
    });
    renderViewer({ api });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
    expect(
      await screen.findByText('Esse tom já tinha sido salvo. Abrimos o existente.'),
    ).toBeInTheDocument();
    expect(where()).toBe('/musicas/s1?tom=D');
  });

  it('shows an error and keeps the panel when generating fails', async () => {
    const writer: ChordWriter = { write: vi.fn(() => Promise.reject(new Error('boom'))) };
    renderViewer({ writer });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível gerar o PDF. Tente de novo.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar D' })).toBeEnabled();
  });

  it('shows collision warning and saves the collision count', async () => {
    const lines = sheetInG([
      ['G', 50],
      ['C', 65],
    ]);
    const { api } = renderViewer({ lines });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Ab' }));
    expect(
      await screen.findByText(/^⚠ \d+ acordes? podem? encostar no vizinho \(em vermelho\)$/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Ab' }));
    await waitFor(() => expect(api.createGeneratedArrangement).toHaveBeenCalled());
    const saved = vi.mocked(api.createGeneratedArrangement).mock.calls[0]![1];
    expect(saved.collisions).toBeGreaterThan(0);
  });

  it('shows suspect warning', async () => {
    const lines = sheetInG([
      ['G', 50],
      ['E7/9x', 150],
    ]);
    renderViewer({ lines });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    expect(
      await screen.findByText('Confira: não reconhecemos E7/9x como acorde.'),
    ).toBeInTheDocument();
  });

  it('semitone buttons step the target', async () => {
    renderViewer();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom acima' }));
    expect(screen.getByRole('button', { name: 'Confirmar Ab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom abaixo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom abaixo' }));
    expect(screen.getByRole('button', { name: 'Confirmar F#' })).toBeInTheDocument();
  });

  it('minor song shows minor keys', async () => {
    const song = makeSong({
      id: 's2',
      title: 'Ressuscita-me',
      keys: ['F#m'],
      handmadeKeys: ['F#m'],
    });
    renderViewer({ songs: [song], path: '/musicas/s2' });
    await openPanel();
    expect(screen.getByRole('dialog')).toHaveTextContent('original F#m');
    expect(screen.getByRole('button', { name: 'Cm' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'C' })).not.toBeInTheDocument();
  });

  it('disabled when there is no handmade source', async () => {
    const song = makeSong({ id: 's3', title: 'Só gerada', keys: ['C'], handmadeKeys: [] });
    renderViewer({ songs: [song], path: '/musicas/s3' });
    const button = await screen.findByRole('button', { name: '♪ Mudar tom' });
    await waitFor(() => expect(screen.getByRole('button', { name: '⬇ PDF' })).toBeEnabled());
    expect(button).toBeDisabled();
    expect(screen.getByText('Não há PDF feito à mão para transpor.')).toBeInTheDocument();
  });

  it('rewrite mode shows unavailable message', async () => {
    const { api } = renderViewer({ writerMode: 'rewrite' });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    expect(screen.getByText('Modo de reescrita ainda não disponível.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar D' })).toBeDisabled();
    expect(api.uploadPdf).not.toHaveBeenCalled();
  });

  it('shows the source pdf during the preview when a generated key is open', async () => {
    const { api } = renderViewer({ path: '/musicas/s1?tom=A' });
    await waitFor(() => expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s1/A-abc.pdf'));
    fireEvent.click(await screen.findByRole('button', { name: '♪ Mudar tom' }));
    await waitFor(() => expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s1/G-abc.pdf'));
    await waitFor(() => expect(screen.queryByText('Preparando…')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    expect(await screen.findByTestId('layer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(api.getPdfBytes).toHaveBeenLastCalledWith('songs/s1/A-abc.pdf'));
    await waitFor(() => expect(screen.getByRole('button', { name: '⬇ PDF' })).toBeEnabled());
    expect(screen.queryByTestId('layer')).not.toBeInTheDocument();
  });

  it('cancel closes the panel and removes the preview', async () => {
    renderViewer();
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    await screen.findByTestId('layer');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('layer')).not.toBeInTheDocument();
    expect(where()).toBe('/musicas/s1?tom=G');
  });

  it('Escape does not cancel while generating', async () => {
    let finish: (bytes: Uint8Array) => void = () => undefined;
    const writer: ChordWriter = {
      write: vi.fn(() => new Promise<Uint8Array>((resolve) => (finish = resolve))),
    };
    renderViewer({ writer });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
    await screen.findByRole('button', { name: 'Gerando PDF…' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    finish(new Uint8Array([9]));
    await waitFor(() => expect(where()).toBe('/musicas/s1?tom=D'));
  });

  it('shows a prepare error when the source pdf cannot be loaded', async () => {
    const api = fakeCatalogApi([songG], {
      getPdfBytes: vi.fn((path: string) =>
        path.includes('/G-')
          ? Promise.reject(new Error('boom'))
          : Promise.resolve(new Uint8Array([1])),
      ),
    });
    renderViewer({ api, path: '/musicas/s1?tom=A' });
    await waitFor(() => expect(api.getPdfBytes).toHaveBeenCalledWith('songs/s1/A-abc.pdf'));
    fireEvent.click(await screen.findByRole('button', { name: '♪ Mudar tom' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toContain('Não foi possível preparar a troca de tom.');
    expect(screen.queryByText('Preparando…')).not.toBeInTheDocument();
  });

  it('makes the page inert behind the sheet', async () => {
    const { container } = renderViewer();
    await openPanel();
    expect(container.querySelector('[inert]')).not.toBeNull();
    expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(container.querySelector('[inert]')).toBeNull();
  });

  it('clears the existing-key notice when the selected key changes', async () => {
    const api = fakeCatalogApi([songG], {
      createGeneratedArrangement: vi.fn(() => Promise.reject(new ArrangementExistsError())),
    });
    renderViewer({ api });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'D' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar D' }));
    await screen.findByText('Esse tom já tinha sido salvo. Abrimos o existente.');
    fireEvent.click(screen.getByRole('link', { name: 'Sonda-me, tom A' }));
    await waitFor(() =>
      expect(screen.queryByText('Esse tom já tinha sido salvo. Abrimos o existente.')).toBeNull(),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '⬇ PDF' })).toBeEnabled());
  });

  it('uses the side panel on wide screens', async () => {
    renderViewer({ wide: true });
    await openPanel();
    const panel = screen.getByRole('complementary');
    expect(within(panel).getByText('Mudar tom · original G')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
