import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import type { SongSummary } from './types';
import { LyricsProvider, useLyricsContext } from './LyricsProvider';
import { SongsProvider } from './SongsProvider';

function Consumer({ id }: { id: string }) {
  const { status, lyrics } = useLyricsContext();
  return <p data-testid={id}>{`${status}:${lyrics.size}`}</p>;
}

describe('LyricsProvider', () => {
  it('subscribes to lyrics only after songs is ready', () => {
    let onSongs: (songs: SongSummary[]) => void = () => undefined;
    const subscribeSongs = vi.fn((cb: typeof onSongs) => {
      onSongs = cb;
      return () => undefined;
    });
    const subscribeLyrics = vi.fn((cb: (l: Map<string, string>) => void) => {
      cb(new Map([['s1', 'Sonda-me']]));
      return () => undefined;
    });
    const api = fakeCatalogApi(undefined, { subscribeSongs, subscribeLyrics });
    render(
      <SongsProvider api={api}>
        <LyricsProvider api={api}>
          <Consumer id="a" />
        </LyricsProvider>
      </SongsProvider>,
    );
    expect(subscribeLyrics).not.toHaveBeenCalled();
    expect(screen.getByTestId('a')).toHaveTextContent('idle:0');

    act(() => onSongs([]));
    expect(subscribeLyrics).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('a')).toHaveTextContent('ready:1');
  });

  it('throws without a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Consumer id="a" />)).toThrow(/LyricsProvider/);
    spy.mockRestore();
  });
});
