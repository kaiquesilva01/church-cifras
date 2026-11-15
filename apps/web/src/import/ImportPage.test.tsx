import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../catalog/catalogApi';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, sampleSongs } from '../test/fakeCatalogApi';
import type { ReadPdf } from '../upload/UploadPage';
import { ImportPage } from './ImportPage';

type Suggestion = Awaited<ReturnType<ReadPdf>>;
const result = (over: Partial<Suggestion['suggestion']> = {}, chordCount = 12): Suggestion => ({
  chordCount,
  suspects: [],
  ignoredChordLines: 0,
  suggestion: {
    title: 'Música Nova',
    artist: 'Cantor Novo',
    key: 'G',
    keySource: 'indicator',
    swapped: false,
    ...over,
  },
});

const pdf = (name: string, size = 1000) => {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

function setup(options: { reads?: Record<string, Suggestion>; api?: Partial<CatalogApi> } = {}) {
  const api = fakeCatalogApi(sampleSongs, options.api);
  const readPdf: ReadPdf = vi.fn((file: File) =>
    Promise.resolve(options.reads?.[file.name] ?? result({ title: file.name })),
  );
  render(
    <MemoryRouter>
      <SongsProvider api={api}>
        <ImportPage api={api} readPdf={readPdf} />
      </SongsProvider>
    </MemoryRouter>,
  );
  return { api, readPdf };
}

function addFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Escolher arquivos'), { target: { files } });
}

const rowOf = (fileName: string) => screen.getByRole('row', { name: new RegExp(fileName) });

afterEach(() => vi.restoreAllMocks());

describe('ImportPage', () => {
  it('lists files with suggestions and statuses', async () => {
    setup({
      reads: {
        'a.pdf': result({ title: 'Música A' }),
        'b.pdf': result({ title: 'Sonda-me', artist: 'Aline Barros', key: 'G' }),
        'c.pdf': result({}, 0),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('pronto')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Importar em lote' })).toBeInTheDocument();
    expect(within(rowOf('a.pdf')).getByLabelText('Música de a.pdf')).toHaveValue('Música A');
    expect(within(rowOf('a.pdf')).getByLabelText('Cantor de a.pdf')).toHaveValue('Cantor Novo');
    expect(within(rowOf('a.pdf')).getByLabelText('Tom de a.pdf')).toHaveValue('G');
    expect(within(rowOf('b.pdf')).getByText('conflito: tom feito à mão já existe')).toBeVisible();
    expect(within(rowOf('c.pdf')).getByText('fora do padrão')).toBeVisible();
    expect(screen.getByText('3 arquivos · 1 prontos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 1 prontos' })).toBeEnabled();
  });

  it('shows reading progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(async (f: File) => {
      await gate;
      return result({ title: f.name });
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    expect(await screen.findByText('Lendo 0 de 3…')).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(screen.queryByText(/Lendo/)).not.toBeInTheDocument());
  });

  it('editing fields reclassifies the row', async () => {
    setup({ reads: { 'a.pdf': result({ title: '', artist: 'Cantor Novo' }) } });
    addFiles([pdf('a.pdf')]);
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('falta a música')).toBeVisible());
    fireEvent.change(screen.getByLabelText('Música de a.pdf'), { target: { value: 'Algo' } });
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('pronto')).toBeVisible());
    fireEvent.change(screen.getByLabelText('Tom de a.pdf'), { target: { value: '' } });
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('falta o tom')).toBeVisible());
  });

  it('swap button swaps title and artist', async () => {
    setup({ reads: { 'a.pdf': result({ title: 'Cantor X', artist: 'Música Y' }) } });
    addFiles([pdf('a.pdf')]);
    await screen.findByLabelText('Música de a.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'Inverter música e cantor de a.pdf' }));
    expect(screen.getByLabelText('Música de a.pdf')).toHaveValue('Música Y');
    expect(screen.getByLabelText('Cantor de a.pdf')).toHaveValue('Cantor X');
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('pronto')).toBeVisible());
  });

  it('imports ready rows and shows summary', async () => {
    const { api } = setup({
      reads: {
        'a.pdf': result({ title: 'Música A' }),
        'b.pdf': result({ title: 'Música A', key: 'A' }),
        'c.pdf': result({ title: 'Música C', key: 'F' }),
      },
      api: {
        getArrangement: vi.fn(() => Promise.resolve(null)),
        createSongWithArrangement: vi.fn((input: { title: string }) =>
          input.title === 'Música C' ? Promise.reject(new Error('falhou')) : Promise.resolve('id'),
        ),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 3 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('2 importados · 0 já existiam · 1 com erro')).toBeVisible();
    expect(api.createSongWithArrangement).toHaveBeenCalledTimes(2);
    expect(api.addArrangement).toHaveBeenCalledWith(
      'new-id',
      expect.objectContaining({ key: 'A' }),
    );
    expect(within(rowOf('a.pdf')).getByText('importado')).toBeVisible();
    expect(within(rowOf('c.pdf')).getByText('erro: falhou')).toBeVisible();
  });

  it('downloads csv with skipped rows', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setup({ reads: { 'a.pdf': result({}, 0), 'b.pdf': result({ title: 'Ok' }) } });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(within(rowOf('b.pdf')).getByText('pronto')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: '⬇ Relatório CSV' }));
    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]!);
    });
    expect(text).toContain('a.pdf;');
    expect(text).toContain('fora do padrão');
    expect(text).not.toContain('b.pdf');
  });

  it('ignores non pdf files', async () => {
    const { readPdf } = setup();
    addFiles([pdf('a.pdf'), new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(await screen.findByText('Ignoramos 1 arquivo(s) que não são PDF.')).toBeVisible();
    await waitFor(() => expect(screen.getByText(/^1 arquivos/)).toBeInTheDocument());
    expect(readPdf).toHaveBeenCalledTimes(1);
  });

  it('cancel stops the queue', async () => {
    const pending: Array<() => void> = [];
    const { api } = setup({
      reads: {
        'a.pdf': result({ title: 'A' }),
        'b.pdf': result({ title: 'B' }),
        'c.pdf': result({ title: 'C' }),
        'd.pdf': result({ title: 'D' }),
      },
      api: {
        getArrangement: vi.fn(() => Promise.resolve(null)),
        createSongWithArrangement: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              pending.push(() => resolve('id'));
            }),
        ),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf'), pdf('d.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 4 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('Importando 0 de 4…')).toBeVisible();
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await act(async () => pending.forEach((resolve) => resolve()));
    expect(await screen.findByText('2 importados · 0 já existiam · 0 com erro')).toBeVisible();
    expect(api.createSongWithArrangement).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Importação cancelada.')).toBeVisible();
  });
});
