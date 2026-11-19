import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi, makeSong, sampleSongs } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { fakeSetlistApi, makeSetlist } from '../test/fakeSetlistApi';
import { stubShare, unstubShare } from '../test/shareStub';
import { ActiveSetlistProvider } from './ActiveSetlistProvider';
import { SetlistFullError } from './ops';
import { SetlistGoneError } from './setlistApi';
import { SetlistPage } from './SetlistPage';
import type { Setlist, SetlistItem } from './types';

const a: SetlistItem = { id: 'a', songId: 's1', key: 'G' };
const b: SetlistItem = { id: 'b', songId: 's2', key: 'F#m' };
const c: SetlistItem = { id: 'c', songId: 's3', key: 'D' };

function Home() {
  const { search, state } = useLocation();
  return (
    <p data-testid="home">
      {search}|{(state as { notice?: string } | null)?.notice ?? ''}
    </p>
  );
}
function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function mount(
  api: ReturnType<typeof fakeSetlistApi>,
  {
    role = 'member',
    path = '/repertorios/r1',
    songs = sampleSongs,
    catalog,
  }: Record<string, unknown> = {},
) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: role as Role,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path as string]}>
        <SongsProvider
          api={
            (catalog as ReturnType<typeof fakeCatalogApi>) ??
            fakeCatalogApi(songs as typeof sampleSongs)
          }
        >
          <ActiveSetlistProvider api={api}>
            <Probe />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/repertorios/:id" element={<SetlistPage api={api} />} />
            </Routes>
          </ActiveSetlistProvider>
        </SongsProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const withItems = (items: SetlistItem[], extra: Partial<Setlist> = {}) =>
  fakeSetlistApi([makeSetlist({ id: 'r1', label: 'Culto de domingo', items, ...extra })]);
const order = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('SetlistPage read', () => {
  it('shows items in order with number, linked title and key', () => {
    mount(withItems([a, b, c]));
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('1');
    expect(within(rows[0]!).getByRole('link', { name: 'Sonda-me' })).toHaveAttribute(
      'href',
      '/musicas/s1?tom=G&repertorio=r1&item=a',
    );
    expect(rows[0]).toHaveTextContent('G');
    expect(rows[1]).toHaveTextContent('Ressuscita-me');
    expect(rows[2]).toHaveTextContent('Grande é o Senhor');
  });

  it('shows Carregando… while loading', () => {
    const api = fakeSetlistApi([], { subscribeSetlist: () => () => undefined });
    mount(api);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
  });

  it('shows not found with a link back', () => {
    mount(fakeSetlistApi());
    expect(screen.getByText('Repertório não encontrado.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar|repertórios/ })).toHaveAttribute(
      'href',
      '/?aba=repertorios',
    );
  });

  it('shows a removed song without link', () => {
    mount(withItems([{ id: 'x', songId: 'gone', key: 'C' }]));
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('Música removida');
    expect(row).toHaveTextContent('✕');
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
  });

  it('strikes through a key that no longer exists but still links', () => {
    mount(withItems([{ id: 'x', songId: 's1', key: 'C' }]));
    const row = screen.getByRole('listitem');
    expect(row.querySelector('s')).toHaveTextContent('C');
    expect(within(row).getByRole('link', { name: 'Sonda-me' })).toBeInTheDocument();
  });

  it('keeps the list and shows a notice when the setlist is removed', () => {
    const api = withItems([a, b]);
    mount(api);
    act(() => api.push('r1', { setlist: null, fromCache: false }));
    expect(screen.getByText('Este repertório foi removido.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar aos repertórios' })).toHaveAttribute(
      'href',
      '/?aba=repertorios',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
  });

  it('only changes the list after Atualizar', () => {
    const api = withItems([a, b]);
    mount(api);
    expect(screen.queryByText('O repertório foi alterado.')).not.toBeInTheDocument();
    act(() =>
      api.push('r1', { setlist: makeSetlist({ id: 'r1', items: [b, a] }), fromCache: false }),
    );
    // dnd-kit adds its own role=status live region, so look the banner up by text.
    expect(screen.getByText('O repertório foi alterado.')).toBeInTheDocument();
    expect(order()[0]).toContain('Sonda-me');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(order()[0]).toContain('Ressuscita-me');
    expect(screen.queryByText('O repertório foi alterado.')).not.toBeInTheDocument();
  });
});

describe('SetlistPage catalog error', () => {
  it('shows an alert instead of claiming songs were removed', async () => {
    const catalog = fakeCatalogApi(sampleSongs, {
      subscribeSongs: (_cb, onError) => {
        onError(new Error('boom'));
        return () => undefined;
      },
    });
    mount(withItems([a, b]), { catalog });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar as músicas.',
    );
    expect(screen.queryByText('Música removida')).not.toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    expect(screen.queryByText(/Adicionar/)).not.toBeInTheDocument();
  });
});

