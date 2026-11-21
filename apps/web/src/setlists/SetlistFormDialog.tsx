import { useRef, useState } from 'react';
import { Dialog } from '../viewer/Dialog';
import { defaultCultoDate, defaultLabel, isTooOld, todayLocal } from './dates';
import {
  isRehearsalDayInWindow,
  isValidHour,
  rehearsalInstant,
  rehearsalParts,
  rehearsalWindow,
} from './rehearsal';
import { LABEL_MAX } from './types';

export interface SetlistFormValue {
  date: string;
  label: string;
  rehearsalAt: Date | null;
}

export interface SetlistFormDialogProps {
  mode: 'create' | 'edit' | 'duplicate';
  initial?: { date: string; label: string; rehearsalAt?: Date };
  busy: boolean;
  error: string | null;
  onSave: (value: SetlistFormValue) => void;
  onCancel: () => void;
}

const TITLES = {
  create: 'Novo repertório',
  edit: 'Editar repertório',
  duplicate: 'Duplicar repertório',
} as const;

const PARTIAL_MSG = 'Para ter ensaio, preencha o dia e a hora; ou limpe os dois.';
const WINDOW_MSG = 'O ensaio precisa ser entre 7 dias antes do culto e o próprio dia do culto.';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function SetlistFormDialog({
  mode,
  initial,
  busy,
  error,
  onSave,
  onCancel,
}: SetlistFormDialogProps) {
  const [today] = useState(() => todayLocal(new Date()));
  const [date, setDate] = useState(() => initial?.date ?? defaultCultoDate(today));
  const [label, setLabel] = useState(() => initial?.label ?? defaultLabel(date));
  // With initial values the label is already the user's; otherwise it tracks the date.
  const [labelEdited, setLabelEdited] = useState(initial !== undefined);
  const [rehearsalDay, setRehearsalDay] = useState(() =>
    initial?.rehearsalAt ? rehearsalParts(initial.rehearsalAt).day : '',
  );
  const [rehearsalHour, setRehearsalHour] = useState(() =>
    initial?.rehearsalAt ? rehearsalParts(initial.rehearsalAt).hour : '',
  );
  // O Dia acompanha a data do culto: era igual a ela ou foi preenchido automaticamente.
  // Fica de pé mesmo com a data momentaneamente vazia (digitação no type="date").
  const [dayFollows, setDayFollows] = useState(() =>
    initial?.rehearsalAt ? rehearsalParts(initial.rehearsalAt).day === initial.date : false,
  );
  const dayInputRef = useRef<HTMLInputElement>(null);

  const dateValid = isValidDate(date);
  const tooOld = dateValid && isTooOld(date, today);
  const trimmed = label.trim();
  const labelValid = trimmed.length > 0 && trimmed.length <= LABEL_MAX;
  const hasDay = rehearsalDay !== '';
  const hasHour = rehearsalHour !== '';
  const range = dateValid ? rehearsalWindow(date) : null;
  // Par incompleto avisa por status (leitor de tela não interrompe ao escolher só o dia);
  // janela fora do intervalo é erro de verdade e segue como alert.
  // Sem culto válido não há janela nem par a cobrar: o erro da data já basta.
  const partialRehearsal = dateValid && hasDay !== hasHour;
  const windowError =
    !partialRehearsal && dateValid && hasDay && !isRehearsalDayInWindow(rehearsalDay, date);
  const canSave =
    dateValid &&
    !tooOld &&
    labelValid &&
    !partialRehearsal &&
    !windowError &&
    (!hasHour || isValidHour(rehearsalHour));

  const changeDate = (value: string): void => {
    // Data vazia (digitação) não move o Dia: ele só se move para datas válidas.
    if (dayFollows && isValidDate(value)) setRehearsalDay(value);
    setDate(value);
    if (!labelEdited && isValidDate(value)) setLabel(defaultLabel(value));
  };

  const changeDay = (value: string): void => {
    setDayFollows(value !== '' && value === date);
    setRehearsalDay(value);
  };

  const changeHour = (value: string): void => {
    // Escolher a hora sem dia põe o dia da data do culto.
    if (value !== '' && !hasDay && dateValid) {
      setRehearsalDay(date);
      setDayFollows(true);
    }
    setRehearsalHour(value);
  };

  const clearRehearsal = (): void => {
    setRehearsalDay('');
    setRehearsalHour('');
    setDayFollows(false);
    // O ✕ some ao limpar; o foco volta ao campo Dia, como o × do campo de busca.
    dayInputRef.current?.focus();
  };

  const rehearsalInvalid = partialRehearsal || windowError;
  const describedBy = [
    'setlist-rehearsal-help',
    ...(partialRehearsal ? ['setlist-rehearsal-status'] : []),
    ...(windowError ? ['setlist-rehearsal-err'] : []),
  ].join(' ');

  return (
    <Dialog titleId="setlist-form-title" onClose={onCancel} busy={busy}>
      <h2 id="setlist-form-title" className="dialog-title">
        {TITLES[mode]}
      </h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSave) return;
          onSave({
            date,
            label: trimmed,
            rehearsalAt: hasDay && hasHour ? rehearsalInstant(rehearsalDay, rehearsalHour) : null,
          });
        }}
      >
        <div className="field">
          <label htmlFor="setlist-date">Data</label>
          <input
            id="setlist-date"
            type="date"
            className="input"
            value={date}
            disabled={busy}
            aria-invalid={tooOld ? true : undefined}
            aria-describedby={tooOld ? 'setlist-date-err' : undefined}
            onChange={(e) => changeDate(e.target.value)}
          />
          {tooOld && (
            <p id="setlist-date-err" role="alert" className="field-error">
              Essa data é antiga demais: o repertório já expiraria.
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="setlist-label">Rótulo</label>
          <input
            id="setlist-label"
            className="input"
            value={label}
            maxLength={LABEL_MAX}
            disabled={busy}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelEdited(true);
            }}
          />
        </div>
        <fieldset className="rehearsal-group" disabled={busy}>
          <legend>Hora do ensaio (opcional)</legend>
          <div className="rehearsal-row">
            <div className="rehearsal-day">
              <label htmlFor="setlist-rehearsal-day">Dia</label>
              <input
                ref={dayInputRef}
                id="setlist-rehearsal-day"
                type="date"
                className="input"
                value={rehearsalDay}
                min={range?.first}
                max={range?.last}
                aria-invalid={rehearsalInvalid ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => changeDay(e.target.value)}
              />
            </div>
            <div className="rehearsal-hour">
              <label htmlFor="setlist-rehearsal-hour">Hora</label>
              <input
                id="setlist-rehearsal-hour"
                type="time"
                className="input"
                value={rehearsalHour}
                aria-invalid={rehearsalInvalid ? true : undefined}
                aria-describedby={describedBy}
                onChange={(e) => changeHour(e.target.value)}
              />
            </div>
            {(hasDay || hasHour) && (
              <button
                type="button"
                className="search-clear rehearsal-clear"
                aria-label="Limpar dia e hora do ensaio"
                disabled={busy}
                onClick={clearRehearsal}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
          <p id="setlist-rehearsal-help" className="field-help">
            Quem ativou os avisos é lembrado 30 min antes e na hora.
          </p>
          {/*
            Sempre montada: a região de status precisa existir antes de o aviso entrar.
            Vazia não ocupa espaço: a margem de field-error só vale com o aviso.
          */}
          <p
            id="setlist-rehearsal-status"
            role="status"
            aria-live="polite"
            className={partialRehearsal ? 'field-error' : undefined}
            style={partialRehearsal ? undefined : { margin: 0 }}
          >
            {partialRehearsal ? PARTIAL_MSG : ''}
          </p>
          {windowError && (
            <p id="setlist-rehearsal-err" role="alert" className="field-error">
              {WINDOW_MSG}
            </p>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !canSave}>
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
