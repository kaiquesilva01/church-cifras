import { useEffect, type FocusEvent, type RefObject } from 'react';

interface DismissableOptions {
  open: boolean;
  onClose: () => void;
  /** The menu's container: pointer and focus inside it do not dismiss. */
  root: RefObject<HTMLElement | null>;
  /** The button that opens the menu; it gets focus back on Escape. */
  trigger: RefObject<HTMLElement | null>;
}

/**
 * Closes an open menu on Escape (focus returns to the trigger), on pointerdown outside and when
 * focus leaves the container. Attach `onBlur` to the container. Escape is ignored while a modal
 * dialog outside the menu is open, so it only closes that dialog.
 */
export function useDismissable({ open, onClose, root, trigger }: DismissableOptions) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      const modals = [...document.querySelectorAll('[aria-modal="true"]')];
      if (modals.some((modal) => !root.current?.contains(modal))) return;
      onClose();
      trigger.current?.focus();
    };
    const onPointerDown = (event: Event): void => {
      if (!root.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose, root, trigger]);

  return {
    onBlur: (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget as Node | null;
      if (open && next && !root.current?.contains(next)) onClose();
    },
  };
}
