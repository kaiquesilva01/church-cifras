import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { ViewerPage } from './ViewerPage';

vi.mock('./PdfPages', () => ({
  PdfPages: ({ doc }: { doc: { numPages: number } }) => (
    <div data-testid="pdf-pages" data-pages={doc.numPages} />
  ),
}));

function Page({ api, openPdf }: { api: ReturnType<typeof fakeCatalogApi>; openPdf: never }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return <ViewerPage api={api} songId={songId} tomSlug={params.get('tom')} openPdf={openPdf} />;
}

function renderViewer(path: string, api = fakeCatalogApi()) {
  const openPdf = vi.fn(() => Promise.resolve({ numPages: 3, destroy: vi.fn() }));
  render(
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
    </MemoryRouter>,
  );
  return { api, openPdf };
}

afterEach(() => vi.restoreAllMocks());

describe('ViewerPage', () => {
  it('renders saved key chips and selects the query key', async () => {
    const { api } = renderViewer('/musicas/s1?tom=A');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando cifra…');
    expect(screen.getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^(� )?Sonda-me$/ })).toBeInTheDocument();
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
      downloads.push(`${this.download}|${this.href}`);
    });
    renderViewer('/musicas/s1?tom=G');
    await screen.findByTestId('pdf-pages');
    fireEvent.click(screen.getByRole('button', { name: '⬇ PDF' }));
    expect(downloads).toEqual(['Sonda-me - Aline Barros (G).pdf|blob:cifra']);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
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
});
