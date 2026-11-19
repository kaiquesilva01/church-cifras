import { useCallback, useRef } from 'react';
import { useDismissable } from '../ui/useDismissable';

export type ManageAction = 'edit' | 'delete-key' | 'delete-song';

export interface ManageMenuProps {
  /** Key currently open; null when the song has no PDF. */
  keyName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Another panel is open: the button is inert. */
  disabled?: boolean;
  onSelect: (action: ManageAction) => void;
}

/** Disclosure: a button with aria-expanded that reveals a list of action buttons. */
export function ManageMenu({
  keyName,
  open,
  onOpenChange,
  disabled = false,
  onSelect,
}: ManageMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { onBlur } = useDismissable({ open, onClose: close, root, trigger });

  const choose = (action: ManageAction): void => {
    onOpenChange(false);
    // Dialogs give focus back to the opener: it has to be the button, not the closed item.
    trigger.current?.focus();
    onSelect(action);
  };

  return (
    <div
      ref={root}
      className="manage"
      onBlur={onBlur}
    >
      <button
        ref={trigger}
        type="button"
        className="btn"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        Gerenciar
      </button>
      {open && (
        <div role="group" aria-label="Gerenciar música" className="manage-menu">
          <button type="button" className="manage-item" onClick={() => choose('edit')}>
            Editar nome e cantor
          </button>
          {keyName && (
            <button type="button" className="manage-item" onClick={() => choose('delete-key')}>
              {`Apagar tom ${keyName}`}
            </button>
          )}
          <button
            type="button"
            className="manage-item danger"
            onClick={() => choose('delete-song')}
          >
            Apagar música
          </button>
        </div>
      )}
    </div>
  );
}
