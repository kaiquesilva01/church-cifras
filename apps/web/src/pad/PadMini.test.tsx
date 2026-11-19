import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PadMini } from './PadMini';
import { PadContext, type PadContextValue } from './usePad';

const owner = { kind: 'setlist', setlistId: 'r1' } as const;

function fake(over: Partial<PadContextValue> = {}): PadContextValue {
  return {
    status: 'playing',
    note: 'Bb' as never,
    owner,
    volume: 0.6,
    notice: null,
    toggle: vi.fn(),
    follow: vi.fn(),
    setVolume: vi.fn(),
    cachedNotes: new Set(),
    prefetch: vi.fn(),
    ...over,
  };
}

const wrap = (value: PadContextValue | null) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <PadContext.Provider value={value}>{children}</PadContext.Provider>;
  };

function mount(value: PadContextValue | null, setlistId = 'r1') {
  return render(<PadMini setlistId={setlistId} />, { wrapper: wrap(value) });
}

describe('PadMini', () => {
  it('renders nothing without a provider', () => {
    const { container } = mount(null);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['off', { status: 'off', owner: null }],
    ['error', { status: 'error' }],
    ['another setlist', { owner: { kind: 'setlist', setlistId: 'r2' } }],
    ['a song owner', { owner: { kind: 'song', songId: 's1' } }],
  ] as const)('renders nothing when %s', (_name, over) => {
    const { container } = mount(fake(over as Partial<PadContextValue>));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the note and a Parar button when playing for this setlist', () => {
    mount(fake({ note: 'F#' }));
    expect(screen.getByText('Pad F# tocando')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Parar' })).toBeInTheDocument();
  });

  it('calls toggle once with the note and owner on Parar', () => {
    const toggle = vi.fn();
    mount(fake({ note: 'F#', toggle }));
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle).toHaveBeenCalledWith('F#', owner);
  });

  it('adjusts the volume through the slider', () => {
    const setVolume = vi.fn();
    mount(fake({ setVolume }));
    const slider = screen.getByRole('slider', { name: 'Volume do pad' });
    expect(slider).toHaveValue('60');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(setVolume).toHaveBeenCalledWith(0.3);
  });

  it('shows the loading text and still allows stopping', () => {
    const toggle = vi.fn();
    mount(fake({ status: 'loading', note: null, toggle }));
    expect(screen.getByText('Carregando pad…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('announces the notice in a status region', () => {
    mount(fake({ notice: 'Sem conexão' }));
    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão');
  });
});
