import { useEffect, useRef, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Two buttons: Cancelar (left, neutral, focused first) and the confirm action (right, solid red). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  // Runs after Dialog has moved focus to its container, so the safe choice wins.
  useEffect(() => cancel.current?.focus(), []);

  return (
    <Dialog titleId="confirm-title" onClose={onCancel} busy={busy}>
      <h2 id="confirm-title" className="dialog-title">
        {title}
      </h2>
      <p>{children}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="dialog-actions confirm-actions">
        <button ref={cancel} type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Apagando…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
