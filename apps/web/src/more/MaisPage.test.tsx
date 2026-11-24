import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState, type MinistryRole } from '../auth/useAuth';
import type { MinistriesApi } from '../ministries/ministriesApi';
import { PushContext, type PushService } from '../push/types';
import { authStateFor } from '../test/authState';
import { createFakeMinistriesApi } from '../test/fakeMinistriesApi';
import { MaisPage } from './MaisPage';

interface Options {
  /** Vínculo no ministério (padrão: membro). `null`: sem vínculo. */
  ministry?: MinistryRole | null;
  appAdmin?: boolean;
  canUploadSong?: boolean;
  ministryPending?: boolean;
  ministryFailed?: boolean;
  push?: PushService | null;
  api?: MinistriesApi;
  signOut?: () => Promise<void>;
}

function renderMais(options: Options = {}) {
  const api = options.api ?? createFakeMinistriesApi();
  const signOut = options.signOut ?? vi.fn(() => Promise.resolve());
  const ui = (o: Options) => {
    const base = authStateFor(o.ministry === undefined ? 'member' : o.ministry);
    const auth: AuthState = {
      ...base,
      appAdmin: o.appAdmin ?? false,
      canUploadSong: o.canUploadSong ?? base.canUploadSong,
      ministryPending: o.ministryPending ?? false,
      ministryFailed: o.ministryFailed ?? false,
      signOut,
    };
    return (
      <MemoryRouter>
        <AuthContext.Provider value={auth}>
          <PushContext.Provider value={o.push ?? null}>
            <MaisPage api={api} />
          </PushContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    );
  };
  const view = render(ui(options));
  // Troca o estado (ex.: ministério carregou) sem desmontar a tela: o quadro é o mesmo nó.
  return {
    api,
    signOut,
    container: view.container,
    rerender: (o: Options) => view.rerender(ui(o)),
  };
}

const pushService = (): PushService => ({
  load: vi.fn(async () => 'available' as const),
  enable: vi.fn(async () => 'active' as const),
  disable: vi.fn(async () => 'available' as const),
  sendTest: vi.fn(async () => 'sent' as const),
  revalidate: vi.fn(async () => {}),
  forgetDevice: vi.fn(async () => {}),
});

