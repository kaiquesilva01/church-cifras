import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../../auth/useAuth';
import { setRemovedNotice } from '../../auth/removedNotice';
import { testUser } from '../../test/fakeGateway';
import { createFakeMinistriesApi } from '../../test/fakeMinistriesApi';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';
import { EntryPage } from './EntryPage';

const haja: MinistryItem = {
  id: 'hajaluz',
  name: 'Haja Luz',
  city: 'São Paulo',
  nameNormalized: 'haja luz',
};
const vida: MinistryItem = {
  id: 'vida',
  name: 'Vida Nova',
  city: 'Sumaré',
  nameNormalized: 'vida nova',
};

type Request = { ministryId: string; status: 'pending' | 'rejected' };

function fakeSubscribe(requests: Request[]) {
  return vi.fn((_uid: string, cb: (r: Request[]) => void) => {
    cb(requests);
    return () => {};
  });
}

function renderEntry({
  api,
  signOut = vi.fn(() => Promise.resolve()),
  strict = false,
}: {
  api: MinistriesApi;
  signOut?: () => Promise<void>;
  strict?: boolean;
}) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    access: 'blocked',
    appAdmin: false,
    canUploadSong: false,
    ministry: null,
    ministryFailed: false,
    ministryMissing: false,
    accessFailed: false,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut,
  };
  const page = (
    <AuthContext.Provider value={auth}>
      <EntryPage api={api} />
    </AuthContext.Provider>
  );
  render(strict ? <StrictMode>{page}</StrictMode> : page);
  return { signOut };
}

afterEach(() => {
  sessionStorage.clear();
});

