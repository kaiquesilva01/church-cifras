import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { useFocusTrap } from '../../viewer/useFocusTrap';
import { initialsOf } from '../../ui/initials';
import { messageFor } from '../callable';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';

const FALLBACK = 'Não foi possível enviar o pedido. Tente de novo.';

/**
 * Diálogo 35: confirma o pedido de entrada num ministério. Esc, Cancelar e toque no scrim fecham;
 * Tab fica preso no diálogo. `returnTo` é a linha tocada: o foco volta para ela ao fechar, mesmo
 * quando o navegador não focou o botão no toque (iOS). Em sucesso o diálogo fecha; a assinatura de
 * pedidos troca a tela (EntrySent), que recebe o foco.
 */
export function EntryConfirm({
  api,
  ministry,
  returnTo,
  onClose,
}: {
  api: MinistriesApi;
  ministry: MinistryItem;
  /** Omitido: volta para o elemento focado na montagem. */
  returnTo?: HTMLElement | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusTrap(rootRef, { onEscape: onClose, busy, opener: returnTo });

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
      // Código conhecido do servidor: a mensagem dele é a que a pessoa vê; o texto da
      // especificação é o fallback (ver messageFor em ministries/callable.ts).
      setError(messageFor(err, FALLBACK));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
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
