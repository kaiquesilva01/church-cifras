import { normalizeText } from '@cifras/chords';
import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** When set, the confirm button only enables once this text is typed (case/accents ignored). */
  requireText?: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  requireText,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const matches = requireText === undefined || normalizeText(typed) === normalizeText(requireText);

  return (
    <Dialog titleId="confirm-title" onClose={onCancel} busy={busy}>
      <h2 id="confirm-title" className="dialog-title">
        {title}
      </h2>
      <p>{children}</p>
      {requireText !== undefined && (
        <div className="field">
          <label htmlFor="confirm-text">Digite o título para confirmar</label>
          <input
            id="confirm-text"
            className="input"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || !matches}
          onClick={onConfirm}
        >
          {busy ? 'Apagando…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
