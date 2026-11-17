import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SetlistFormDialog } from './SetlistFormDialog';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

function setup(props: Partial<Parameters<typeof SetlistFormDialog>[0]> = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <SetlistFormDialog
      mode="create"
      busy={false}
      error={null}
      onSave={onSave}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSave, onCancel };
}

const dateInput = () => screen.getByLabelText('Data');
const labelInput = () => screen.getByLabelText('Rótulo');
const save = () => screen.getByRole('button', { name: 'Salvar' });

describe('SetlistFormDialog', () => {
  it('defaults to the next culto date and its label', () => {
    setup();
    expect(dateInput()).toHaveValue('2026-11-19');
    expect(labelInput()).toHaveValue('Quinta');
  });

  it('label follows the date until edited', () => {
    setup();
    fireEvent.change(dateInput(), { target: { value: '2026-11-22' } });
    expect(labelInput()).toHaveValue('Domingo');
    fireEvent.change(labelInput(), { target: { value: 'Santa ceia' } });
    fireEvent.change(dateInput(), { target: { value: '2026-11-19' } });
    expect(labelInput()).toHaveValue('Santa ceia');
  });

  it('limits the label input length', () => {
    setup();
    expect(screen.getByLabelText('Rótulo')).toHaveAttribute('maxlength', '60');
  });

  it('uses initial values for edit and duplicate', () => {
    setup({ mode: 'edit', initial: { date: '2026-11-25', label: 'Especial' } });
    expect(dateInput()).toHaveValue('2026-11-25');
    expect(labelInput()).toHaveValue('Especial');
  });

  it('disables save for empty or too long label', () => {
    setup();
    fireEvent.change(labelInput(), { target: { value: '   ' } });
    expect(save()).toBeDisabled();
    fireEvent.change(labelInput(), { target: { value: 'x'.repeat(61) } });
    expect(save()).toBeDisabled();
    fireEvent.change(labelInput(), { target: { value: 'x'.repeat(60) } });
    expect(save()).toBeEnabled();
  });

  it('disables save for malformed date', () => {
    setup();
    fireEvent.change(dateInput(), { target: { value: '' } });
    expect(save()).toBeDisabled();
  });

  it('warns and disables for a date older than 29 days', () => {
    setup();
    fireEvent.change(dateInput(), { target: { value: '2026-10-01' } });
    expect(screen.getByText(/já expiraria/)).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(dateInput(), { target: { value: '2026-10-18' } });
    expect(screen.queryByText(/já expiraria/)).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('calls onSave with trimmed values', () => {
    const { onSave } = setup();
    fireEvent.change(labelInput(), { target: { value: '  Culto jovem ' } });
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({ date: '2026-11-19', label: 'Culto jovem' });
  });

  it('shows the error and calls onCancel', () => {
    const { onCancel } = setup({ error: 'Falhou.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Falhou.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('titles follow the mode', () => {
    setup({ mode: 'duplicate', initial: { date: '2026-11-25', label: 'A' } });
    expect(screen.getByRole('heading', { name: 'Duplicar repertório' })).toBeInTheDocument();
  });
});
