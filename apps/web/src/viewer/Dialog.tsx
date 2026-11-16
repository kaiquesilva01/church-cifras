import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from './useFocusTrap';

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

  useFocusTrap(root, { onEscape: onClose, busy });

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
