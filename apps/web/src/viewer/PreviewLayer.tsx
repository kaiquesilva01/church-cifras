import type { OverlayOp } from '@cifras/overlay';
import { useEffect, useRef } from 'react';
import { ensurePreviewFonts, fontFamily } from './previewFonts';

export interface ViewportLike {
  scale: number;
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

export interface CanvasOp {
  rect: { x: number; y: number; width: number; height: number };
  fill: string;
  stroke: string | null;
  text: { value: string; x: number; y: number; font: string };
}

const WHITE = '#ffffff';
const CHANGED = '#fff1a8';
const COLLISION_FILL = '#ffd5d5';
const COLLISION_STROKE = '#e5484d';

// PDF user space (origin bottom-left) to canvas pixels, through the viewport (scale and y flip).
// Highlight colors are preview-only; the written PDF always uses a white rectangle.
export function toCanvasOps(
  ops: OverlayOp[],
  viewport: Pick<ViewportLike, 'scale' | 'convertToViewportPoint'>,
  highlight: boolean,
): CanvasOp[] {
  return ops.map((op) => {
    const { x, y, width, height } = op.rect;
    const [x1 = 0, y1 = 0] = viewport.convertToViewportPoint(x, y);
    const [x2 = 0, y2 = 0] = viewport.convertToViewportPoint(x + width, y + height);
    const [tx = 0, ty = 0] = viewport.convertToViewportPoint(op.text.x, op.text.y);
    const size = op.text.fontSize * viewport.scale;
    const fill = !highlight ? WHITE : op.collides ? COLLISION_FILL : CHANGED;
    return {
      rect: {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
      },
      fill,
      stroke: highlight && op.collides ? COLLISION_STROKE : null,
      text: {
        value: op.text.value,
        x: tx,
        y: ty,
        font: `${size}px "${fontFamily(op.text.fontId)}"`,
      },
    };
  });
}

interface Props {
  page: number;
  viewport: ViewportLike;
  ops: OverlayOp[];
  highlight?: boolean;
  onError?: () => void;
}

// Transparent canvas above one page canvas; redrawing it never touches the page itself.
export function PreviewLayer({ page, viewport, ops, highlight = false, onError }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let cancelled = false;
    const mine = ops.filter((op) => op.page === page);
    const clear = (): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);
    };
    const draw = (): void => {
      clear();
      for (const op of toCanvasOps(mine, viewport, highlight)) {
        ctx.fillStyle = op.fill;
        ctx.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        if (op.stroke) {
          ctx.strokeStyle = op.stroke;
          ctx.lineWidth = 1;
          ctx.strokeRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        }
        ctx.fillStyle = '#000000';
        ctx.font = op.text.font;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(op.text.value, op.text.x, op.text.y);
      }
    };
    if (mine.length === 0) {
      clear();
      return;
    }
    ensurePreviewFonts(mine.map((op) => op.text.fontId)).then(
      () => {
        if (!cancelled) draw();
      },
      () => {
        // Without the font the preview would lie about widths: leave the layer empty.
        if (cancelled) return;
        clear();
        onError?.();
      },
    );
    return () => {
      cancelled = true;
    };
  }, [ops, page, viewport, highlight, dpr, onError]);

  return (
    <canvas
      ref={ref}
      className="pdf-layer"
      aria-hidden="true"
      width={Math.round(viewport.width * dpr)}
      height={Math.round(viewport.height * dpr)}
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
    />
  );
}
