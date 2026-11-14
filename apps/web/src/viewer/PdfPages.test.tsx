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
let observers: Array<{ notify: () => void }> = [];
beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: () => void) {
        observers.push({ notify: () => this.cb() });
      }
      observe() {}
      disconnect() {}
    },
  );
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
    expect(screen.queryAllByTestId('layer')).toHaveLength(0);
  });

  it('re-renders after a debounced ResizeObserver notification with a width-change guard', async () => {
    const { doc, render: renderPage } = fakeDoc(1);
    render(<PdfPages doc={doc} overlays={[]} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    expect(observers).toHaveLength(1);
    // same width: nothing happens
    observers[0]!.notify();
    await new Promise((r) => setTimeout(r, 300));
    expect(renderPage).toHaveBeenCalledTimes(1);
    width = 200;
    observers[0]!.notify();
    observers[0]!.notify();
    expect(renderPage).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2), { timeout: 1500 });
  });

  it('mounts a preview layer only for pages that have ops and caps dpr at 2', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { doc, render: renderPage } = fakeDoc(2);
    const ops = [
      {
        page: 2,
        rect: { x: 0, y: 0, width: 1, height: 1 },
        text: { value: 'D', x: 0, y: 0, fontId: 'mono-bold' as const, fontSize: 10 },
        kind: 'chord' as const,
        collides: false,
      },
    ];
    const { container } = render(<PdfPages doc={doc} overlays={ops} />);
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId('layer').map((l) => l.dataset.page)).toEqual(['2']);
    expect(container.querySelector<HTMLCanvasElement>('canvas[data-page="1"]')!.width).toBe(600);
  });

  it('logs render errors other than cancellation', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { doc } = fakeDoc(1);
    const page = await doc.getPage(1);
    const failing: PdfDocument = {
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          ...page,
          render: () => ({ promise: Promise.reject(new Error('boom')), cancel: vi.fn() }),
        }),
    };
    render(<PdfPages doc={failing} overlays={[]} />);
    await waitFor(() => expect(error).toHaveBeenCalled());
    error.mockClear();
    const cancelled = Object.assign(new Error('x'), { name: 'RenderingCancelledException' });
    const quiet: PdfDocument = {
      numPages: 1,
      getPage: () =>
        Promise.resolve({
          ...page,
          render: () => ({ promise: Promise.reject(cancelled), cancel: vi.fn() }),
        }),
    };
    render(<PdfPages doc={quiet} overlays={[]} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(error).not.toHaveBeenCalled();
  });
});
