import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { initialsOf } from '../../ui/initials';
import { messageFor } from '../callable';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';

const FALLBACK = 'Não foi possível enviar o pedido. Tente de novo.';

/** Diálogo 35: confirma o pedido de entrada num ministério. Esc e toque no scrim cancelam. */
export function EntryConfirm({
  api,
  ministry,
  onClose,
}: {
  api: MinistriesApi;
  ministry: MinistryItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onClose();
  }

  function onScrimClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose();
  }

  async function request() {
    setBusy(true);
    setError(null);
    try {
      await api.callable.requestAccess(ministry.id);
      onClose();
    } catch (err) {
      setError(messageFor(err, FALLBACK));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onScrimClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog entry-dialog"
        onKeyDown={onKeyDown}
      >
        <div className="entry-dialog-head">
          <span className="min-tile min-tile--dialog" aria-hidden="true">
            {initialsOf(ministry.name)}
          </span>
          <div className="entry-row-text">
            <span className="entry-row-name">{ministry.name}</span>
            <span className="entry-row-city">{ministry.city}</span>
          </div>
        </div>
        <h2 id={titleId} className="dialog-title">
          Pedir para entrar em {ministry.name}?
        </h2>
        <p className="entry-dialog-text">
          Um admin da {ministry.name} vai receber o seu pedido. Quando ele aprovar, o app abre
          sozinho.
        </p>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary sheet-actions-primary"
            onClick={() => void request()}
            disabled={busy}
            aria-busy={busy}
          >
            Pedir para entrar
          </button>
        </div>
      </div>
    </div>
  );
}
