import type { ReactNode } from 'react';
import { BELL_PATH } from './bell';
import type { AvisosStatus, PushService } from './types';
import { type AvisosView, usePushAvisos } from './usePushAvisos';

const MUTED_AVAILABLE = 'Receba repertório novo e lembrete do ensaio neste aparelho';

interface Copy {
  text: ReactNode;
  hint?: string;
  action?: {
    label: string;
    aria?: string;
    kind: 'primary' | 'secondary';
    disabled: boolean;
    run: 'enable' | 'disable' | 'retry';
  };
}

function copyFor(status: AvisosStatus): Copy {
  switch (status) {
    case 'checking':
      return {
        text: 'Verificando…',
        action: { label: 'Ativar', kind: 'primary', disabled: true, run: 'enable' },
      };
    case 'available':
      return {
        text: MUTED_AVAILABLE,
        action: {
          label: 'Ativar',
          aria: 'Ativar avisos neste aparelho',
          kind: 'primary',
          disabled: false,
          run: 'enable',
        },
      };
    case 'enabling':
      return {
        text: 'Ativando…',
        action: { label: 'Ativar', kind: 'primary', disabled: true, run: 'enable' },
      };
    case 'active':
      return {
        // Só a palavra "Ativados" usa --color-success (.push-on); o resto da frase fica em muted.
        text: (
          <>
            <span className="push-on">Ativados</span> neste aparelho
          </>
        ),
        action: {
          label: 'Desativar',
          aria: 'Desativar avisos neste aparelho',
          kind: 'secondary',
          disabled: false,
          run: 'disable',
        },
      };
    case 'disabling':
      return {
        text: 'Desativando…',
        action: { label: 'Desativar', kind: 'secondary', disabled: true, run: 'disable' },
      };
    case 'blocked':
      return {
        text: 'Bloqueados no navegador. Libere as notificações nas configurações do site e volte aqui',
      };
    case 'ios-install':
      return {
        text: 'Instale o app na tela inicial para receber avisos',
        hint: 'No Safari: Compartilhar › Adicionar à Tela de Início',
      };
    case 'unsupported':
      return { text: 'Seu navegador não permite avisos' };
    case 'error':
      return {
        text: MUTED_AVAILABLE,
        action: { label: 'Tentar de novo', kind: 'primary', disabled: false, run: 'retry' },
      };
  }
}

function handlerFor(run: NonNullable<Copy['action']>['run'], view: AvisosView): () => void {
  switch (run) {
    case 'enable':
      return view.enable;
    case 'disable':
      return view.disable;
    case 'retry':
      return view.retry;
  }
}

export function AvisosRow({ service }: { service: PushService }) {
  const view = usePushAvisos(service);
  const copy = copyFor(view.status);
  const active = view.status === 'active';
  const busy = view.status === 'enabling' || view.status === 'disabling';
  const action = copy.action;

  return (
    <li className="push-row" aria-busy={busy || undefined}>
      <div className="menu-row">
        <span className="menu-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={BELL_PATH} />
          </svg>
        </span>
        <span className="menu-text">
          <strong>Avisos</strong>
          <span className="muted">{copy.text}</span>
          {copy.hint && <span className="push-hint">{copy.hint}</span>}
        </span>
        {action && (
          <button
            type="button"
            className={
              action.kind === 'primary'
                ? 'push-action btn-primary'
                : 'push-action push-action--secondary'
            }
            aria-label={action.aria}
            disabled={action.disabled || (active && view.test === 'sending')}
            onClick={handlerFor(action.run, view)}
          >
            {action.label}
          </button>
        )}
      </div>
      {active && (
        <div className="push-test">
          <button
            type="button"
            className="push-test-button"
            onClick={view.sendTest}
            disabled={view.test === 'sending'}
          >
            Enviar aviso de teste
          </button>
        </div>
      )}
      {/* Feedback do teste fora do bloco "active": sobrevive quando a poda devolve a linha a "available".
          A região de status fica sempre montada; só o texto de sucesso entra nela. */}
      <div role="status" className="push-status">
        {view.test === 'sent' && (
          <p className="notice">Aviso de teste enviado. Ele chega em instantes.</p>
        )}
      </div>
      {view.test === 'failed' && (
        <p role="alert" className="push-alert">
          Não foi possível enviar o teste.
        </p>
      )}
      {view.status === 'error' && (
        <p role="alert" className="push-alert">
          Não foi possível ativar os avisos. Tente de novo.
        </p>
      )}
    </li>
  );
}
