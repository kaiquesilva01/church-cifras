import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from '../catalog/catalogApi';
import type { ArrangementSummary } from '../catalog/types';
import { useSongArrangements } from './useSongArrangements';

function Probe({ api, songId }: { api: CatalogApi; songId: string | null }) {
  const { status, arrangements } = useSongArrangements(api, songId);
  return (
    <p>
      {status}:{arrangements.map((a) => `${a.key}/${a.slug}/${a.source}`).join(',')}
    </p>
  );
}

const summary = (
  key: ArrangementSummary['key'],
  source: ArrangementSummary['source'],
): ArrangementSummary => ({ key, source, storagePath: 'p', derivedFromKey: null, collisions: 0 });

describe('useSongArrangements', () => {
  it('useSongArrangements does not subscribe without song', () => {
    const subscribeArrangements = vi.fn(() => () => undefined);
    render(<Probe api={{ subscribeArrangements } as unknown as CatalogApi} songId={null} />);
    expect(subscribeArrangements).not.toHaveBeenCalled();
    expect(screen.getByText('idle:')).toBeInTheDocument();
  });

  it('exposes loading, ordered views, error and unsubscribes', () => {
    let onData: (a: ArrangementSummary[]) => void = () => undefined;
    let onError: (e: unknown) => void = () => undefined;
    const unsubscribe = vi.fn();
    const subscribeArrangements = vi.fn((_id: string, cb: typeof onData, err?: typeof onError) => {
      onData = cb;
      onError = err ?? onError;
      return unsubscribe;
    });
    const api = { subscribeArrangements } as unknown as CatalogApi;
    const { unmount } = render(<Probe api={api} songId="s1" />);
    expect(subscribeArrangements.mock.calls[0]![0]).toBe('s1');
    expect(screen.getByText('loading:')).toBeInTheDocument();
    act(() =>
      onData([summary('A', 'generated'), summary('F#m', 'handmade'), summary('G', 'handmade')]),
    );
    expect(
      screen.getByText('ready:G/G/handmade,A/A/generated,F#m/Fsm/handmade'),
    ).toBeInTheDocument();
    act(() => onError(new Error('offline')));
    expect(screen.getByText(/^error:/)).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
