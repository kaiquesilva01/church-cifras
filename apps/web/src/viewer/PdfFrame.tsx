import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ExpandIcon, ShrinkIcon } from './barIcons';

// Element fullscreen is missing on iPhone Safari and can be refused elsewhere: the CSS overlay
// (`.is-fullscreen`) is the real feature and the browser API only hides the browser chrome on top.
interface MaybeFullscreen {
  requestFullscreen?: () => Promise<void>;
}
interface MaybeFullscreenDocument {
  fullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
}

/** Wraps the PDF pages with a button that maximizes them, so the cifra can be read without downloading it. */
export function PdfFrame({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // Lets the async fullscreen request know the overlay was closed before it was granted.
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    const doc = document as MaybeFullscreenDocument;
    const el = frame.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Safari does not focus a button on click: put focus on the exit button explicitly.
    button.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
      // The exit button is the only control: keep Tab from reaching the page behind the overlay.
      else if (event.key === 'Tab') {
        event.preventDefault();
        button.current?.focus();
      }
    };
    // The browser left real fullscreen by itself (native Esc, swipe): leave the overlay too. Only once it
    // was really in fullscreen, so an unrelated event (or a refused request) never closes the overlay.
    let nativeEntered = false;
    const onFullscreenChange = (): void => {
      if (doc.fullscreenElement === el) nativeEntered = true;
      else if (nativeEntered) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.body.style.overflow = previousOverflow;
      if (el && doc.fullscreenElement === el) {
        void doc.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, [open]);

  const toggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    // Called here (not in the effect) because it needs the click's user activation.
    void (frame.current as MaybeFullscreen | null)
      ?.requestFullscreen?.()
      .then(() => {
        // Closed before the browser granted it: do not leave the page stuck in fullscreen.
        const doc = document as MaybeFullscreenDocument;
        if (!openRef.current && doc.fullscreenElement === frame.current) {
          void doc.exitFullscreen?.().catch(() => undefined);
        }
      })
      .catch(() => undefined);
  };

  return (
    <div
      ref={frame}
      className={`pdf-frame${open ? ' is-fullscreen' : ''}`}
      data-testid="pdf-frame"
      {...(open ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'PDF em tela cheia' } : null)}
    >
      <button
        ref={button}
        type="button"
        className="pdf-expand"
        aria-label={open ? 'Sair da tela cheia' : 'Tela cheia'}
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? <ShrinkIcon /> : <ExpandIcon />}
      </button>
      {children}
    </div>
  );
}
