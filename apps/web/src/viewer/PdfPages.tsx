import type { OverlayOp } from '@cifras/overlay';
import { useEffect, useRef, useState } from 'react';
import { PreviewLayer, type ViewportLike } from './PreviewLayer';

interface RenderTaskLike {
  promise: Promise<unknown>;
  cancel(): void;
}

export interface PdfPageLike {
  getViewport(params: { scale: number }): ViewportLike;
  render(params: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: ViewportLike;
  }): RenderTaskLike;
}

// The subset of pdf.js's PDFDocumentProxy the viewer uses (also lets tests pass a fake).
export interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy?(): Promise<void> | void;
}

interface Layout {
  pageNumber: number;
  page: PdfPageLike;
  css: ViewportLike;
}

const RESIZE_DEBOUNCE_MS = 200;
// Retina is enough for reading; 3x would triple the canvas memory.
const MAX_DPR = 2;

export function PdfPages({
  doc,
  overlays,
  highlight = true,
  onPreviewError,
}: {
  doc: PdfDocument;
  overlays: OverlayOp[];
  highlight?: boolean;
  onPreviewError?: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  const [width, setWidth] = useState(0);
  const [layout, setLayout] = useState<Layout[]>([]);
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    setWidth(el.clientWidth);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = (): void => {
      clearTimeout(timer);
      // Width-change guard: height-only changes (our own pages growing) must not re-render.
      timer = setTimeout(() => {
        const next = el.clientWidth;
        setWidth((current) => (current === next ? current : next));
      }, RESIZE_DEBOUNCE_MS);
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Fit every page to the container width.
  useEffect(() => {
    if (width <= 0) return;
    let cancelled = false;
    void (async () => {
      const next: Layout[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        next.push({ pageNumber: n, page, css: page.getViewport({ scale: width / base.width }) });
      }
      if (!cancelled) setLayout(next);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, width]);

  // Paint one page at a time to keep memory modest.
  useEffect(() => {
    let cancelled = false;
    let task: RenderTaskLike | null = null;
    void (async () => {
      for (const { pageNumber, page, css } of layout) {
        const canvas = canvases.current.get(pageNumber);
        const ctx = canvas?.getContext('2d');
        if (cancelled || !canvas || !ctx) return;
        task = page.render({
          canvas,
          canvasContext: ctx,
          viewport: page.getViewport({ scale: css.scale * dpr }),
        });
        await task.promise;
      }
    })().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== 'RenderingCancelledException') {
        console.error('Falha ao renderizar a página do PDF', error);
      }
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [layout, dpr]);

  return (
    <div ref={container} className="pdf-pages">
      {layout.map(({ pageNumber, css }) => (
        <div
          key={pageNumber}
          className="pdf-page"
          style={{ width: `${css.width}px`, height: `${css.height}px` }}
        >
          <canvas
            data-page={pageNumber}
            ref={(el) => {
              if (el) canvases.current.set(pageNumber, el);
              else canvases.current.delete(pageNumber);
            }}
            width={Math.round(css.width * dpr)}
            height={Math.round(css.height * dpr)}
            style={{ width: `${css.width}px`, height: `${css.height}px` }}
          />
          {overlays.some((op) => op.page === pageNumber) && (
            <PreviewLayer
              page={pageNumber}
              viewport={css}
              ops={overlays}
              highlight={highlight}
              onError={onPreviewError}
            />
          )}
        </div>
      ))}
    </div>
  );
}
