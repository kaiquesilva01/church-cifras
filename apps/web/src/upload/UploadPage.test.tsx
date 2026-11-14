import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../catalog/catalogApi';
import { fakeCatalogApi, makeSong, sampleSongs } from '../test/fakeCatalogApi';
import { UploadPage, type ReadPdf } from './UploadPage';

const baseResult = {
  chordCount: 12,
  suspects: [] as string[][],
  suggestion: {
    title: 'Sonda-me',
    artist: 'Aline Barros',
    key: 'G' as string | null,
    keySource: 'indicator' as const,
    swapped: false,
  },
};

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname + loc.search}</p>;
}

function setup(
  options: {
    result?: Partial<typeof baseResult> | 'fail';
    api?: Partial<CatalogApi>;
  } = {},
) {
  const api = fakeCatalogApi(sampleSongs, options.api);
  const readPdf: ReadPdf = vi.fn(() =>
    options.result === 'fail'
      ? Promise.reject(new Error('x'))
      : Promise.resolve({ ...baseResult, ...options.result }),
  );
  render(
    <MemoryRouter initialEntries={['/nova']}>
      <Routes>
        <Route path="/nova" element={<UploadPage api={api} readPdf={readPdf} />} />
        <Route path="/musicas/:id" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { api, readPdf };
}

function pick(name = 'Sonda-me - G.pdf', size = 1000) {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText(/Escolher/), { target: { files: [file] } });
  return file;
}

async function enabledButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

const existing = () => vi.fn(() => Promise.resolve(sampleSongs[0]!));

