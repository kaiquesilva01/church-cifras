import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled])';

export interface DialogProps {
  titleId: string;
  onClose: () => void;
  /** An operation is running: Escape does nothing. */
  busy?: boolean;
  children: ReactNode;
}

/** Modal shell: focus moves in, returns to the opener on close; Esc closes; Tab stays inside. */
export function Dialog({ titleId, onClose, busy = false, children }: DialogProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (!busy) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      const outside = !root.current?.contains(active) || active === root.current;
      if (event.shiftKey && (outside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onClose]);

  return (
    <div className="dialog-backdrop">
      <div
        ref={root}
        tabIndex={-1}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </div>
    </div>
  );
}