describe('SetlistPage visitor', () => {
  it('has no editing controls and the key is not a button', () => {
    mount(withItems([a, b]), { role: 'viewer' });
    // O único botão para visitante é o de compartilhar.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Compartilhar repertório' })).toBeInTheDocument();
    expect(screen.queryByText(/Adicionar/)).not.toBeInTheDocument();
    expect(screen.queryByText('≡')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('G');
  });
});

describe('SetlistPage editing', () => {
  it('shows a drag handle per item for editors', async () => {
    mount(withItems([a, b]));
    const handle = await screen.findByRole('button', { name: 'Arrastar Sonda-me' });
    expect(handle).toHaveTextContent('≡');
    expect(screen.getAllByRole('button', { name: /^Arrastar / })).toHaveLength(2);
  });

  it('has no up/down buttons: reordering is only by the drag handle', () => {
    mount(withItems([a, b, c]));
    expect(screen.queryByRole('button', { name: /^Mover / })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Arrastar / })).toHaveLength(3);
  });

  it('removes an item', async () => {
    const api = withItems([a, b]);
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Sonda-me' }));
    expect(api.applyOp).toHaveBeenCalledWith('r1', { type: 'remove', itemId: 'a' });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });

  it('changes the key through the picker', async () => {
    const api = withItems([a]);
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: /Tom G/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('button', { name: /^(G|A)$/ })).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: 'A' }));
    expect(api.applyOp).toHaveBeenCalledWith('r1', { type: 'setKey', itemId: 'a', key: 'A' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    [
      'noop',
      () => Promise.resolve({ setlist: makeSetlist({ id: 'r1', items: [a] }), changed: false }),
      'Esse item já tinha sido alterado por outra pessoa.',
    ],
    [
      'full',
      () => Promise.reject(new SetlistFullError()),
      'O repertório está cheio (40 louvores).',
    ],
    ['gone', () => Promise.reject(new SetlistGoneError()), 'Este repertório foi removido.'],
  ])('reports %s', async (_name, applyOp, text) => {
    const failing = fakeSetlistApi([makeSetlist({ id: 'r1', items: [a, b] })], {
      applyOp: vi.fn(applyOp as never),
    });
    mount(failing);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Sonda-me' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });

  it('adds from the sheet and keeps it open', async () => {
    const api = withItems([]);
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: '＋ Adicionar' }));
    fireEvent.click(screen.getByRole('button', { name: /Sonda-me/ }));
    expect(api.applyOp).toHaveBeenCalledWith('r1', {
      type: 'add',
      item: { id: expect.any(String) as string, songId: 's1', key: 'G' },
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1));
  });

  it('uses songs from the catalog for the sheet (no PDF disabled)', () => {
    mount(withItems([]), {
      songs: [makeSong({ id: 'n', title: 'Sem PDF', titleNormalized: 'sem pdf' })],
    });
    fireEvent.click(screen.getByRole('button', { name: '＋ Adicionar' }));
    expect(screen.getByRole('button', { name: /Sem PDF/ })).toBeDisabled();
  });
});

