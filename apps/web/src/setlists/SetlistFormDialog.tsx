import { useState } from 'react';
import { Dialog } from '../viewer/Dialog';
import { defaultCultoDate, defaultLabel, isTooOld, todayLocal } from './dates';
import { LABEL_MAX } from './types';

export interface SetlistFormDialogProps {
  mode: 'create' | 'edit' | 'duplicate';
  initial?: { date: string; label: string };
  busy: boolean;
  error: string | null;
  onSave: (value: { date: string; label: string }) => void;
  onCancel: () => void;
}

const TITLES = {
  create: 'Novo repertório',
  edit: 'Editar repertório',
  duplicate: 'Duplicar repertório',
} as const;

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

  const dateValid = isValidDate(date);
  const tooOld = dateValid && isTooOld(date, today);
  const trimmed = label.trim();
  const labelValid = trimmed.length > 0 && trimmed.length <= LABEL_MAX;
  const canSave = dateValid && !tooOld && labelValid;

  const changeDate = (value: string): void => {
    setDate(value);
    if (!labelEdited && isValidDate(value)) setLabel(defaultLabel(value));
  };

  return (
    <Dialog titleId="setlist-form-title" onClose={onCancel} busy={busy}>
      <h2 id="setlist-form-title" className="dialog-title">
        {TITLES[mode]}
      </h2>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave({ date, label: trimmed });
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
            <p id="setlist-date-err" className="field-error">
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
            disabled={busy}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelEdited(true);
            }}
          />
        </div>
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