describe('MaisPage perfil', () => {
  it('mostra nome, e-mail e o papel no ministério', () => {
    renderMais({ ministry: 'member' });
    expect(screen.getByRole('heading', { level: 1, name: 'Mais' })).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('Haja Luz · Membro')).toHaveClass('role-badge--member');
  });

  it('mostra "Haja Luz · Admin" para admin do ministério', () => {
    renderMais({ ministry: 'admin' });
    expect(screen.getByText('Haja Luz · Admin')).toHaveClass('role-badge--admin');
  });

  it('admin da app com ministério vê as duas pílulas, "Admin da app" primeiro', () => {
    renderMais({ ministry: 'admin', appAdmin: true });
    const app = screen.getByText('Admin da app');
    const admin = screen.getByText('Haja Luz · Admin');
    expect(app).toHaveClass('role-badge--app');
    expect(app.compareDocumentPosition(admin) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('admin da app sem ministério vê só "Admin da app"', () => {
    renderMais({ ministry: null, appAdmin: true });
    expect(screen.getByText('Admin da app')).toBeInTheDocument();
    expect(screen.queryByText(/Haja Luz/)).not.toBeInTheDocument();
  });

  it('mostra o erro do ministério no lugar da pílula quando o documento falha', () => {
    renderMais({ ministry: null, ministryFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o ministério.');
    expect(screen.queryByText(/· Membro|· Admin/)).not.toBeInTheDocument();
  });

  it('não mostra pílula de ministério enquanto o ministério carrega', () => {
    renderMais({ ministry: null, ministryPending: true });
    expect(screen.queryByText(/· Membro|· Admin/)).not.toBeInTheDocument();
  });
});

describe('MaisPage linhas por papel', () => {
  it('membro vê só Avisos e Sair', () => {
    renderMais({ ministry: 'member', push: pushService() });
    expect(screen.getByText('Avisos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pessoas do ministério/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Estatísticas do ministério/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Importar/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Gestão/ })).not.toBeInTheDocument();
  });

  it('não mostra a linha "Pessoas · Em breve" para ninguém', () => {
    renderMais({ ministry: 'admin', appAdmin: true, push: pushService() });
    expect(screen.queryByText('Em breve')).not.toBeInTheDocument();
    expect(screen.queryByText('Pessoas')).not.toBeInTheDocument();
  });

  it('admin do ministério vê Pessoas, Estatísticas e Importar com textos de apoio', () => {
    renderMais({ ministry: 'admin', canUploadSong: true });
    const pessoas = screen.getByRole('link', { name: /^Pessoas do ministério/ });
    expect(pessoas).toHaveAttribute('href', '/pessoas');
    expect(pessoas).toHaveTextContent('Pedidos de entrada e membros da Haja Luz');
    const stats = screen.getByRole('link', { name: /^Estatísticas do ministério/ });
    expect(stats).toHaveAttribute('href', '/estatisticas');
    expect(stats).toHaveTextContent('Cifras mais usadas nos repertórios da Haja Luz');
    const importar = screen.getByRole('link', { name: /Importar/ });
    expect(importar).toHaveAttribute('href', '/importar');
    expect(importar).toHaveTextContent('Importar várias cifras em PDF de uma vez');
  });

  it('admin do ministério sem canUpload não vê Importar', () => {
    renderMais({ ministry: 'admin', canUploadSong: false });
    expect(screen.getByRole('link', { name: /^Pessoas do ministério/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Importar/ })).not.toBeInTheDocument();
  });

  it('admin da app sem ministério vê só Gestão e Sair, sem Avisos', () => {
    renderMais({ ministry: null, appAdmin: true, push: pushService() });
    const gestao = screen.getByRole('link', { name: /Gestão/ });
    expect(gestao).toHaveAttribute('href', '/gestao');
    expect(gestao).toHaveTextContent('Pedidos, ministérios e estatísticas da app');
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pessoas do ministério/ })).not.toBeInTheDocument();
  });

  it('nenhuma linha do ministério aparece enquanto o ministério carrega', () => {
    const { api } = renderMais({ ministry: null, ministryPending: true, push: pushService() });
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Pessoas do ministério/ })).not.toBeInTheDocument();
    expect(api.countPending).not.toHaveBeenCalled();
  });

  it('nenhuma linha do ministério aparece quando o documento falha', () => {
    renderMais({ ministry: null, ministryFailed: true, push: pushService() });
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Estatísticas do ministério/ }),
    ).not.toBeInTheDocument();
  });

  it('sair encerra a sessão', () => {
    const { signOut } = renderMais({ ministry: 'member' });
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('tem o botão de tema', () => {
    renderMais({ ministry: null });
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });
});

