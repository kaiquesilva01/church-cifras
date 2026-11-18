import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PadControl } from './PadControl';
import { PadContext, type PadContextValue } from './usePad';
import { usePadViewerSync } from './usePadViewerSync';

const owner = { kind: 'song', songId: 's1' } as const;

function fake(over: Partial<PadContextValue> = {}): PadContextValue {
  return {
    status: 'off',
    note: null,
    owner: null,
    volume: 0.6,
    notice: null,
    toggle: vi.fn(),
    follow: vi.fn(),
    setVolume: vi.fn(),
    prefetch: vi.fn(),
    ...over,
  };
}

const wrap = (value: PadContextValue | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PadContext.Provider value={value}>{children}</PadContext.Provider>;
  };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PadControl', () => {
  it('renders nothing without a provider', () => {
    const { container } = render(<PadControl keyName="Bb" owner={owner} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without a key', () => {
    const { container } = render(<PadControl keyName={null} owner={owner} />, {
      wrapper: wrap(fake()),
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('toggles with the key and owner', () => {
    const value = fake();
    render(<PadControl keyName="Bb" owner={owner} />, { wrapper: wrap(value) });
    const button = screen.getByRole('button', { name: /Pad/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(value.toggle).toHaveBeenCalledWith('Bb', owner);
  });

  it('shows loading', () => {
    render(<PadControl keyName="Bb" owner={owner} />, {
      wrapper: wrap(fake({ status: 'loading' })),
    });
    expect(screen.getByRole('button', { name: 'Carregando pad…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows playing with the volume slider', () => {
    const value = fake({ status: 'playing', note: 'A#' });
    render(<PadControl keyName="Bb" owner={owner} />, { wrapper: wrap(value) });
    expect(screen.getByRole('button', { name: 'Pad A#' })).toHaveAttribute('aria-pressed', 'true');
    const slider = screen.getByLabelText('Volume do pad');
    expect(slider).toHaveValue('60');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(value.setVolume).toHaveBeenCalledWith(0.3);
  });

  it('shows the error and retries on click', () => {
    const value = fake({ status: 'error' });
    render(<PadControl keyName="Bb" owner={owner} />, { wrapper: wrap(value) });
    fireEvent.click(screen.getByRole('button', { name: 'Pad indisponível · tentar de novo' }));
    expect(value.toggle).toHaveBeenCalledWith('Bb', owner);
  });

  it('shows the notice as a status', () => {
    render(<PadControl keyName="Bb" owner={owner} />, {
      wrapper: wrap(fake({ notice: 'Sem conexão' })),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão');
  });
});

describe('usePadViewerSync', () => {
  it('follows the key as it changes, including null', () => {
    const value = fake();
    const { rerender } = renderHook(
      ({ k }: { k: 'G' | 'A' | null }) =>
        usePadViewerSync({ key: k, ready: false, setlistKeys: [] }),
      { wrapper: wrap(value), initialProps: { k: 'G' as 'G' | 'A' | null } },
    );
    expect(value.follow).toHaveBeenLastCalledWith('G');
    rerender({ k: 'A' });
    expect(value.follow).toHaveBeenLastCalledWith('A');
    rerender({ k: null });
    expect(value.follow).toHaveBeenLastCalledWith(null);
  });

  it('prefetches once, only after ready, and never with null keys', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const value = fake();
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        usePadViewerSync({ key: 'G', ready, setlistKeys: ['D', 'A'] }),
      { wrapper: wrap(value), initialProps: { ready: false } },
    );
    vi.advanceTimersByTime(5000);
    expect(value.prefetch).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(value.prefetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    expect(value.prefetch).toHaveBeenCalledTimes(1);
    expect(value.prefetch).toHaveBeenCalledWith(['G', 'D', 'A']);
  });

  it('does not prefetch when there is no key and no setlist keys', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const value = fake();
    renderHook(() => usePadViewerSync({ key: null, ready: true, setlistKeys: [] }), {
      wrapper: wrap(value),
    });
    vi.advanceTimersByTime(5000);
    expect(value.prefetch).not.toHaveBeenCalled();
  });

  it('is a no-op without a provider', () => {
    expect(() =>
      renderHook(() => usePadViewerSync({ key: 'G', ready: true, setlistKeys: [] })),
    ).not.toThrow();
  });
});
