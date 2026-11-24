import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { CallableError } from '../ministries/callable';
import type { MinistriesApi, PersonRow } from '../ministries/ministriesApi';
import { createFakeMinistriesApi } from '../test/fakeMinistriesApi';
import { PeoplePage } from './PeoplePage';

function person(
  uid: string,
  displayName: string,
  email: string,
  role?: 'member' | 'admin',
): PersonRow {
  return { uid, displayName, email, photoURL: null, role };
}

const requests: PersonRow[] = [
  {
    ...person('camila', 'Camila Moreira', 'camila.moreira@gmail.com'),
    createdAt: new Date(2026, 10, 22),
  },
  {
    ...person('tiago', 'Tiago Ferreira', 'tiago.ferreira@gmail.com'),
    createdAt: new Date(2026, 10, 23),
  },
];

const members: PersonRow[] = [
  person('lucas', 'Lucas Andrade', 'lucas@cifras.local', 'admin'),
  person('marina', 'Marina Souza', 'marina.s@gmail.com', 'member'),
  person('pedro', 'Pedro Lima', 'pedro.l@gmail.com', 'member'),
  person('ana', 'Ana Costa', 'ana.c@gmail.com', 'admin'),
];

type Overrides = Parameters<typeof createFakeMinistriesApi>[0];

function renderPage(
  overrides: Overrides = {},
  props: { selfUid?: string; appAdminView?: boolean } = {},
) {
  const api: MinistriesApi = createFakeMinistriesApi({
    listRequests: vi.fn(() => Promise.resolve(requests)),
    listMembers: vi.fn(() => Promise.resolve(members)),
    ...overrides,
  });
  const view = render(
    <MemoryRouter>
      <PeoplePage
        api={api}
        ministryId="hajaluz"
        ministryName="Haja Luz"
        selfUid={'selfUid' in props ? props.selfUid : 'lucas'}
        appAdminView={props.appAdminView ?? false}
      />
    </MemoryRouter>,
  );
  return { api, ...view };
}

