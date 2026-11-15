import { useEffect, useRef, useState } from 'react';

export type ManageAction = 'edit' | 'delete-key' | 'delete-song';

export interface ManageMenuProps {
  /** Key currently open; null when the song has no PDF. */
  keyName: string | null;
  onSelect: (action: ManageAction) => void;
}

export function ManageMenu({ keyName, onSelect }: ManageMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onPointerDown = (event: Event): void => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const choose = (action: ManageAction): void => {
    setOpen(false);
    // Dialogs give focus back to the opener: it has to be the button, not the closed menu item.
    trigger.current?.focus();
    onSelect(action);
  };

  return (
    <div ref={root} className="manage">
      <button
        ref={trigger}
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Gerenciar
      </button>
      {open && (
        <div role="menu" aria-label="Gerenciar" className="manage-menu">
          <button
            type="button"
            role="menuitem"
            className="manage-item"
            onClick={() => choose('edit')}
          >
            Editar nome e cantor
          </button>
          {keyName && (
            <button
              type="button"
              role="menuitem"
              className="manage-item"
              onClick={() => choose('delete-key')}
            >
              {`Apagar tom ${keyName}`}
            </button>
          )}
          <button
            type="button"
            role="menuitem"
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
