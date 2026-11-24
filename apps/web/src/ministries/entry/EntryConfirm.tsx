import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useFocusTrap } from '../../viewer/useFocusTrap';
import { initialsOf } from '../../ui/initials';
import { messageFor } from '../callable';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';

const FALLBACK = 'Não foi possível enviar o pedido. Tente de novo.';

/**
 * Diálogo 35: confirma o pedido de entrada num ministério. Esc, Cancelar e toque no scrim fecham;
 * Tab fica preso no diálogo. Em sucesso o diálogo continua ocupado: a assinatura de pedidos troca a
 * tela inteira (EntrySent), então não há linha para devolver o foco.
 */
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
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusTrap(rootRef, { onEscape: onClose, busy });

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  function onScrimClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) onClose();
  }

  async function request() {
    setBusy(true);
    setError(null);
    try {
      await api.callable.requestAccess(ministry.id);
    } catch (err) {
      // Código conhecido do servidor: a mensagem em pt-BR dele é a que a pessoa vê (decisão do
      // orquestrador); o texto da especificação é só o fallback (ver messageFor em callable.ts).
      setError(messageFor(err, FALLBACK));
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onScrimClick}>
      <div
        ref={rootRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="dialog entry-dialog"
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
