import { render, waitFor } from '@testing-library/react';
import type { OverlayOp } from '@cifras/overlay/ops';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewLayer, toCanvasOps } from './PreviewLayer';

vi.mock('./previewFonts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./previewFonts')>()),
  ensurePreviewFonts: vi.fn(() => Promise.resolve()),
}));

// scale 2, page 800px tall, y flipped like a pdf.js viewport
const viewport = {
  scale: 2,
  width: 600,
  height: 800,
  convertToViewportPoint: (x: number, y: number): number[] => [x * 2, 800 - y * 2],
};

const op = (overrides: Partial<OverlayOp> = {}): OverlayOp => ({
  page: 1,
  rect: { x: 10, y: 20, width: 30, height: 12 },
  text: { value: 'D', x: 11, y: 22, fontId: 'mono-bold', fontSize: 10 },
  kind: 'chord',
  collides: false,
  ...overrides,
});

afterEach(() => vi.restoreAllMocks());

describe('toCanvasOps', () => {
  it('toCanvasOps converts pdf coordinates to canvas', () => {
    const [out] = toCanvasOps([op()], viewport, false);
    expect(out!.rect).toEqual({ x: 20, y: 736, width: 60, height: 24 });
    expect(out!.text).toEqual({ value: 'D', x: 22, y: 756, font: '20px "cifras-mono-bold"' });
  });

  it('highlights changed and colliding chords only in preview', () => {
    const ops = [op(), op({ collides: true })];
    const plain = toCanvasOps(ops, viewport, false);
    expect(plain.map((o) => [o.fill, o.stroke])).toEqual([
      ['#ffffff', null],
      ['#ffffff', null],
    ]);
    const marked = toCanvasOps(ops, viewport, true);
    expect(marked.map((o) => [o.fill, o.stroke])).toEqual([
      ['#fff1a8', null],
      ['#ffd5d5', '#e5484d'],
    ]);
  });
});

describe('PreviewLayer', () => {
  it('draws only the ops of its page onto a layer canvas', async () => {
    const ctx = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      font: '',
      textBaseline: '',
      fontKerning: 'auto',
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );
    const { container } = render(
      <PreviewLayer
        page={1}
        viewport={viewport}
        ops={[op(), op({ page: 2, text: { ...op().text, value: 'X' } })]}
        highlight
      />,
    );
    await waitFor(() => expect(ctx.fillText).toHaveBeenCalledTimes(1));
    expect(ctx.fillText).toHaveBeenCalledWith('D', 22, 756);
    expect(ctx.fillRect).toHaveBeenCalledWith(20, 736, 60, 24);
    // Widths are measured without kerning: the canvas must not apply it either.
    expect(ctx.fontKerning).toBe('none');
    expect(container.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });

  it('reports a font load failure through onError', async () => {
    const { ensurePreviewFonts } = await import('./previewFonts');
    vi.mocked(ensurePreviewFonts).mockRejectedValueOnce(new Error('no font'));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
      clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const onError = vi.fn();
    render(<PreviewLayer page={1} viewport={viewport} ops={[op()]} onError={onError} />);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
  });
});
