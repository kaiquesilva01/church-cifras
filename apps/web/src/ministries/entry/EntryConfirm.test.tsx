import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeMinistriesApi } from '../../test/fakeMinistriesApi';
import type { MinistryItem } from '../ministriesApi';
import { CallableError } from '../callable';
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

  it('sem foco no opener (iOS), Cancelar devolve o foco à linha passada em returnTo', () => {
    // A linha existe, mas não está focada: como no toque do iOS, o foco fica no body ao abrir.
    const row = document.createElement('button');
    document.body.append(row);
    function Harness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <EntryConfirm
          api={createFakeMinistriesApi()}
          ministry={haja}
          returnTo={row}
          onClose={() => setOpen(false)}
        />
      ) : null;
    }
    render(<Harness />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(row).toHaveFocus();
    row.remove();
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
    await act(async () => resolve());
    // Sucesso: o diálogo fecha (não fica preso esperando a assinatura).
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Tab fica preso no diálogo', () => {
    render(<EntryConfirm api={createFakeMinistriesApi()} ministry={haja} onClose={vi.fn()} />);
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Pedir para entrar' });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
  });

  it('erro com código conhecido mostra a mensagem do servidor', async () => {
    const api = createFakeMinistriesApi({
      callable: {
        requestAccess: vi.fn(() =>
          Promise.reject(
            new CallableError(
              'failed-precondition',
              'Você já tem um pedido pendente em outro ministério.',
            ),
          ),
        ),
      },
    });
    render(<EntryConfirm api={api} ministry={haja} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você já tem um pedido pendente em outro ministério.',
    );
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