describe('UploadPage', () => {
  it('prefills fields from the pdf', async () => {
    setup();
    pick();
    expect(screen.getByText('Lendo PDF…')).toBeInTheDocument();
    expect(await screen.findByText('✓ Sonda-me - G.pdf · 12 acordes')).toBeInTheDocument();
    expect(screen.getByLabelText('Música')).toHaveValue('Sonda-me');
    expect(screen.getByLabelText('Cantor')).toHaveValue('Aline Barros');
    expect(screen.getByLabelText('Tom')).toHaveValue('G');
    expect(screen.getAllByText('· lido do PDF')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'Outra' } });
    expect(screen.getAllByText('· lido do PDF')).toHaveLength(2);
    await enabledButton('Salvar cifra');
  });

  it('blocks pdf without chords', async () => {
    setup({ result: { chordCount: 0 } });
    pick();
    expect(await screen.findByText('✕ Não encontramos acordes neste PDF.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Os acordes precisam estar em negrito, numa linha acima da letra. PDF escaneado ou imagem não funciona.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Escolher outro arquivo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Música')).not.toBeInTheDocument();
  });

  it('warns about suspect chords', async () => {
    setup({ result: { suspects: [['Xm7'], ['Bz']] } });
    pick();
    expect(
      await screen.findByText('Confira: não reconhecemos Xm7, Bz como acorde.'),
    ).toBeInTheDocument();
  });

  it('swaps title and artist', async () => {
    setup();
    pick();
    await screen.findByLabelText('Música');
    fireEvent.click(screen.getByRole('button', { name: '⇄ inverter música/cantor' }));
    expect(screen.getByLabelText('Música')).toHaveValue('Aline Barros');
    expect(screen.getByLabelText('Cantor')).toHaveValue('Sonda-me');
    await enabledButton('Salvar cifra');
  });

  it('validates required fields inline', async () => {
    setup({
      result: { suggestion: { ...baseResult.suggestion, title: '', artist: '', key: null } },
    });
    pick();
    await screen.findByLabelText('Música');
    expect(screen.getByLabelText('Tom')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cifra' }));
    expect(screen.getByText('Informe o nome da música.')).toBeInTheDocument();
    expect(screen.getByText('Informe o cantor.')).toBeInTheDocument();
    expect(screen.getByText('Escolha o tom.')).toBeInTheDocument();
  });

  it('rejects titles and artists with no letters or digits', async () => {
    setup();
    pick();
    await screen.findByLabelText('Música');
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: '!!! ---' } });
    fireEvent.change(screen.getByLabelText('Cantor'), { target: { value: '???' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cifra' }));
    expect(screen.getAllByText('Use letras ou números no nome.')).toHaveLength(2);
    expect(screen.getByLabelText('Música')).toHaveAttribute('aria-invalid', 'true');
  });

  it('limits title and artist to 120 characters', async () => {
    setup();
    pick();
    await screen.findByLabelText('Música');
    expect(screen.getByLabelText('Música')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Cantor')).toHaveAttribute('maxlength', '120');
  });

  it('offers add key for existing song', async () => {
    setup({ api: { findSong: existing(), getArrangement: vi.fn(() => Promise.resolve(null)) } });
    pick();
    expect(
      await screen.findByText('Essa música já existe. Vamos adicionar o tom G.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar tom G' })).toBeEnabled();
  });

  it('offers replace for generated key', async () => {
    setup({
      api: {
        findSong: existing(),
        getArrangement: vi.fn(() =>
          Promise.resolve({ source: 'generated' as const, storagePath: 'p' }),
        ),
      },
    });
    pick();
    expect(
      await screen.findByText(
        'Essa música já existe. O tom G foi gerado pelo sistema. O seu PDF feito à mão vai substituir o gerado.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Substituir tom G' })).toBeEnabled();
  });

  it('blocks when handmade key exists', async () => {
    setup({ api: { findSong: existing() } });
    pick();
    expect(
      await screen.findByText(
        'Essa música já tem um PDF feito à mão em G. Para trocar, peça a um admin para apagar o tom antes.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar cifra' })).toBeDisabled();
  });

  it('debounces the lookup and ignores stale responses', async () => {
    let resolveFirst: (s: ReturnType<typeof makeSong> | null) => void = () => undefined;
    const findSong = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockImplementation(() => Promise.resolve(null));
    setup({ api: { findSong } });
    pick();
    await screen.findByLabelText('Música');
    // first lookup (for the prefilled values) is pending forever; edit twice quickly
    await new Promise((r) => setTimeout(r, 350));
    expect(findSong).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'Ou' } });
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'Outra' } });
    await enabledButton('Salvar cifra');
    resolveFirst(sampleSongs[0]!);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Essa música já/)).not.toBeInTheDocument();
    expect(findSong).toHaveBeenCalledTimes(2);
    expect(findSong).toHaveBeenLastCalledWith('outra', 'aline-barros');
  });

  it('saves and navigates to the song', async () => {
    const { api } = setup();
    const file = pick();
    fireEvent.click(await enabledButton('Salvar cifra'));
    expect(await screen.findByTestId('where')).toHaveTextContent('/musicas/new-id?tom=G');
    expect(api.uploadPdf).toHaveBeenCalledWith('new-id', 'G', file);
    expect(api.createSongWithArrangement).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sonda-me',
        artistName: 'Aline Barros',
        key: 'G',
        chordCount: 12,
      }),
    );
  });

  it('shows conflict message when key was just saved', async () => {
    const addArrangement = vi.fn(() =>
      Promise.reject(Object.assign(new Error('x'), { code: 'permission-denied' })),
    );
    const getArrangement = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ source: 'handmade', storagePath: 'p' });
    setup({ api: { findSong: existing(), getArrangement, addArrangement } });
    pick();
    fireEvent.click(await enabledButton('Adicionar tom G'));
    expect(
      await screen.findByText('Esse tom acabou de ser salvo por outra pessoa.'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/já tem um PDF feito à mão em G/)).toBeInTheDocument();
  });

  it('shows a generic error when saving fails', async () => {
    setup({ api: { createSongWithArrangement: vi.fn(() => Promise.reject(new Error('boom'))) } });
    pick();
    fireEvent.click(await enabledButton('Salvar cifra'));
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeInTheDocument();
  });

  it('offers a retry when the lookup fails and recovers', async () => {
    const findSong = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null);
    setup({ api: { findSong } });
    pick();
    expect(await screen.findByText('Não foi possível verificar a música.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar cifra' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await enabledButton('Salvar cifra');
    expect(findSong).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Não foi possível verificar a música.')).not.toBeInTheDocument();
  });

  it('rechecks the lookup after a failed save', async () => {
    const findSong = vi.fn(() => Promise.resolve(null));
    const createSongWithArrangement = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue('new-id');
    setup({ api: { findSong, createSongWithArrangement } });
    pick();
    fireEvent.click(await enabledButton('Salvar cifra'));
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeInTheDocument();
    await waitFor(() => expect(findSong).toHaveBeenCalledTimes(2));
    fireEvent.click(await enabledButton('Salvar cifra'));
    await waitFor(() => expect(createSongWithArrangement).toHaveBeenCalledTimes(2));
  });

  it('shows the lookup state on the button', async () => {
    let finish: (song: null) => void = () => undefined;
    const findSong = vi.fn(() => new Promise<null>((resolve) => (finish = resolve)));
    setup({ api: { findSong } });
    pick();
    const button = await screen.findByRole('button', { name: 'Verificando…' });
    expect(button).toBeDisabled();
    await waitFor(() => expect(findSong).toHaveBeenCalled());
    finish(null);
    await enabledButton('Salvar cifra');
  });

  it('disables saving while a second pdf is being read', async () => {
    const { readPdf } = setup();
    pick();
    await enabledButton('Salvar cifra');
    let release: (value: typeof baseResult) => void = () => undefined;
    vi.mocked(readPdf).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    pick('b.pdf');
    expect(await screen.findByText('Lendo PDF…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar cifra' })).toBeDisabled();
    release(baseResult);
    await enabledButton('Salvar cifra');
  });

  it('rejects files over 10 MB', async () => {
    const { readPdf } = setup();
    pick('big.pdf', 10 * 1024 * 1024 + 1);
    expect(await screen.findByText('O PDF precisa ter até 10 MB.')).toBeInTheDocument();
    expect(readPdf).not.toHaveBeenCalled();
  });

  it('shows an error when the pdf cannot be read', async () => {
    setup({ result: 'fail' });
    pick();
    expect(await screen.findByText('Não foi possível ler este PDF.')).toBeInTheDocument();
  });

  it('keeps the filled form when a second file is too big', async () => {
    setup();
    pick();
    await screen.findByLabelText('Música');
    pick('big.pdf', 10 * 1024 * 1024 + 1);
    expect(await screen.findByText('O PDF precisa ter até 10 MB.')).toBeInTheDocument();
    expect(screen.getByLabelText('Música')).toHaveValue('Sonda-me');
  });

  it('keeps the filled form when a second file cannot be read', async () => {
    const { readPdf } = setup();
    pick();
    await screen.findByLabelText('Música');
    vi.mocked(readPdf).mockRejectedValueOnce(new Error('x'));
    pick('b.pdf');
    expect(await screen.findByText('Não foi possível ler este PDF.')).toBeInTheDocument();
    expect(screen.getByLabelText('Música')).toHaveValue('Sonda-me');
  });

  it('clears the save error when a field is edited', async () => {
    setup({ api: { createSongWithArrangement: vi.fn(() => Promise.reject(new Error('boom'))) } });
    pick();
    fireEvent.click(await enabledButton('Salvar cifra'));
    await screen.findByText('Não foi possível salvar. Tente de novo.');
    fireEvent.change(screen.getByLabelText('Música'), { target: { value: 'Outra' } });
    expect(screen.queryByText('Não foi possível salvar. Tente de novo.')).not.toBeInTheDocument();
  });

  it('moves focus to the key select when the mode clears the key', async () => {
    setup();
    pick();
    await screen.findByLabelText('Música');
    fireEvent.click(screen.getByRole('button', { name: 'Menor' }));
    expect(screen.getByLabelText('Tom')).toHaveFocus();
    expect(screen.getByLabelText('Tom')).toHaveValue('');
  });
});
