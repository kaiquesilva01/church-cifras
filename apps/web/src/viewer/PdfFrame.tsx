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
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const doc = document as MaybeFullscreenDocument;
    const el = frame.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    // The browser left real fullscreen by itself (native Esc, swipe): leave the overlay too.
    const onFullscreenChange = (): void => {
      if (doc.fullscreenElement !== el) setOpen(false);
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
    void (frame.current as MaybeFullscreen | null)?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div ref={frame} className={`pdf-frame${open ? ' is-fullscreen' : ''}`} data-testid="pdf-frame">
      <button
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
