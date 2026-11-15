import { KEY_OPTIONS, parseKey, type KeyName } from '@cifras/chords';
import { useEffect, useRef } from 'react';
import { useFocusTrap } from './useFocusTrap';

export interface KeyPanelProps {
  sourceKey: KeyName;
  savedKeys: KeyName[];
  target: KeyName | null;
  onTarget: (key: KeyName) => void;
  onCancel: () => void;
  /** Confirms the target: generates it, or opens it when it is already saved. */
  onConfirm: () => void;
  collisions: number;
  suspects: string[];
  busy: boolean;
  layout: 'sheet' | 'side';
  preparing?: boolean;
  error?: string | null;
  /** The configured writer cannot generate PDFs (rewrite mode). */
  unavailable?: boolean;
  /** Sheet layout: height of the sheet in px (null when it goes away), so the page can leave room. */
  onSheetHeight?: (height: number | null) => void;
}

export function KeyPanel({
  sourceKey,
  savedKeys,
  target,
  onTarget,
  onCancel,
  onConfirm,
  collisions,
  suspects,
  busy,
  layout,
  preparing = false,
  error = null,
  unavailable = false,
  onSheetHeight,
}: KeyPanelProps) {
  const root = useRef<HTMLElement>(null);
  const source = parseKey(sourceKey);
  const options = source?.minor ? KEY_OPTIONS.minor : KEY_OPTIONS.major;
  const saved = target !== null && savedKeys.includes(target);

  // Esc never abandons a PDF that is being generated; only the sheet traps Tab (the page is inert).
  useFocusTrap(root, { onEscape: onCancel, busy, trap: layout === 'sheet' });

  // The sheet has no backdrop (the preview stays visible); the page keeps room below the last page.
  useEffect(() => {
    const el = root.current;
    if (layout !== 'sheet' || !el || !onSheetHeight) return;
    const measure = (): void => onSheetHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
      onSheetHeight(null);
    };
  }, [layout, onSheetHeight]);

  const step = (delta: number): void => {
    const from = target ?? source?.name ?? options[0]!;
    const index = options.indexOf(from);
    onTarget(options[(Math.max(index, 0) + delta + 12) % 12]!);
  };

  const disabled = busy || preparing;
  const confirmLabel = busy
    ? 'Gerando PDF…'
    : saved
      ? `Abrir ${target}`
      : `Confirmar ${target ?? ''}`.trim();
  const confirmDisabled = disabled || !target || (!saved && unavailable);

  const body = (
    <>
      <h2 id="key-panel-title" className="key-panel-title">
        Mudar tom · original {sourceKey}
      </h2>
      <p className="key-legend">
        <span aria-hidden="true">▢ </span>salvo
      </p>
      {preparing && (
        <p role="status" className="status">
          Preparando…
        </p>
      )}
      <div className="key-grid" data-layout={layout}>
        {options.map((key) => {
          const isSaved = savedKeys.includes(key);
          return (
            <button
              key={key}
              type="button"
              className={`btn key-btn${isSaved ? ' saved' : ''}`}
              aria-pressed={key === target}
              aria-label={isSaved ? `${key}, salvo` : key}
              disabled={disabled}
              onClick={() => onTarget(key)}
            >
              {key}
            </button>
          );
        })}
      </div>
      <div className="key-steps">
        <button
          type="button"
          className="btn"
          aria-label="Meio tom abaixo"
          disabled={disabled}
          onClick={() => step(-1)}
        >
          −½
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Meio tom acima"
          disabled={disabled}
          onClick={() => step(1)}
        >
          +½
        </button>
      </div>
      {collisions > 0 && (
        <p role="status" className="key-warning">
          {`⚠ ${collisions} ${collisions === 1 ? 'acorde pode' : 'acordes podem'} encostar no vizinho (em vermelho)`}
        </p>
      )}
      {suspects.length > 0 && (
        <p role="status" className="key-warning">
          {`Confira: não reconhecemos ${suspects.join(', ')} como acorde.`}
        </p>
      )}
      {unavailable && <p className="key-warning">Modo de reescrita ainda não disponível.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="key-actions">
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </>
  );

  if (layout === 'side') {
    return (
      <aside
        ref={root}
        tabIndex={-1}
        className="key-panel"
        data-layout="side"
        aria-labelledby="key-panel-title"
      >
        {body}
      </aside>
    );
  }
  return (
    <section
      ref={root}
      tabIndex={-1}
      className="key-panel"
      data-layout="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="key-panel-title"
    >
      {body}
    </section>
  );
}
