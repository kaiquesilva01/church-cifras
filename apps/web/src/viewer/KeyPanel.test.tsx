import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyPanel } from './KeyPanel';

function setup(props: Partial<Parameters<typeof KeyPanel>[0]> = {}) {
  const handlers = { onTarget: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn() };
  render(
    <KeyPanel
      sourceKey="G"
      savedKeys={['G', 'A']}
      target={null}
      collisions={0}
      suspects={[]}
      busy={false}
      layout="sheet"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('KeyPanel', () => {
  it('shows the source key in the title and the 12 major keys', () => {
    setup();
    expect(screen.getByText('Mudar tom · original G')).toBeInTheDocument();
    expect(screen.getByText('▢ salvo')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(12);
  });

  it('marks saved keys and the selected one', () => {
    setup({ target: 'D' });
    expect(screen.getByRole('button', { name: 'A, salvo' })).toHaveClass('saved');
    expect(screen.getByRole('button', { name: 'D' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Confirmar D' })).toBeEnabled();
  });

  it('shows Abrir for a saved target', () => {
    const { onConfirm } = setup({ target: 'A' });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir A' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('is a modal dialog in sheet layout that focuses in and cancels on Escape', () => {
    const { onCancel } = setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('is a complementary region in side layout', () => {
    setup({ layout: 'side' });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('steps with the semitone buttons and wraps around the mode', () => {
    const { onTarget } = setup({ target: 'B' });
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom acima' }));
    expect(onTarget).toHaveBeenLastCalledWith('C');
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom abaixo' }));
    expect(onTarget).toHaveBeenLastCalledWith('Bb');
  });

  it('starts stepping from the source key and uses minor keys for minor songs', () => {
    const { onTarget } = setup({ sourceKey: 'F#m', savedKeys: ['F#m'] });
    expect(screen.getByRole('button', { name: 'Cm' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Meio tom acima' }));
    expect(onTarget).toHaveBeenCalledWith('Gm');
  });

  it('shows warnings, busy and preparing states', () => {
    setup({ collisions: 2, suspects: ['Xm7', 'Y'], target: 'D', busy: true });
    expect(
      screen.getByText('⚠ 2 acordes podem encostar no vizinho (em vermelho)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Confira: não reconhecemos Xm7, Y como acorde.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerando PDF…' })).toBeDisabled();
  });

  it('uses the singular for one collision', () => {
    setup({ collisions: 1 });
    expect(
      screen.getByText('⚠ 1 acorde pode encostar no vizinho (em vermelho)'),
    ).toBeInTheDocument();
  });

  it('shows preparing, errors and the unavailable message', () => {
    setup({ preparing: true, error: 'Falhou', unavailable: true, target: 'D' });
    expect(screen.getByRole('status')).toHaveTextContent('Preparando…');
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');
    expect(screen.getByText('Modo de reescrita ainda não disponível.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar D' })).toBeDisabled();
  });
});
