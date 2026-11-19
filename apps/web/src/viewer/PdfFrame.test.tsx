import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfFrame } from './PdfFrame';

interface FullscreenDoc {
  fullscreenElement?: Element | null;
  exitFullscreen?: () => Promise<void>;
}

const doc = document as unknown as FullscreenDoc;

function stubFullscreenApi() {
  const request = vi.fn(function (this: Element) {
    doc.fullscreenElement = this;
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    doc.fullscreenElement = null;
    return Promise.resolve();
  });
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: request,
  });
  doc.exitFullscreen = exit;
  return { request, exit };
}

afterEach(() => {
  delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
  delete doc.fullscreenElement;
  delete doc.exitFullscreen;
  document.body.style.overflow = '';
});

const frame = (): HTMLElement => screen.getByTestId('pdf-frame');

describe('PdfFrame', () => {
  it('shows the pdf with a maximize button', () => {
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    expect(screen.getByText('cifra')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Tela cheia' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(frame()).not.toHaveClass('is-fullscreen');
  });

  it('maximizes with the css overlay when the browser has no element fullscreen (iPhone)', () => {
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(frame()).toHaveClass('is-fullscreen');
    expect(document.body.style.overflow).toBe('hidden');
    const exit = screen.getByRole('button', { name: 'Sair da tela cheia' });
    expect(exit).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(exit);
    expect(frame()).not.toHaveClass('is-fullscreen');
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeInTheDocument();
  });

  it('closes with Escape', () => {
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(frame()).not.toHaveClass('is-fullscreen');
  });

  it('also asks the browser for real fullscreen and leaves it when closing', () => {
    const { request, exit } = stubFullscreenApi();
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.contexts[0]).toBe(frame());
    expect(frame()).toHaveClass('is-fullscreen');

    fireEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia' }));
    expect(exit).toHaveBeenCalledTimes(1);
    expect(frame()).not.toHaveClass('is-fullscreen');
  });

  it('closes when the browser leaves fullscreen by itself (native Esc / swipe)', () => {
    stubFullscreenApi();
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    // Entering: the browser reports the frame as the fullscreen element, so we stay open.
    fireEvent(document, new Event('fullscreenchange'));
    expect(frame()).toHaveClass('is-fullscreen');

    doc.fullscreenElement = null;
    fireEvent(document, new Event('fullscreenchange'));
    expect(frame()).not.toHaveClass('is-fullscreen');
  });

  it('stays maximized when real fullscreen is refused', async () => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: () => Promise.reject(new TypeError('not allowed')),
    });
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    await Promise.resolve();
    expect(frame()).toHaveClass('is-fullscreen');
  });

  it('releases the page scroll lock and real fullscreen on unmount', () => {
    const { exit } = stubFullscreenApi();
    const { unmount } = render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(exit).toHaveBeenCalled();
  });

  it('does not close on an unrelated fullscreenchange when real fullscreen never started', () => {
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    fireEvent(document, new Event('fullscreenchange'));
    expect(frame()).toHaveClass('is-fullscreen');
  });

  it('leaves real fullscreen if it is granted after the overlay was already closed', async () => {
    let grant: () => void = () => undefined;
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: function (this: Element) {
        return new Promise<void>((resolve) => {
          grant = () => {
            doc.fullscreenElement = this;
            resolve();
          };
        });
      },
    });
    const exit = vi.fn(() => {
      doc.fullscreenElement = null;
      return Promise.resolve();
    });
    doc.exitFullscreen = exit;
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sair da tela cheia' }));
    expect(exit).not.toHaveBeenCalled();
    grant();
    await Promise.resolve();
    await Promise.resolve();
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog with focus on the exit button while maximized', () => {
    render(
      <PdfFrame>
        <p>cifra</p>
      </PdfFrame>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tela cheia' }));
    expect(screen.getByRole('dialog', { name: 'PDF em tela cheia' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    const exit = screen.getByRole('button', { name: 'Sair da tela cheia' });
    expect(exit).toHaveFocus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(exit).toHaveFocus();
  });
});