describe('SetlistPage menu', () => {
  const openMenu = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Menu do repertório' }));

  it('edits date and label', async () => {
    const api = withItems([a]);
    mount(api);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar data e rótulo' }));
    fireEvent.change(screen.getByLabelText('Rótulo'), { target: { value: 'Novo nome' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(api.updateSetlistMeta).toHaveBeenCalledWith('r1', {
        date: '2026-11-20',
        label: 'Novo nome',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Novo nome');
    expect(screen.getByText('sexta-feira · 20/11')).toBeInTheDocument();
    expect(screen.queryByText('O repertório foi alterado.')).not.toBeInTheDocument();
  });

  it('shows API errors inside the dialog', async () => {
    const api = fakeSetlistApi([makeSetlist({ id: 'r1', items: [a] })], {
      updateSetlistMeta: vi.fn(() => Promise.reject(new Error('x'))),
    });
    mount(api);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar data e rótulo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toBeInTheDocument();
  });

  it('announces an unavailable key to screen readers', () => {
    // s1 only has G and A: D is gone.
    mount(withItems([{ id: 'a', songId: 's1', key: 'D' }]));
    expect(
      screen.getByRole('button', { name: 'Tom D (indisponível), alterar' }),
    ).toBeInTheDocument();
    cleanup();
    mount(withItems([{ id: 'a', songId: 's1', key: 'D' }]), { role: 'viewer' });
    expect(screen.getByText('(tom indisponível)')).toBeInTheDocument();
  });

  it('does not show the update banner for the own edit still in flight', () => {
    const api = fakeSetlistApi([makeSetlist({ id: 'r1', items: [a, b, c] })], {
      applyOp: vi.fn(() => new Promise<never>(() => {})),
    });
    mount(api);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Sonda-me' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByText('O repertório foi alterado.')).not.toBeInTheDocument();
  });

  it('duplicates with new item ids and navigates', async () => {
    const api = withItems([a, b]);
    mount(api);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.createSetlist).toHaveBeenCalled());
    const input = (api.createSetlist as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      items: SetlistItem[];
      date: string;
      label: string;
    };
    expect(input.items.map((i) => i.songId)).toEqual(['s1', 's2']);
    expect(input.items[0]!.id).not.toBe('a');
    // The copy is for a new service: it must not inherit the old date/label.
    expect(input.label).not.toBe('Culto de domingo');
    expect(input.date).not.toBe('2026-11-20');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/repertorios/new-1'));
  });

  it('deletes after confirming and goes home with a notice', async () => {
    const api = withItems([a]);
    mount(api);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Apagar' }));
    expect(api.deleteSetlist).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar repertório' }));
    await waitFor(() => expect(api.deleteSetlist).toHaveBeenCalledWith('r1'));
    expect(await screen.findByTestId('home')).toHaveTextContent(
      '?aba=repertorios|Repertório apagado.',
    );
  });

  it('is hidden for visitors', () => {
    mount(withItems([a]), { role: 'viewer' });
    expect(screen.queryByRole('button', { name: 'Menu do repertório' })).not.toBeInTheDocument();
  });
});

describe('SetlistPage share button', () => {
  const shareButton = () => screen.queryByRole('button', { name: 'Compartilhar repertório' });
  const withMissing = () => withItems([a, { id: 'x', songId: 'gone', key: 'C' }, b]);

  afterEach(() => {
    unstubShare();
    delete (navigator as { clipboard?: unknown }).clipboard;
  });

  it.each(['viewer', 'member', 'admin'] as const)('shows it for %s', (role) => {
    mount(withItems([a]), { role });
    expect(shareButton()).toBeInTheDocument();
  });

  it('hides it when the setlist was removed', () => {
    const api = withItems([a]);
    mount(api);
    act(() => api.push('r1', { setlist: null, fromCache: false }));
    expect(shareButton()).not.toBeInTheDocument();
  });

  it('shares the message through Web Share, with the link inside the text only', async () => {
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {});
    stubShare({ share });
    mount(withMissing(), { role: 'viewer' });
    fireEvent.click(shareButton()!);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const arg = share.mock.calls[0]?.[0];
    expect(arg).toEqual({
      text: [
        '🎵 *Culto de domingo* — 20/11',
        '1. Sonda-me (G)',
        '2. Ressuscita-me (F#m)',
        `${window.location.origin}/repertorios/r1`,
      ].join('\n'),
    });
    expect(arg).not.toHaveProperty('url');
  });

  it('ignores a cancelled share sheet silently', async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'AbortError');
      },
    });
    mount(withItems([a]));
    await act(async () => {
      fireEvent.click(shareButton()!);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('Link copiado.')).not.toBeInTheDocument();
  });

  it('shows an alert when sharing fails', async () => {
    stubShare({
      share: async () => {
        throw new DOMException('x', 'NotAllowedError');
      },
    });
    mount(withItems([a]));
    fireEvent.click(shareButton()!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível compartilhar.');
  });

  it('copies the message and confirms when Web Share is missing (computer)', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mount(withItems([a]));
    fireEvent.click(shareButton()!);
    expect(await screen.findByText('Link copiado.')).toHaveAttribute('role', 'status');
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/repertorios/r1'));
  });

  it('hides the copied confirmation as soon as the next tap starts', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(new Promise(() => undefined));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mount(withItems([a]));
    fireEvent.click(shareButton()!);
    expect(await screen.findByText('Link copiado.')).toBeInTheDocument();
    fireEvent.click(shareButton()!);
    expect(screen.queryByText('Link copiado.')).not.toBeInTheDocument();
  });

  it('hides the copied confirmation by itself after a few seconds', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
      mount(withItems([a]));
      await act(async () => {
        fireEvent.click(shareButton()!);
      });
      expect(screen.getByText('Link copiado.')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText('Link copiado.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the error alert when the clipboard fails too', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
    mount(withItems([a]));
    fireEvent.click(shareButton()!);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível compartilhar.');
  });
});

