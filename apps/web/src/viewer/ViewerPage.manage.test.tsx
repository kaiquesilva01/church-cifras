import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { ViewerPage } from './ViewerPage';

vi.mock('./PdfPages', () => ({
  PdfPages: () => <div data-testid="pdf-pages" />,
}));

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const where = useLocation();
  const state = where.state as { notice?: string } | null;
  return (
    <output
      data-testid="location"
      data-notice={state?.notice ?? ''}
    >{`${where.pathname}${where.search}`}</output>
  );
}

function Page({ api }: { api: ReturnType<typeof fakeCatalogApi> }) {
  const { songId = '' } = useParams();
  const [params] = useSearchParams();
  return (
    <ViewerPage
      api={api}
      songId={songId}
      tomSlug={params.get('tom')}
      openPdf={vi.fn(() => Promise.resolve({ numPages: 1, destroy: vi.fn() })) as never}
      readLines={() => Promise.resolve([])}
    />
  );
}

const song = makeSong({
  id: 's1',
  title: 'Sonda-me',
  titleNormalized: 'sonda me',
  artistId: 'aline-barros',
  artistName: 'Aline Barros',
  keys: ['G', 'A'],
  handmadeKeys: ['G'],
});

function setup(role: Role = 'admin', overrides: Parameters<typeof fakeCatalogApi>[1] = {}) {
  const api = fakeCatalogApi([song], {
    updateSongMeta: vi.fn(() => Promise.resolve()),
    deleteArrangement: vi.fn(() => Promise.resolve()),
    deleteSong: vi.fn(() => Promise.resolve()),
    ...overrides,
  });
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/musicas/s1?tom=G']}>
        <Probe />
        <Routes>
          <Route
            path="/musicas/:songId"
            element={
              <SongsProvider api={api}>
                <Page api={api} />
              </SongsProvider>
            }
          />
          <Route path="/" element={<p>home</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return api;
}

const openMenu = async (item: string) => {
  fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
  fireEvent.click(screen.getByRole('menuitem', { name: item }));
  return screen.findByRole('dialog');
};

const codeError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('ViewerPage manage', () => {
  it('manage menu only for admins', async () => {
    setup('member');
    await screen.findByTestId('pdf-pages');
    expect(screen.queryByRole('button', { name: 'Gerenciar' })).not.toBeInTheDocument();
  });

  it('admin sees the menu items', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent);
    expect(items).toEqual(['Editar nome e cantor', 'Apagar tom G', 'Apagar música']);
  });

  it('edits song metadata', async () => {
    const api = setup();
    const dialog = await openMenu('Editar nome e cantor');
    expect(within(dialog).getByLabelText('Música')).toHaveValue('Sonda-me');
    fireEvent.change(within(dialog).getByLabelText('Cantor'), { target: { value: 'Outra' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Dados atualizados.')).toBeInTheDocument();
    expect(api.updateSongMeta).toHaveBeenCalledWith('s1', {
      title: 'Sonda-me',
      artistName: 'Outra',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('validates the edited names like the upload', async () => {
    const api = setup();
    const dialog = await openMenu('Editar nome e cantor');
    fireEvent.change(within(dialog).getByLabelText('Música'), { target: { value: ' ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within(dialog).getByText('Informe o nome da música.')).toBeInTheDocument();
    expect(api.updateSongMeta).not.toHaveBeenCalled();
  });

  it('shows already exists error', async () => {
    setup('admin', {
      updateSongMeta: vi.fn(() => Promise.reject(codeError('functions/already-exists', 'x'))),
    });
    const dialog = await openMenu('Editar nome e cantor');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Já existe uma música com esse nome e cantor.',
    );
  });

  it('closes the dialog with Escape and returns focus to the menu button', async () => {
    setup();
    await openMenu('Editar nome e cantor');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerenciar' })).toHaveFocus();
  });

  it('deletes a key and navigates to the remaining key', async () => {
    const api = setup();
    const dialog = await openMenu('Apagar tom G');
    expect(dialog).toHaveTextContent('Apagar o tom G de “Sonda-me”? O PDF será removido.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar tom' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?tom=A'));
    expect(api.deleteArrangement).toHaveBeenCalledWith('s1', 'G');
  });

  it('goes home when the deleted key was the last one', async () => {
    const only = makeSong({ id: 's1', title: 'Sonda-me', keys: ['G'], handmadeKeys: ['G'] });
    const api = fakeCatalogApi([only], { deleteArrangement: vi.fn(() => Promise.resolve()) });
    const auth: AuthState = {
      status: 'signed-in',
      user: testUser,
      role: 'admin',
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    };
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/musicas/s1?tom=G']}>
          <Probe />
          <Routes>
            <Route
              path="/musicas/:songId"
              element={
                <SongsProvider api={api}>
                  <Page api={api} />
                </SongsProvider>
              }
            />
            <Route path="/" element={<p>home</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Gerenciar' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar tom G' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Apagar tom' }),
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
  });

  it('shows last handmade error', async () => {
    setup('admin', {
      deleteArrangement: vi.fn(() =>
        Promise.reject(
          codeError(
            'functions/failed-precondition',
            'Não é possível apagar o último PDF feito à mão enquanto houver tons gerados.',
          ),
        ),
      ),
    });
    const dialog = await openMenu('Apagar tom G');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar tom' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Não é possível apagar o último PDF feito à mão enquanto houver tons gerados.',
    );
    expect(screen.getByTestId('location')).toHaveTextContent('?tom=G');
  });

  it('delete song requires typing the title', async () => {
    const api = setup();
    const dialog = await openMenu('Apagar música');
    const button = within(dialog).getByRole('button', { name: 'Apagar música' });
    expect(button).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Digite o título/), {
      target: { value: 'sonda' },
    });
    expect(button).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Digite o título/), {
      target: { value: 'SONDA-ME' },
    });
    expect(button).toBeEnabled();
    expect(api.deleteSong).not.toHaveBeenCalled();
  });

  it('deletes song and returns home', async () => {
    const api = setup();
    const dialog = await openMenu('Apagar música');
    fireEvent.change(within(dialog).getByLabelText(/Digite o título/), {
      target: { value: 'sonda me' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apagar música' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/));
    expect(api.deleteSong).toHaveBeenCalledWith('s1');
    expect(screen.getByTestId('location')).toHaveAttribute('data-notice', 'Música apagada.');
  });
});
