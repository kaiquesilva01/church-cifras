import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        trigger.current?.focus();
      }
    };
    const onPointerDown = (event: Event): void => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onOpenChange]);

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
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) onOpenChange(false);
      }}
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
