import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';

interface FocusTrapOptions {
  /** Called on Escape, unless `busy`. */
  onEscape: () => void;
  /** An operation is running: Escape does nothing and focus is kept on the container. */
  busy?: boolean;
  /** Keep Tab inside the container (modal). Escape and focus return always apply. */
  trap?: boolean;
}

/** Moves focus into `root`, returns it to the opener on unmount; Esc closes; Tab can be trapped. */
export function useFocusTrap(
  root: RefObject<HTMLElement | null>,
  { onEscape, busy = false, trap = true }: FocusTrapOptions,
): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => opener?.focus?.();
  }, [root]);

  // The focused control is about to be disabled: keep focus inside, on the container.
  useEffect(() => {
    if (busy) root.current?.focus();
  }, [busy, root]);

  // Document-level so Esc/Tab work wherever focus is.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (!busy) onEscape();
        return;
      }
      if (event.key !== 'Tab' || !trap) return;
      const el = root.current;
      if (!el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        // Every control is disabled: nothing to tab to, stay on the container.
        event.preventDefault();
        el.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !el.contains(active) || active === el;
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
  }, [busy, onEscape, root, trap]);
}
