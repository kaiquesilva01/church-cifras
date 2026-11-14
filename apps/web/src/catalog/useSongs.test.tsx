import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogApi } from './catalogApi';
import type { SongSummary } from './types';
import { useSongs } from './useSongs';

function Probe({ api }: { api: CatalogApi }) {
  const { status, songs } = useSongs(api);
  return (
    <p>
      {status}:{songs.map((s) => s.title).join(',')}
    </p>
  );
}

describe('useSongs', () => {
  it('useSongs exposes loading, ready and error', () => {
    let onSongs: (s: SongSummary[]) => void = () => undefined;
    let onError: (e: unknown) => void = () => undefined;
    const unsubscribe = vi.fn();
    const api = {
      subscribeSongs: (cb: typeof onSongs, err: typeof onError) => {
        onSongs = cb;
        onError = err;
        return unsubscribe;
      },
    } as unknown as CatalogApi;

    const { unmount } = render(<Probe api={api} />);
    expect(screen.getByText('loading:')).toBeInTheDocument();
    act(() =>
      onSongs([
        {
          id: '1',
          title: 'Sonda-me',
          titleNormalized: 'sonda me',
          artistId: 'a',
          artistName: 'A',
          keys: [],
          handmadeKeys: [],
        },
      ]),
    );
    expect(screen.getByText('ready:Sonda-me')).toBeInTheDocument();
    act(() => onError(new Error('offline')));
    expect(screen.getByText('error:Sonda-me')).toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
