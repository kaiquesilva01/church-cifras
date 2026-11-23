import { useId, type ReactNode } from 'react';

export interface ConviteAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface ConviteCardProps {
  icon: ReactNode;
  title: string;
  hint: string;
  onClose: () => void;
  action?: ConviteAction;
  /** Ação em andamento: marca a região com aria-busy. */
  busy?: boolean;
}

/**
 * Cartão flutuante do topo da aba Músicas, usado pelos convites de instalação e de avisos.
 * Estilo em `redesign-install.css`, escopado em `.convite`.
 */
export function ConviteCard({
  icon,
  title,
  hint,
  onClose,
  action,
  busy = false,
}: ConviteCardProps) {
  const titleId = useId();
  return (
    <section className="convite" aria-labelledby={titleId} aria-busy={busy || undefined}>
      <div className="convite__icon">{icon}</div>
      <div className="convite__text">
        <p id={titleId} className="convite__title">
          {title}
        </p>
        <p className="convite__hint">{hint}</p>
      </div>
      <button type="button" className="convite__close" aria-label="Agora não" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      {action && (
        <button
          type="button"
          className="convite__action"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          <span>{action.label}</span>
        </button>
      )}
    </section>
  );
}
