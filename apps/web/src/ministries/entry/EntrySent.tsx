import { useEffect, useRef, useState } from 'react';
import { initialsOf } from '../../ui/initials';
import { messageFor } from '../callable';
import type { MinistryItem } from '../ministriesApi';
import { RemovedNotice } from './EntryChoose';

const CANCEL_FAILED = 'Não foi possível concluir. Tente de novo.';
const EXIT_FAILED = 'Não foi possível sair. Tente de novo.';

/**
 * Tela 36: pedido aguardando aprovação. O app observa o vínculo e abre sozinho quando aprovado.
 * O título recebe o foco ao montar (é a tela nova depois do pedido enviado).
 */
export function EntrySent({
  ministries,
  ministryId,
  email,
  removedFrom,
  onCancel,
  onExit,
  exitFailed,
  busy,
}: {
  /** null enquanto o catálogo não chegou: o cartão fica de fora. */
  ministries: MinistryItem[] | null;
  ministryId: string;
  email: string;
  removedFrom: string | null;
  onCancel: () => Promise<void>;
  onExit: () => void;
  exitFailed: boolean;
  busy: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [cancelFailed, setCancelFailed] = useState<string | null>(null);
  const ministry = ministries?.find((m) => m.id === ministryId);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function cancel() {
    setCancelFailed(null);
    try {
      await onCancel();
    } catch (err) {
      // Código conhecido do servidor: a mensagem dele é a que a pessoa vê; o texto da
      // especificação é o fallback (ver messageFor em ministries/callable.ts).
      setCancelFailed(messageFor(err, CANCEL_FAILED));
    }
  }

  return (
    <main className="entry-screen entry-screen--centered">
      {removedFrom && <RemovedNotice ministryName={removedFrom} />}
      <section role="status" className="entry-sent-head">
        <span className="entry-icon" aria-hidden="true">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <h1 ref={titleRef} tabIndex={-1} className="screen-title">
          Pedido enviado
        </h1>
        {ministry ? (
          <p className="entry-text">
            Um admin da {ministry.name} precisa aprovar. Quando ele aprovar, o app abre sozinho;
            você não precisa sair e entrar.
          </p>
        ) : (
          <p className="entry-text">
            Um admin do ministério precisa aprovar. Quando ele aprovar, o app abre sozinho; você não
            precisa sair e entrar.
          </p>
        )}
      </section>

      {ministry && (
        <div className="entry-sent">
          <div className="entry-sent-part">
            <span className="min-tile min-tile--compact" aria-hidden="true">
              {initialsOf(ministry.name)}
            </span>
            <div className="entry-sent-info">
              <span className="section-eyebrow">Pedido para</span>
              <span className="entry-sent-name">{`${ministry.name} · ${ministry.city}`}</span>
            </div>
            <span className="mn-status-pill">Aguardando</span>
          </div>
          <div className="entry-sent-part">
            <span className="section-eyebrow">Conta</span>
            <span className="entry-sent-email">{email}</span>
          </div>
        </div>
      )}

      <div className="entry-actions">
        {cancelFailed && (
          <p role="alert" className="error-box">
            {cancelFailed}
          </p>
        )}
        <button
          type="button"
          className="btn entry-action-wide"
          onClick={() => void cancel()}
          disabled={busy}
        >
          Cancelar pedido
        </button>
        <button type="button" className="btn entry-exit-text" onClick={onExit} disabled={busy}>
          Sair
        </button>
        {exitFailed && (
          <p role="alert" className="error-box">
            {EXIT_FAILED}
          </p>
        )}
      </div>
    </main>
  );
}