describe('SetlistPage read-only view (Paper 13)', () => {
  const NOTE = 'Somente leitura · só membros e admins editam o repertório';

  it('shows the song count under the title', () => {
    mount(withItems([a, b]), { role: 'viewer' });
    const title = screen.getByRole('heading', { level: 1, name: 'Culto de domingo' });
    expect(title.nextElementSibling).toHaveTextContent('2 louvores');
  });

  it('uses the singular for a single louvor', () => {
    mount(withItems([a]), { role: 'viewer' });
    expect(screen.getByText('1 louvor')).toBeInTheDocument();
  });

  it('keeps the name as the link without the chevron inside it', () => {
    mount(withItems([a]), { role: 'viewer' });
    const link = screen.getByRole('link', { name: 'Sonda-me' });
    expect(link).toHaveAttribute('href', '/musicas/s1?tom=G&repertorio=r1&item=a');
    expect(link.querySelector('svg')).toBeNull();
    // The grey chevron sits at the right edge of the row, after the key pill.
    const row = screen.getAllByRole('listitem')[0]!;
    expect(row.querySelector('.setlist-item-chevron svg')).not.toBeNull();
  });

  it('shows the key as a read-only pill, not a button', () => {
    mount(withItems([a]), { role: 'viewer' });
    const row = screen.getByRole('listitem');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(row.querySelector('.setlist-item-key')).toHaveTextContent('G');
  });

  it('keeps a removed song dashed and without link or chevron', () => {
    mount(withItems([{ id: 'x', songId: 'gone', key: 'C' }]), { role: 'viewer' });
    const row = screen.getByRole('listitem');
    expect(row).toHaveClass('setlist-item-missing');
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(row.querySelector('.setlist-item-chevron')).toBeNull();
  });

  it('ends the list with the read-only note for visitors', () => {
    mount(withItems([a]), { role: 'viewer' });
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it('keeps the edit screen as it is: no count line and no read-only note for editors', () => {
    mount(withItems([a, b]), { role: 'member' });
    expect(screen.queryByText('2 louvores')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me' }).querySelector('svg')).not.toBeNull();
  });
});
