import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeMinistriesApi } from '../../test/fakeMinistriesApi';
import type { MinistryItem } from '../ministriesApi';
import { EntryChoose } from './EntryChoose';

const catalog: MinistryItem[] = [
  { id: 'hajaluz', name: 'Haja Luz', city: 'São Paulo', nameNormalized: 'haja luz' },
  { id: 'vida', name: 'Vida Nova', city: 'Sumaré', nameNormalized: 'vida nova' },
  { id: 'carlos', name: 'Louvor Jovem', city: 'Sao Carlos', nameNormalized: 'louvor jovem' },
];

function renderChoose(
  overrides: Partial<Parameters<typeof EntryChoose>[0]> = {},
  api = createFakeMinistriesApi(),
) {
  const props = {
    api,
    catalog: { status: 'ready' as const, list: catalog },
    onRetry: vi.fn(),
    firstName: 'Maria',
    rejectedId: null,
    removedFrom: null,
    email: 'pessoa@exemplo.test',
    onExit: vi.fn(),
    exitFailed: false,
    requestsFailed: false,
    onRetryRequests: vi.fn(),
    ...overrides,
  };
  render(<EntryChoose {...props} />);
  return props;
}

describe('EntryChoose', () => {
  it('mostra a eyebrow, o título e o apoio', () => {
    renderChoose();
    expect(screen.getByText('Olá, Maria')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Peça para entrar no ministério em que você toca. Um admin dele precisa aprovar.',
      ),
    ).toBeInTheDocument();
  });

  it('omite a eyebrow sem nome', () => {
    renderChoose({ firstName: undefined });
    expect(screen.queryByText(/Olá,/)).toBeNull();
  });

  it('lista cada ministério com nome e cidade no rótulo da linha', () => {
    renderChoose();
    expect(
      screen.getByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sumaré')).toBeInTheDocument();
  });

  it('busca sem acento e sem maiúscula, por nome ou cidade', () => {
    renderChoose();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ministério' }), {
      target: { value: 'sao' },
    });
    expect(
      screen.getByRole('button', { name: /Pedir para entrar em Haja Luz/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Pedir para entrar em Louvor Jovem/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vida Nova/ })).toBeNull();
  });

  it('busca sem resultado mostra o estado vazio', () => {
    renderChoose();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar ministério' }), {
      target: { value: 'Videira' },
    });
    expect(screen.getByText('Nenhum ministério encontrado')).toBeInTheDocument();
    expect(
      screen.getByText('Confira o nome ou peça ao admin da app para criar o seu ministério.'),
    ).toBeInTheDocument();
  });

  it('erro mostra a mensagem e Tentar de novo chama onRetry', () => {
    const onRetry = vi.fn();
    renderChoose({ catalog: { status: 'error', list: [] }, onRetry });
    expect(
      screen.getByText('Não foi possível carregar os ministérios. Tente de novo.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('carregando mostra o esqueleto ocupado', () => {
    const { container } = render(
      <EntryChoose
        api={createFakeMinistriesApi()}
        catalog={{ status: 'loading', list: [] }}
        onRetry={vi.fn()}
        requestsFailed={false}
        onRetryRequests={vi.fn()}
        rejectedId={null}
        removedFrom={null}
        email="pessoa@exemplo.test"
        onExit={vi.fn()}
        exitFailed={false}
      />,
    );
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
  });

  it('mostra a conta e Sair chama onExit', () => {
    const { onExit } = renderChoose();
    const footer = screen.getByText('Conta').parentElement as HTMLElement;
    expect(within(footer).getByText('pessoa@exemplo.test')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro quando sair falha', () => {
    renderChoose({ exitFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível sair. Tente de novo.');
  });

  it('pedido recusado mostra o alerta com o nome do ministério', () => {
    renderChoose({ rejectedId: 'hajaluz' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Seu pedido para Haja Luz não foi aprovado.',
    );
    expect(
      screen.getByText('Você pode pedir de novo ou escolher outro ministério.'),
    ).toBeInTheDocument();
  });

  it('removido mostra o aviso informativo', () => {
    renderChoose({ removedFrom: 'Haja Luz' });
    expect(screen.getByText('Você não faz mais parte de Haja Luz.')).toBeInTheDocument();
    expect(screen.getByText('Escolha um ministério para continuar.')).toBeInTheDocument();
  });

  it('Cancelar e Esc devolvem o foco à linha tocada, mesmo com o foco no body (iOS)', () => {
    renderChoose();
    const row = screen.getByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(row).toHaveFocus();

    fireEvent.click(row);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(row).toHaveFocus();
  });

  it('focusTitle leva o foco ao título ao montar', () => {
    render(
      <EntryChoose
        api={createFakeMinistriesApi()}
        catalog={{ status: 'ready', list: catalog }}
        onRetry={vi.fn()}
        requestsFailed={false}
        onRetryRequests={vi.fn()}
        focusTitle
        rejectedId={null}
        removedFrom={null}
        email="pessoa@exemplo.test"
        onExit={vi.fn()}
        exitFailed={false}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Escolha seu ministério' })).toHaveFocus();
  });

  it('erro dos pedidos mostra Tentar de novo, que chama onRetryRequests', () => {
    const onRetryRequests = vi.fn();
    render(
      <EntryChoose
        api={createFakeMinistriesApi()}
        catalog={{ status: 'ready', list: catalog }}
        onRetry={vi.fn()}
        requestsFailed
        onRetryRequests={onRetryRequests}
        rejectedId={null}
        removedFrom={null}
        email="pessoa@exemplo.test"
        onExit={vi.fn()}
        exitFailed={false}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar os seus pedidos.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(onRetryRequests).toHaveBeenCalledTimes(1);
  });

  it('tocar numa linha abre o diálogo de confirmação', () => {
    renderChoose();
    fireEvent.click(
      screen.getByRole('button', { name: 'Pedir para entrar em Haja Luz, São Paulo' }),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Pedir para entrar em Haja Luz?' }),
    ).toBeInTheDocument();
  });
});
