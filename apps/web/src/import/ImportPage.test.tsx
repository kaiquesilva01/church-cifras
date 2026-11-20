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
  lyrics: '',
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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

  it('imports a new song with the row lyrics', async () => {
    const { api } = setup({
      reads: { 'a.pdf': { ...result({ title: 'Música A' }), lyrics: 'Letra da música A' } },
    });
    addFiles([pdf('a.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 1 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('1 importados · 0 já existiam · 0 com erro')).toBeVisible();
    expect(api.createSongWithArrangement).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Música A', lyrics: 'Letra da música A' }),
    );
  });

  it('classifies from the catalog summaries without per-row lookups', async () => {
    const { api } = setup({
      reads: {
        'a.pdf': result({ title: 'Sonda-me', artist: 'Aline Barros', key: 'A' }),
        'b.pdf': result({ title: 'Sonda-me', artist: 'Aline Barros', key: 'D' }),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('substitui gerado')).toBeVisible());
    expect(within(rowOf('b.pdf')).getByText('já existe — novo tom')).toBeVisible();
    expect(api.getArrangement).not.toHaveBeenCalled();
  });

  it('editing one row keeps the others and the counts while reclassifying', async () => {
    setup({
      reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(within(rowOf('b.pdf')).getByText('pronto')).toBeVisible());
    expect(within(rowOf('a.pdf')).getByText('pronto')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Música de a.pdf'), { target: { value: 'A2' } });
    expect(within(rowOf('a.pdf')).getByText('Verificando…')).toBeVisible();
    expect(within(rowOf('b.pdf')).getByText('pronto')).toBeVisible();
    expect(within(rowOf('b.pdf')).queryByText('Verificando…')).not.toBeInTheDocument();
    expect(screen.getByText('2 arquivos · 2 prontos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar 2 prontos' })).toBeDisabled();
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('pronto')).toBeVisible());
    expect(screen.getByRole('button', { name: 'Importar 2 prontos' })).toBeEnabled();
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
    expect(within(rowOf('c.pdf')).getByText('erro: erro inesperado')).toBeVisible();
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
    expect(screen.getByText(/Importação cancelada\./)).toBeVisible();
  });

  it('keeps live per-row results when the catalog changes mid-import', async () => {
    let emit!: (songs: typeof sampleSongs) => void;
    const pending = new Map<string, () => void>();
    setup({
      reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) },
      api: {
        subscribeSongs: (cb) => {
          emit = cb;
          cb(sampleSongs);
          return () => undefined;
        },
        createSongWithArrangement: vi.fn(
          (input: { title: string }) =>
            new Promise<string>((resolve) => {
              pending.set(input.title, () => resolve('id'));
            }),
        ),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 2 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(pending.size).toBe(2));
    await act(async () => pending.get('A')!());
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('importado')).toBeVisible());
    const landed = {
      ...sampleSongs[0]!,
      id: 'idA',
      title: 'A',
      titleNormalized: 'a',
      artistId: 'cantor-novo',
      artistName: 'Cantor Novo',
      keys: ['G' as const],
      handmadeKeys: ['G' as const],
    };
    await act(async () => emit([...sampleSongs, landed]));
    await new Promise((r) => setTimeout(r, 400));
    expect(within(rowOf('a.pdf')).getByText('importado')).toBeVisible();
    expect(screen.getByText('2 arquivos · 2 prontos')).toBeInTheDocument();
    await act(async () => pending.get('B')!());
    expect(await screen.findByText('2 importados · 0 já existiam · 0 com erro')).toBeVisible();
    expect(within(rowOf('b.pdf')).getByText('importado')).toBeVisible();
  });

  it('shows Cancelando and clears the cancelled notice on new files', async () => {
    const pending: Array<() => void> = [];
    setup({
      reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) },
      api: {
        createSongWithArrangement: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              pending.push(() => resolve('id'));
            }),
        ),
      },
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 2 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Cancelando…' })).toBeDisabled();
    await act(async () => pending.forEach((resolve) => resolve()));
    expect(
      await screen.findByText(/As linhas não importadas continuam prontas para tentar de novo\./),
    ).toBeVisible();
    addFiles([pdf('c.pdf')]);
    await waitFor(() => expect(screen.queryByText(/Importação cancelada/)).not.toBeInTheDocument());
  });

  it('marks unreadable pdfs as fora do padrão with a reason', async () => {
    const { readPdf } = setup();
    vi.mocked(readPdf).mockRejectedValue(new Error('x'));
    addFiles([pdf('bad.pdf')]);
    await waitFor(() => expect(within(rowOf('bad.pdf')).getByText('fora do padrão')).toBeVisible());
    expect(within(rowOf('bad.pdf')).getByText('não foi possível ler o PDF')).toBeVisible();
  });

  it('labels rows from a folder with their relative path', async () => {
    setup();
    const file = pdf('a.pdf');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'pasta/sub/a.pdf' });
    addFiles([file]);
    expect(await screen.findByLabelText('Música de pasta/sub/a.pdf')).toBeInTheDocument();
  });

  it('disables the dropzone while busy and says so', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(async (f: File) => {
      await gate;
      return result({ title: f.name });
    });
    addFiles([pdf('a.pdf')]);
    expect(await screen.findByText('Aguarde terminar antes de adicionar arquivos.')).toBeVisible();
    expect(screen.getByLabelText('Escolher arquivos')).toBeDisabled();
    await act(async () => release());
    await waitFor(() =>
      expect(
        screen.queryByText('Aguarde terminar antes de adicionar arquivos.'),
      ).not.toBeInTheDocument(),
    );
  });

  it('locks the inputs of rows already imported', async () => {
    setup({ reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) } });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 2 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('2 importados · 0 já existiam · 0 com erro')).toBeVisible();
    expect(screen.getByLabelText('Música de a.pdf')).toBeDisabled();
    expect(screen.getByLabelText('Cantor de a.pdf')).toBeDisabled();
    expect(screen.getByLabelText('Tom de a.pdf')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Inverter música e cantor de a.pdf' }),
    ).toBeDisabled();
  });

  it('revokes the csv object url after 10 s', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    setup({ reads: { 'a.pdf': result({}, 0) } });
    addFiles([pdf('a.pdf')]);
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('fora do padrão')).toBeVisible());
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByRole('button', { name: '⬇ Relatório CSV' }));
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });

  it('does not read files over 10 MB', async () => {
    const { readPdf } = setup();
    addFiles([pdf('big.pdf', 10 * 1024 * 1024 + 1), pdf('ok.pdf')]);
    await waitFor(() => expect(within(rowOf('big.pdf')).getByText('grande demais')).toBeVisible());
    expect(readPdf).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readPdf).mock.calls[0]![0].name).toBe('ok.pdf');
  });

  it('gives up on a PDF that takes more than 30 s to read', async () => {
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(() => new Promise(() => {}));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    addFiles([pdf('slow.pdf')]);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400); // classification debounce
    });
    expect(within(rowOf('slow.pdf')).getByText('fora do padrão')).toBeVisible();
    expect(within(rowOf('slow.pdf')).getByText('tempo esgotado ao ler o PDF')).toBeVisible();
  });

  it('warns before leaving only while importing', async () => {
    let finish!: () => void;
    setup({
      reads: { 'a.pdf': result({ title: 'A' }) },
      api: {
        createSongWithArrangement: vi.fn(
          () => new Promise<string>((resolve) => (finish = () => resolve('id'))),
        ),
      },
    });
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).toBe(false);
    addFiles([pdf('a.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 1 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('Importando 0 de 1…');
    expect(leave()).toBe(true);
    await act(async () => finish());
    await screen.findByText('1 importados · 0 já existiam · 0 com erro');
    expect(leave()).toBe(false);
  });

  it('shows each row as soon as its file is read, in selection order', async () => {
    const gates = new Map<string, () => void>();
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(
      (f: File) =>
        new Promise((resolve) => {
          gates.set(f.name, () => resolve(result({ title: f.name })));
        }),
    );
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(gates.size).toBe(2));
    await act(async () => gates.get('b.pdf')!());
    expect(screen.getByLabelText('Música de b.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText('Música de a.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Lendo 1 de 2…')).toBeInTheDocument();
    await act(async () => gates.get('a.pdf')!());
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.getAttribute('aria-label'));
    expect(names).toEqual(['a.pdf', 'b.pdf']);
    await waitFor(() => expect(within(rowOf('a.pdf')).getByText('pronto')).toBeVisible());
  });

  it('keeps the import button disabled until every read finishes', async () => {
    const gates = new Map<string, () => void>();
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(
      (f: File) =>
        new Promise((resolve) => {
          gates.set(f.name, () => resolve(result({ title: f.name })));
        }),
    );
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(gates.size).toBe(2));
    await act(async () => gates.get('a.pdf')!());
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.getByRole('button', { name: /^Importar \d+ prontos$/ })).toBeDisabled();
    await act(async () => gates.get('b.pdf')!());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Importar 2 prontos' })).toBeEnabled(),
    );
  });

  it('removes a single row and its result', async () => {
    setup({ reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) } });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    await waitFor(() => expect(within(rowOf('b.pdf')).getByText('pronto')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Remover a.pdf' }));
    expect(screen.queryByLabelText('Música de a.pdf')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Música de b.pdf')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Importar 1 prontos' })).toBeEnabled(),
    );
    expect(screen.getByText('1 arquivos · 1 prontos')).toBeInTheDocument();
  });

  it('disables Remover and Limpar lista while importing, and enables them after', async () => {
    let finish!: () => void;
    setup({
      reads: { 'a.pdf': result({ title: 'A' }) },
      api: {
        createSongWithArrangement: vi.fn(
          () => new Promise<string>((resolve) => (finish = () => resolve('id'))),
        ),
      },
    });
    addFiles([pdf('a.pdf')]);
    const button = await screen.findByRole('button', { name: 'Importar 1 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('Importando 0 de 1…');
    expect(screen.getByRole('button', { name: 'Remover a.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Limpar lista' })).toBeDisabled();
    await act(async () => finish());
    await screen.findByText('1 importados · 0 já existiam · 0 com erro');
    expect(screen.getByRole('button', { name: 'Remover a.pdf' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Limpar lista' })).toBeEnabled();
  });

  it('disables list controls while reading', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { readPdf } = setup();
    vi.mocked(readPdf).mockImplementation(async (f: File) => {
      if (f.name === 'b.pdf') await gate;
      return result({ title: f.name });
    });
    addFiles([pdf('a.pdf'), pdf('b.pdf')]);
    expect(await screen.findByLabelText('Música de a.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover a.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Limpar lista' })).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Limpar lista' })).toBeEnabled());
  });

  it('Limpar lista empties rows, results and notices', async () => {
    setup({ reads: { 'a.pdf': result({ title: 'A' }) } });
    addFiles([pdf('a.pdf'), new File(['x'], 'n.txt', { type: 'text/plain' })]);
    const button = await screen.findByRole('button', { name: 'Importar 1 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('1 importados · 0 já existiam · 0 com erro');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar lista' }));
    expect(screen.queryByLabelText('Música de a.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText(/importados/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ignoramos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Limpar lista' })).not.toBeInTheDocument();
  });

  it('removing the last row resets the batch state like Limpar lista', async () => {
    setup({
      reads: { 'a.pdf': result({ title: 'A' }), 'b.pdf': result({ title: 'B' }) },
    });
    addFiles([pdf('a.pdf'), new File(['x'], 'n.txt', { type: 'text/plain' })]);
    const button = await screen.findByRole('button', { name: 'Importar 1 prontos' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText('1 importados · 0 já existiam · 0 com erro');
    fireEvent.click(screen.getByRole('button', { name: 'Remover a.pdf' }));
    expect(screen.queryByText(/importados/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ignoramos/)).not.toBeInTheDocument();
    addFiles([pdf('b.pdf')]);
    await screen.findByLabelText('Música de b.pdf');
    expect(screen.queryByText(/importados/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ignoramos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Importação cancelada/)).not.toBeInTheDocument();
  });

  it('does not mark the dropzone aria-disabled', async () => {
    setup();
    const zone = screen.getByText('Arraste PDFs ou uma pasta aqui').parentElement!;
    expect(zone).not.toHaveAttribute('aria-disabled');
  });
});
