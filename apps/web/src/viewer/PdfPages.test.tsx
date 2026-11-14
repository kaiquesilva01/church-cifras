import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfPages, type PdfDocument } from './PdfPages';

vi.mock('./PreviewLayer', () => ({
  PreviewLayer: ({ page }: { page: number }) => <i data-testid="layer" data-page={page} />,
}));

function fakeDoc(numPages: number) {
  const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
  const doc: PdfDocument = {
    numPages,
    getPage: (n) =>
      Promise.resolve({
        getViewport: ({ scale }: { scale: number }) => ({
          scale,
          width: 100 * scale,
          height: 140 * scale,
          convertToViewportPoint: (x: number, y: number) => [x * scale, 140 * scale - y * scale],
          pageNumber: n,
        }),
        render,
      }),
  };
  return { doc, render };
}

let width = 300;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.stubGlobal('devicePixelRatio', 2);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  width = 300;
});

describe('PdfPages', () => {
  it('renders every page fitted to the container width with devicePixelRatio', async () => {
    const { doc, render: renderPage } = fakeDoc(2);
    const { container } = render(<PdfPages doc={doc} overlays={[]} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    const canvases = container.querySelectorAll<HTMLCanvasElement>('canvas[data-page]');
    expect(canvases).toHaveLength(2);
    // width 300 / page width 100 = scale 3; backing store x2 for dpr
    expect(canvases[0]!.width).toBe(600);
    expect(canvases[0]!.style.width).toBe('300px');
    expect(screen.getAllByTestId('layer').map((l) => l.dataset.page)).toEqual(['1', '2']);
  });

  it('re-renders after a debounced resize', async () => {
    const { doc, render: renderPage } = fakeDoc(1);
    render(<PdfPages doc={doc} overlays={[]} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    width = 200;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(renderPage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2), { timeout: 1500 });
  });
});