describe('MaisPage contadores de pedidos', () => {
  it('mostra o total de Pessoas do ministério com aria-label completo', async () => {
    const api = createFakeMinistriesApi({ countPending: vi.fn(() => Promise.resolve(3)) });
    renderMais({ ministry: 'admin', api });
    expect(await screen.findByText('3')).toHaveClass('count-badge');
    expect(api.countPending).toHaveBeenCalledWith('hajaluz');
    expect(
      screen.getByRole('link', { name: 'Pessoas do ministério, 3 pedidos pendentes' }),
    ).toBeInTheDocument();
  });

  it('usa o singular para um pedido', async () => {
    const api = createFakeMinistriesApi({ countPending: vi.fn(() => Promise.resolve(1)) });
    renderMais({ ministry: 'admin', api });
    expect(await screen.findByText('1')).toHaveClass('count-badge');
    expect(
      screen.getByRole('link', { name: 'Pessoas do ministério, 1 pedido pendente' }),
    ).toBeInTheDocument();
  });

  it('some com zero pedidos', async () => {
    const api = createFakeMinistriesApi({ countPending: vi.fn(() => Promise.resolve(0)) });
    const { container } = renderMais({ ministry: 'admin', api });
    await act(async () => {});
    expect(api.countPending).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.count-badge')).toBeNull();
  });

  it('falha ao contar tenta de novo uma vez e, sem sucesso, não mostra badge nem zero', async () => {
    const api = createFakeMinistriesApi({
      countPending: vi.fn(() => Promise.reject(new Error('rede'))),
    });
    const { container } = renderMais({ ministry: 'admin', api });
    await waitFor(() => expect(api.countPending).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => {});
    expect(container.querySelector('.count-badge')).toBeNull();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Pessoas do ministério/ })).toHaveAttribute(
      'href',
      '/pessoas',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('na segunda tentativa que dá certo, mostra o total', async () => {
    const countPending = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(2);
    const api = createFakeMinistriesApi({ countPending });
    renderMais({ ministry: 'admin', api });
    expect(await screen.findByText('2', {}, { timeout: 3000 })).toHaveClass('count-badge');
    expect(countPending).toHaveBeenCalledTimes(2);
  });

  it('falha ao contar a Gestão não mostra badge nem zero', async () => {
    const api = createFakeMinistriesApi({
      countPendingAll: vi.fn(() => Promise.reject(new Error('rede'))),
    });
    const { container } = renderMais({ ministry: null, appAdmin: true, api });
    await waitFor(() => expect(api.countPendingAll).toHaveBeenCalledTimes(2), { timeout: 3000 });
    await act(async () => {});
    expect(container.querySelector('.count-badge')).toBeNull();
    expect(screen.getByRole('link', { name: /^Gestão/ })).toBeInTheDocument();
  });

  it('nunca mostra zero enquanto o contador não chegou', () => {
    const api = createFakeMinistriesApi({
      countPending: vi.fn(() => new Promise<number>(() => {})),
    });
    const { container } = renderMais({ ministry: 'admin', api });
    expect(container.querySelector('.count-badge')).toBeNull();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('mostra 99+ acima de 99 pedidos', async () => {
    const api = createFakeMinistriesApi({ countPending: vi.fn(() => Promise.resolve(120)) });
    renderMais({ ministry: 'admin', api });
    expect(await screen.findByText('99+')).toHaveClass('count-badge');
  });

  it('a Gestão mostra os pedidos de todos os ministérios', async () => {
    const api = createFakeMinistriesApi({ countPendingAll: vi.fn(() => Promise.resolve(5)) });
    renderMais({ ministry: null, appAdmin: true, api });
    expect(await screen.findByText('5')).toHaveClass('count-badge');
    expect(api.countPendingAll).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Gestão, 5 pedidos pendentes' })).toBeInTheDocument();
  });

  it('membro comum não consulta contadores', () => {
    const { api } = renderMais({ ministry: 'member' });
    expect(api.countPending).not.toHaveBeenCalled();
    expect(api.countPendingAll).not.toHaveBeenCalled();
  });
});

describe('MaisPage carregamento do ministério', () => {
  it('mostra o esqueleto com "Carregando…" para leitor de tela', () => {
    const { container } = renderMais({ ministry: null, ministryPending: true });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
  });

  it('admin da app: carregando → sem ministério mantém Aplicativo, Gestão e Sair', () => {
    const { rerender, container } = renderMais({
      ministry: null,
      ministryPending: true,
      appAdmin: true,
      push: pushService(),
    });
    expect(screen.getByText('Aplicativo')).toBeInTheDocument();
    const gestao = screen.getByRole('link', { name: /^Gestão/ });
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(container.querySelector('.mn-skeleton-eyebrow')).not.toBeNull();

    rerender({ ministry: null, appAdmin: true, push: pushService() });
    expect(screen.getByText('Aplicativo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Gestão/ })).toBe(gestao);
    expect(screen.getByRole('button', { name: /Sair/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.querySelector('.mn-skeleton-eyebrow')).toBeNull();
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
  });

  it('admin da app: carregando → ministério carregado põe o eyebrow sem mover a Gestão', () => {
    const { rerender, container } = renderMais({
      ministry: null,
      ministryPending: true,
      appAdmin: true,
    });
    const gestao = screen.getByRole('link', { name: /^Gestão/ });
    expect(container.querySelector('.mn-skeleton-eyebrow')).not.toBeNull();

    rerender({ ministry: 'admin', appAdmin: true, canUploadSong: true });
    expect(screen.getByRole('link', { name: /^Gestão/ })).toBe(gestao);
    expect(screen.getByText('Aplicativo')).toBeInTheDocument();
    expect(screen.getByText('Haja Luz')).toHaveClass('section-eyebrow');
    expect(screen.getByRole('link', { name: /^Pessoas do ministério/ })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
