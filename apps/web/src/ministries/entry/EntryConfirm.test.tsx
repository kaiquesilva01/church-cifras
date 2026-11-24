import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeMinistriesApi } from '../../test/fakeMinistriesApi';
import type { MinistryItem } from '../ministriesApi';
import { EntryConfirm } from './EntryConfirm';

const haja: MinistryItem = {
  id: 'hajaluz',
  name: 'Haja Luz',
  city: 'São Paulo',
  nameNormalized: 'haja luz',
};

describe('EntryConfirm', () => {
  it('mostra o título, o texto e as duas ações', () => {
    render(<EntryConfirm api={createFakeMinistriesApi()} ministry={haja} onClose={vi.fn()} />);
    expect(
      screen.getByRole('dialog', { name: 'Pedir para entrar em Haja Luz?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Um admin da Haja Luz vai receber o seu pedido. Quando ele aprovar, o app abre sozinho.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir para entrar' })).toBeInTheDocument();
  });

  it('foco inicial em Cancelar', () => {
    render(<EntryConfirm api={createFakeMinistriesApi()} ministry={haja} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('Esc e Cancelar fecham sem pedir', () => {
    const api = createFakeMinistriesApi();
    const onClose = vi.fn();
    render(<EntryConfirm api={api} ministry={haja} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.callable.requestAccess).not.toHaveBeenCalled();
  });

  it('Pedir para entrar chama requestAccess e fica ocupado durante a chamada', async () => {
    let resolve!: () => void;
    const api = createFakeMinistriesApi({
      callable: {
        requestAccess: vi.fn(
          () =>
            new Promise<void>((done) => {
              resolve = done;
            }),
        ),
      },
    });
    const onClose = vi.fn();
    render(<EntryConfirm api={api} ministry={haja} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(api.callable.requestAccess).toHaveBeenCalledWith('hajaluz');
    const busy = screen.getByRole('button', { name: 'Pedir para entrar' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    resolve();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('erro mostra a mensagem dentro do diálogo e libera o botão', async () => {
    const api = createFakeMinistriesApi({
      callable: { requestAccess: vi.fn(() => Promise.reject(new Error('rede'))) },
    });
    render(<EntryConfirm api={api} ministry={haja} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível enviar o pedido. Tente de novo.',
    );
    expect(screen.getByRole('button', { name: 'Pedir para entrar' })).toBeEnabled();
  });
});
