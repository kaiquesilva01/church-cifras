import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderConfirm(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Apagar música"
      confirmLabel="Apagar música"
      busy={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    >
      Isto apaga a música. Não dá para desfazer.
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('asks only for the warning and two buttons, with no text to type', () => {
    renderConfirm();
    expect(screen.getByText('Isto apaga a música. Não dá para desfazer.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apagar música' })).toBeEnabled();
  });

  it('puts Cancelar on the left of the confirm button', () => {
    renderConfirm();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    const confirm = screen.getByRole('button', { name: 'Apagar música' });
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('starts focus on Cancelar', () => {
    renderConfirm();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('confirms with one click', () => {
    const { onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar música' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('Cancelar and Escape both cancel', () => {
    const { onCancel, onConfirm } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('while busy, disables both buttons and the confirm label becomes Apagando…', () => {
    renderConfirm({ busy: true });
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apagando…' })).toBeDisabled();
  });

  it('shows the error as an alert', () => {
    renderConfirm({ error: 'Não foi possível apagar a música. Tente de novo.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível apagar');
  });
});
