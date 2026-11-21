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
const hourInput = () => screen.getByLabelText('Hora', { exact: true });
const dayInput = () => screen.getByLabelText('Dia', { exact: true });
const clearButton = () => screen.queryByRole('button', { name: 'Limpar dia e hora do ensaio' });
const RULE_PARTIAL = 'Para ter ensaio, preencha o dia e a hora; ou limpe os dois.';
const RULE_WINDOW = 'O ensaio precisa ser entre 7 dias antes do culto e o próprio dia do culto.';

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
    expect(onSave).toHaveBeenCalledWith({
      date: '2026-11-19',
      label: 'Culto jovem',
      rehearsalAt: null,
    });
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

  describe('hora do ensaio', () => {
    it('hora sem dia preenche o dia com a data do culto e grava em Brasília', () => {
      const { onSave } = setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      expect(dayInput()).toHaveValue('2026-11-19');
      fireEvent.click(save());
      expect(onSave).toHaveBeenCalledWith({
        date: '2026-11-19',
        label: 'Quinta',
        rehearsalAt: new Date('2026-11-19T21:30:00Z'),
      });
    });

    it('dia sem hora bloqueia com a regra de par', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '' } });
      expect(screen.getByText(RULE_PARTIAL)).toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('janela bloqueia dia fora e aceita as bordas', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '2026-11-11' } });
      expect(screen.getByText(RULE_WINDOW)).toBeInTheDocument();
      expect(save()).toBeDisabled();
      fireEvent.change(dayInput(), { target: { value: '2026-11-12' } });
      expect(screen.queryByText(RULE_WINDOW)).not.toBeInTheDocument();
      expect(save()).toBeEnabled();
      fireEvent.change(dayInput(), { target: { value: '2026-11-19' } });
      expect(screen.queryByText(RULE_WINDOW)).not.toBeInTheDocument();
      expect(save()).toBeEnabled();
    });

    it('data do culto acompanha o ensaio só quando era o mesmo dia', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dateInput(), { target: { value: '2026-11-22' } });
      expect(dayInput()).toHaveValue('2026-11-22');
      fireEvent.change(dayInput(), { target: { value: '2026-11-15' } });
      fireEvent.change(dateInput(), { target: { value: '2026-11-26' } });
      expect(dayInput()).toHaveValue('2026-11-15');
      expect(screen.getByText(RULE_WINDOW)).toBeInTheDocument();
    });

    it('✕ limpa dia e hora e grava rehearsalAt null', () => {
      const { onSave } = setup();
      expect(clearButton()).toBeNull();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.click(clearButton() as HTMLElement);
      expect(dayInput()).toHaveValue('');
      expect(hourInput()).toHaveValue('');
      expect(save()).toBeEnabled();
      fireEvent.click(save());
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rehearsalAt: null }));
    });

    it('anuncia o erro da janela com role alert', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '2026-11-11' } });
      expect(screen.getByRole('alert')).toHaveTextContent(RULE_WINDOW);
    });

    it('anuncia a regra de par com role status e aria-live polite, sem alert', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '' } });
      const msg = screen.getByRole('status');
      expect(msg).toHaveTextContent(RULE_PARTIAL);
      expect(msg).toHaveAttribute('aria-live', 'polite');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('escolher só o dia já mostra a regra de par como status, não como alert', () => {
      setup();
      fireEvent.change(dayInput(), { target: { value: '2026-11-18' } });
      expect(screen.getByRole('status')).toHaveTextContent(RULE_PARTIAL);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('o erro da janela continua com role alert', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '2026-11-11' } });
      expect(screen.getByRole('alert')).toHaveTextContent(RULE_WINDOW);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('dia que acompanha a data continua acompanhando quando a data fica vazia e volta válida', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dateInput(), { target: { value: '' } });
      fireEvent.change(dateInput(), { target: { value: '2026-11-22' } });
      expect(dayInput()).toHaveValue('2026-11-22');
      expect(save()).toBeEnabled();
    });

    it('dia escolhido à mão não acompanha a data mesmo depois de ela ficar vazia', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.change(dayInput(), { target: { value: '2026-11-15' } });
      fireEvent.change(dateInput(), { target: { value: '' } });
      fireEvent.change(dateInput(), { target: { value: '2026-11-22' } });
      expect(dayInput()).toHaveValue('2026-11-15');
    });

    it('✕ devolve o foco ao campo Dia', () => {
      setup();
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      fireEvent.click(clearButton() as HTMLElement);
      expect(document.activeElement).toBe(dayInput());
    });

    it('hora fora do formato HH:MM mantém Salvar desabilitado', () => {
      setup();
      // jsdom mantém "18:30:15" num type="time" (o navegador também aceita segundos) e isValidHour recusa.
      fireEvent.change(hourInput(), { target: { value: '18:30:15' } });
      expect(hourInput()).toHaveValue('18:30:15');
      expect(save()).toBeDisabled();
    });

    it('com data do culto inválida não mostra a regra de par', () => {
      setup();
      fireEvent.change(dateInput(), { target: { value: '' } });
      fireEvent.change(hourInput(), { target: { value: '18:30' } });
      expect(screen.queryByText(RULE_PARTIAL)).not.toBeInTheDocument();
      expect(save()).toBeDisabled();
    });

    it('edição preenche dia e hora a partir de rehearsalAt', () => {
      setup({
        mode: 'edit',
        initial: {
          date: '2026-11-22',
          label: 'Domingo',
          rehearsalAt: new Date('2026-11-22T21:30:00Z'),
        },
      });
      expect(dayInput()).toHaveValue('2026-11-22');
      expect(hourInput()).toHaveValue('18:30');
    });

    it('duplicar começa sem ensaio', () => {
      setup({ mode: 'duplicate', initial: { date: '2026-11-25', label: 'A' } });
      expect(hourInput()).toHaveValue('');
    });

    it('mostra a ajuda do grupo', () => {
      setup();
      expect(
        screen.getByText('Quem ativou os avisos é lembrado 30 min antes e na hora.'),
      ).toBeInTheDocument();
    });

    it('usa tipos date e time com a janela nos limites', () => {
      setup();
      expect(dayInput()).toHaveAttribute('type', 'date');
      expect(dayInput()).toHaveAttribute('min', '2026-11-12');
      expect(dayInput()).toHaveAttribute('max', '2026-11-19');
      expect(hourInput()).toHaveAttribute('type', 'time');
    });
  });
});
