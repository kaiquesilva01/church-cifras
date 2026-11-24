import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallableError } from '../callable';
import type { MinistryItem } from '../ministriesApi';
import { EntrySent } from './EntrySent';

const haja: MinistryItem = {
  id: 'hajaluz',
  name: 'Haja Luz',
  city: 'São Paulo',
  nameNormalized: 'haja luz',
};

function renderSent(overrides: Partial<Parameters<typeof EntrySent>[0]> = {}) {
  const props = {
    ministries: [haja],
    ministryId: 'hajaluz',
    email: 'pessoa@exemplo.test',
    removedFrom: null,
    onCancel: vi.fn(() => Promise.resolve()),
    onExit: vi.fn(),
    exitFailed: false,
    busy: false,
    ...overrides,
  };
  render(<EntrySent {...props} />);
  return props;
}

describe('EntrySent', () => {
  it('mostra o título focado, o cartão com nome, cidade, pílula e conta', () => {
    renderSent();
    expect(screen.getByRole('heading', { level: 1, name: 'Pedido enviado' })).toHaveFocus();
    expect(screen.getByText('Haja Luz · São Paulo')).toBeInTheDocument();
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
    expect(screen.getByText('pessoa@exemplo.test')).toBeInTheDocument();
  });

  it('sem catálogo mostra o texto genérico e omite o cartão', () => {
    renderSent({ ministries: null });
    expect(
      screen.getByText(
        'Um admin do ministério precisa aprovar. Quando ele aprovar, o app abre sozinho; você não precisa sair e entrar.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Aguardando')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancelar pedido' })).toBeInTheDocument();
  });

  it('falha ao cancelar mostra o erro genérico', async () => {
    renderSent({ onCancel: vi.fn(() => Promise.reject(new Error('rede'))) });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir. Tente de novo.',
    );
  });

  it('falha ao cancelar com código conhecido mostra a mensagem do servidor', async () => {
    renderSent({
      onCancel: vi.fn(() =>
        Promise.reject(new CallableError('failed-precondition', 'Este pedido já foi aprovado.')),
      ),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este pedido já foi aprovado.');
  });

  it('mostra o aviso de remoção quando há um', () => {
    renderSent({ removedFrom: 'Vida Nova' });
    expect(screen.getByText('Você não faz mais parte de Vida Nova.')).toBeInTheDocument();
  });

  it('Sair chama onExit e mostra erro quando falha', () => {
    const props = renderSent({ exitFailed: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(props.onExit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível sair. Tente de novo.');
  });
});