describe('EntryPage', () => {
  it('lê a lista de ministérios uma vez, pela própria página', async () => {
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja, vida])),
      subscribeMyRequests: fakeSubscribe([]),
    });
    renderEntry({ api });
    expect(
      await screen.findByRole('button', { name: 'Pedir para entrar em Vida Nova, Sumaré' }),
    ).toBeInTheDocument();
    expect(api.listMinistries).toHaveBeenCalledTimes(1);
  });

  it('sem pedidos mostra a lista de escolha', async () => {
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([]),
    });
    renderEntry({ api });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
  });

  it('carregando os pedidos mostra o estado ocupado', () => {
    const api = createFakeMinistriesApi({
      subscribeMyRequests: vi.fn(() => () => {}),
    });
    renderEntry({ api });
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('pedido pendente mostra Pedido enviado com nome e cidade, depois de recarregar', async () => {
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([{ ministryId: 'hajaluz', status: 'pending' }]),
    });
    renderEntry({ api });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pedido enviado' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Haja Luz · São Paulo')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Um admin da Haja Luz precisa aprovar. Quando ele aprovar, o app abre sozinho; você não precisa sair e entrar.',
      ),
    ).toBeInTheDocument();
    expect(api.listMinistries).toHaveBeenCalledTimes(1);
  });

  it('Cancelar pedido chama cancelRequest com o ministério', async () => {
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([{ ministryId: 'hajaluz', status: 'pending' }]),
    });
    renderEntry({ api });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(api.callable.cancelRequest).toHaveBeenCalledWith('hajaluz'));
  });

  it('pedido recusado mostra o alerta e a lista de escolha', async () => {
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([{ ministryId: 'hajaluz', status: 'rejected' }]),
    });
    renderEntry({ api });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Seu pedido para Haja Luz não foi aprovado.',
    );
    expect(
      screen.getByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    ).toBeInTheDocument();
  });

  it('aviso de remoção aparece no primeiro render e o storage fica vazio depois do efeito', async () => {
    setRemovedNotice('Haja Luz');
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([]),
    });
    renderEntry({ api });
    expect(screen.getByText('Você não faz mais parte de Haja Luz.')).toBeInTheDocument();
    await act(async () => undefined);
    expect(sessionStorage.getItem('cifras:removido')).toBeNull();
  });

  it('aviso de remoção sobrevive ao StrictMode', async () => {
    setRemovedNotice('Haja Luz');
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([]),
    });
    renderEntry({ api, strict: true });
    expect(await screen.findByText('Você não faz mais parte de Haja Luz.')).toBeInTheDocument();
  });

  it('erro ao carregar ministérios mostra Tentar de novo, que lê de novo', async () => {
    const listMinistries = vi
      .fn<() => Promise<MinistryItem[]>>()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce([haja]);
    const api = createFakeMinistriesApi({ listMinistries, subscribeMyRequests: fakeSubscribe([]) });
    renderEntry({ api });
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    ).toBeInTheDocument();
    expect(listMinistries).toHaveBeenCalledTimes(2);
  });

  it('o aviso de remoção não é apagado antes de aparecer (pedidos ainda carregando)', () => {
    setRemovedNotice('Haja Luz');
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: vi.fn(() => () => {}),
    });
    renderEntry({ api });
    expect(sessionStorage.getItem('cifras:removido')).toBe('Haja Luz');
  });

  it('o aviso de remoção aparece no pedido enviado', async () => {
    setRemovedNotice('Vida Nova');
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: fakeSubscribe([{ ministryId: 'hajaluz', status: 'pending' }]),
    });
    renderEntry({ api });
    expect(await screen.findByText('Você não faz mais parte de Vida Nova.')).toBeInTheDocument();
    expect(sessionStorage.getItem('cifras:removido')).toBeNull();
  });

  it('depois de enviar o pedido, o foco vai para o título de Pedido enviado', async () => {
    let emit!: (r: Request[]) => void;
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: vi.fn((_uid, cb) => {
        emit = cb;
        cb([]);
        return () => {};
      }),
    });
    renderEntry({ api });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    await waitFor(() => expect(api.callable.requestAccess).toHaveBeenCalledWith('hajaluz'));
    act(() => emit([{ ministryId: 'hajaluz', status: 'pending' }]));
    expect(await screen.findByRole('heading', { level: 1, name: 'Pedido enviado' })).toHaveFocus();
  });

  it('a assinatura falha depois de pedir: o diálogo fecha e a escolha mostra o erro', async () => {
    let fail!: (e: unknown) => void;
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: vi.fn((_uid, cb, onError) => {
        fail = onError;
        cb([]);
        return () => {};
      }),
    });
    renderEntry({ api });
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    act(() => fail(new Error('rede')));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os seus pedidos.',
    );
    expect(
      screen.getByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    ).toBeInTheDocument();
  });

  it('Tentar de novo da assinatura refaz a leitura e a tela se recupera', async () => {
    const unsubscribe = vi.fn();
    const callbacks: Array<{ cb: (r: Request[]) => void; onError: (e: unknown) => void }> = [];
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: vi.fn((_uid, cb, onError) => {
        callbacks.push({ cb, onError });
        return unsubscribe;
      }),
    });
    renderEntry({ api });
    act(() => callbacks[0]!.onError(new Error('rede')));
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    expect(api.subscribeMyRequests).toHaveBeenCalledTimes(2);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    // Enquanto a nova leitura não chega, a tela é o esqueleto; quando chega, a escolha volta com foco no título.
    act(() => callbacks[1]!.cb([]));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toHaveFocus();

    act(() => callbacks[1]!.cb([{ ministryId: 'hajaluz', status: 'pending' }]));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pedido enviado' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cancelar o pedido devolve o foco ao título da escolha', async () => {
    let emit!: (r: Request[]) => void;
    const api = createFakeMinistriesApi({
      listMinistries: vi.fn(() => Promise.resolve([haja])),
      subscribeMyRequests: vi.fn((_uid, cb) => {
        emit = cb;
        cb([{ ministryId: 'hajaluz', status: 'pending' }]);
        return () => {};
      }),
    });
    renderEntry({ api });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar pedido' }));
    await waitFor(() => expect(api.callable.cancelRequest).toHaveBeenCalledWith('hajaluz'));
    act(() => emit([]));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toHaveFocus();
  });

  it('Sair chama signOut', async () => {
    const { signOut } = renderEntry({
      api: createFakeMinistriesApi({ subscribeMyRequests: fakeSubscribe([]) }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