function roleButton(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^Papel de ${name}:`) });
}

describe('PeoplePage: pedidos', () => {
  it('mostra nome, e-mail e a data do pedido', async () => {
    renderPage();
    expect(await screen.findByText('Camila Moreira')).toBeInTheDocument();
    expect(screen.getByText('camila.moreira@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Pediu em 22/11')).toBeInTheDocument();
    expect(screen.getByText('Pediu em 23/11')).toBeInTheDocument();
  });

  it('aprova sem confirmação, mostra o aviso e relê as listas', async () => {
    const { api } = renderPage();
    await screen.findByText('Camila Moreira');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Camila Moreira' }));
    expect(
      await screen.findByText('✓ Camila Moreira agora é membro de Haja Luz'),
    ).toBeInTheDocument();
    expect(api.callable.approve).toHaveBeenCalledWith('hajaluz', 'camila');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(api.listRequests).toHaveBeenCalledTimes(2));
  });

  it('recusa sem confirmação', async () => {
    const { api } = renderPage();
    await screen.findByText('Tiago Ferreira');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar Tiago Ferreira' }));
    await waitFor(() => expect(api.callable.reject).toHaveBeenCalledWith('hajaluz', 'tiago'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mostra o vazio quando não há pedidos', async () => {
    renderPage({ listRequests: () => Promise.resolve([]) });
    expect(await screen.findByText('Nenhum pedido pendente')).toBeInTheDocument();
    expect(
      screen.getByText('Quando alguém pedir para entrar, o pedido aparece aqui.'),
    ).toBeInTheDocument();
  });

  it('mostra a mensagem do servidor quando a aprovação é recusada', async () => {
    renderPage({
      callable: {
        approve: () =>
          Promise.reject(
            new CallableError(
              'failed-precondition',
              'Todo ministério precisa de pelo menos um admin.',
            ),
          ),
      },
    });
    await screen.findByText('Camila Moreira');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Camila Moreira' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Todo ministério precisa de pelo menos um admin.',
    );
  });

  it('erro genérico ao aprovar mostra o texto do pedido e "Tentar de novo" repete a ação', async () => {
    const approve = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(undefined);
    const { api } = renderPage({ callable: { approve } });
    await screen.findByText('Camila Moreira');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Camila Moreira' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível atualizar. O pedido continua pendente.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await screen.findByText('✓ Camila Moreira agora é membro de Haja Luz'),
    ).toBeInTheDocument();
    expect(api.callable.approve).toHaveBeenCalledTimes(2);
  });
});

describe('PeoplePage: membros', () => {
  it('mostra o total e o papel de cada pessoa', async () => {
    renderPage();
    expect(await screen.findByText('Marina Souza')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(roleButton('Marina Souza')).toHaveAccessibleName(
      'Papel de Marina Souza: Membro. Alterar',
    );
    expect(roleButton('Ana Costa')).toHaveAccessibleName('Papel de Ana Costa: Admin. Alterar');
    expect(roleButton('Marina Souza')).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('marca a própria linha com (você) e desabilita o seletor', async () => {
    renderPage();
    await screen.findByText('Lucas Andrade');
    expect(screen.getByText('(você)')).toBeInTheDocument();
    expect(roleButton('Lucas Andrade')).toHaveAttribute('aria-disabled', 'true');
  });

  it('na visão do admin da app não há (você) e o último admin fica desabilitado só para o admin do ministério', async () => {
    const { unmount } = renderPage({}, { selfUid: undefined, appAdminView: false });
    await screen.findByText('Lucas Andrade');
    expect(screen.queryByText('(você)')).not.toBeInTheDocument();
    expect(roleButton('Ana Costa')).not.toHaveAttribute('aria-disabled', 'true');
    unmount();
    renderPage({}, { selfUid: undefined, appAdminView: true });
    await screen.findByText('Lucas Andrade');
    expect(roleButton('Lucas Andrade')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('o último admin fica com o seletor desabilitado e a nota explica', async () => {
    const onlyAdmin = [
      person('lucas', 'Lucas Andrade', 'lucas@cifras.local', 'admin'),
      members[1]!,
    ];
    renderPage({ listMembers: () => Promise.resolve(onlyAdmin) }, { selfUid: 'marina' });
    await screen.findByText('Lucas Andrade');
    expect(roleButton('Lucas Andrade')).toHaveAttribute('aria-disabled', 'true');
    expect(
      screen.getByText(
        'Todo ministério precisa de pelo menos um admin. Só o admin da app pode remover o último.',
      ),
    ).toBeInTheDocument();
  });

  it('o menu tem "Tornar admin" para membro e "Tornar membro" para admin', async () => {
    renderPage();
    await screen.findByText('Marina Souza');
    fireEvent.click(roleButton('Marina Souza'));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Tornar admin' })).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Remover do ministério' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tornar admin' }));
    await screen.findByText('Marina Souza');
    fireEvent.click(roleButton('Ana Costa'));
    expect(screen.getByRole('menuitem', { name: 'Tornar membro' })).toBeInTheDocument();
  });

  it('Tornar admin chama setRole e relê as listas', async () => {
    const { api } = renderPage();
    await screen.findByText('Marina Souza');
    fireEvent.click(roleButton('Marina Souza'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tornar admin' }));
    await waitFor(() =>
      expect(api.callable.setRole).toHaveBeenCalledWith('hajaluz', 'marina', 'admin'),
    );
    await waitFor(() => expect(api.listMembers).toHaveBeenCalledTimes(2));
  });

  it('erro de papel mostra "Tente de novo" com o texto genérico', async () => {
    renderPage({
      callable: { setRole: () => Promise.reject(new Error('rede')) },
    });
    await screen.findByText('Marina Souza');
    fireEvent.click(roleButton('Marina Souza'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tornar admin' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar. Tente de novo.',
    );
  });

  it('remover pede confirmação; Cancelar não chama removeMember', async () => {
    const { api } = renderPage();
    await screen.findByText('Pedro Lima');
    fireEvent.click(roleButton('Pedro Lima'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover do ministério' }));
    const dialog = screen.getByRole('dialog', { name: 'Remover Pedro Lima de Haja Luz?' });
    expect(
      within(dialog).getByText(
        'Ele deixa de ver os repertórios e de receber os avisos da Haja Luz. Para voltar, precisa pedir de novo.',
      ),
    ).toBeInTheDocument();
    const cancel = within(dialog).getByRole('button', { name: 'Cancelar' });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.callable.removeMember).not.toHaveBeenCalled();
  });

  it('Remover, depois da confirmação, chama removeMember', async () => {
    const { api } = renderPage();
    await screen.findByText('Pedro Lima');
    fireEvent.click(roleButton('Pedro Lima'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover do ministério' }));
    const dialog = screen.getByRole('dialog', { name: 'Remover Pedro Lima de Haja Luz?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(api.callable.removeMember).toHaveBeenCalledWith('hajaluz', 'pedro'));
  });
});

describe('PeoplePage: carregamento e erro', () => {
  it('mostra esqueleto com aria-busy enquanto carrega', () => {
    const { container } = renderPage({ listRequests: () => new Promise(() => {}) });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('erro de carregamento tem "Tentar de novo" que relê', async () => {
    const listRequests = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(requests);
    renderPage({ listRequests });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar. Tente de novo.');
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Camila Moreira')).toBeInTheDocument();
  });
});

describe('PeoplePage: revisão (ordem, troca de ministério, foco e bloqueios)', () => {
  function tree(api: MinistriesApi, ministryId: string, selfUid?: string, appAdminView = false) {
    return (
      <MemoryRouter>
        <PeoplePage
          api={api}
          ministryId={ministryId}
          ministryName={ministryId === 'hajaluz' ? 'Haja Luz' : 'Videira'}
          selfUid={selfUid}
          appAdminView={appAdminView}
        />
      </MemoryRouter>
    );
  }

  function memberNames(): string[] {
    return screen
      .getAllByRole('button', { name: /^Papel de / })
      .map((b) => b.getAttribute('aria-label')!.replace(/^Papel de (.*): .*$/, '$1'));
  }

  it('põe a própria pessoa no topo e as demais por nome', async () => {
    renderPage({}, { selfUid: 'marina' });
    await screen.findByText('Marina Souza');
    expect(memberNames()).toEqual(['Marina Souza', 'Ana Costa', 'Lucas Andrade', 'Pedro Lima']);
  });

  it('troca de ministério no mesmo mount zera o estado e relê as listas', async () => {
    const api: MinistriesApi = createFakeMinistriesApi({
      listRequests: vi.fn((mid: string) => Promise.resolve(mid === 'hajaluz' ? requests : [])),
      listMembers: vi.fn(() => Promise.resolve(members)),
    });
    const view = render(tree(api, 'hajaluz', 'lucas'));
    await screen.findByText('Camila Moreira');
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar Camila Moreira' }));
    expect(
      await screen.findByText('✓ Camila Moreira agora é membro de Haja Luz'),
    ).toBeInTheDocument();

    view.rerender(tree(api, 'videira', 'lucas'));
    expect(await screen.findByText('Nenhum pedido pendente')).toBeInTheDocument();
    expect(
      screen.queryByText('✓ Camila Moreira agora é membro de Haja Luz'),
    ).not.toBeInTheDocument();
    expect(api.listRequests).toHaveBeenLastCalledWith('videira');
  });

  it('o último admin não fica bloqueado na visão do admin da app, e o menu abre', async () => {
    const onlyAdmin = [
      person('lucas', 'Lucas Andrade', 'lucas@cifras.local', 'admin'),
      members[1]!,
    ];
    renderPage(
      { listMembers: () => Promise.resolve(onlyAdmin) },
      { selfUid: undefined, appAdminView: true },
    );
    await screen.findByText('Lucas Andrade');
    const button = roleButton('Lucas Andrade');
    expect(button).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('a própria linha é bloqueada e não abre menu', async () => {
    renderPage();
    await screen.findByText('Lucas Andrade');
    fireEvent.click(roleButton('Lucas Andrade'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('recusar com falha mostra o texto do pedido', async () => {
    renderPage({ callable: { reject: () => Promise.reject(new Error('rede')) } });
    await screen.findByText('Tiago Ferreira');
    fireEvent.click(screen.getByRole('button', { name: 'Recusar Tiago Ferreira' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível atualizar. O pedido continua pendente.',
    );
  });

  it('"Tentar de novo" depois de falha ao remover chama removeMember de novo', async () => {
    const removeMember = vi
      .fn()
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce(undefined);
    const { api } = renderPage({ callable: { removeMember } });
    await screen.findByText('Pedro Lima');
    fireEvent.click(roleButton('Pedro Lima'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover do ministério' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(api.callable.removeMember).toHaveBeenCalledTimes(2));
    expect(api.callable.removeMember).toHaveBeenLastCalledWith('hajaluz', 'pedro');
  });

  it('foco volta para o seletor da linha depois de Tornar admin', async () => {
    renderPage();
    await screen.findByText('Marina Souza');
    fireEvent.click(roleButton('Marina Souza'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tornar admin' }));
    await waitFor(() => expect(roleButton('Marina Souza')).toHaveFocus());
  });

  it('foco volta para o seletor quando o diálogo de remover é cancelado', async () => {
    renderPage();
    await screen.findByText('Pedro Lima');
    fireEvent.click(roleButton('Pedro Lima'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover do ministério' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(roleButton('Pedro Lima')).toHaveFocus();
  });

  it('depois de remover confirmado, o foco vai para o título "Membros"', async () => {
    renderPage();
    await screen.findByText('Pedro Lima');
    fireEvent.click(roleButton('Pedro Lima'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remover do ministério' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Membros' })).toHaveFocus());
  });
});
