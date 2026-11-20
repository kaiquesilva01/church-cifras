import { render, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LyricsProvider } from '../catalog/LyricsProvider';
import { SongsProvider } from '../catalog/SongsProvider';
import type { LyricHit } from '../catalog/lyricsSearch';
import { fakeCatalogApi, makeSong } from '../test/fakeCatalogApi';
import type { CatalogApi } from '../catalog/catalogApi';
import { LyricsResults, useLyricSearch } from './LyricsResults';

const song = makeSong({ id: 's1', title: 'Santo', titleNormalized: 'santo', artistName: 'Aline' });
const song2 = makeSong({ id: 's2', title: 'Outro', titleNormalized: 'outro', artistName: 'Aline' });

const hit = (s: typeof song): LyricHit => ({
  song: s,
  snippet: [
    { text: 'Santo,', match: true },
    { text: 'é o Senhor', match: false },
  ],
  phrase: true,
});

function wrapperFor(api: CatalogApi) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SongsProvider api={api}>
        <LyricsProvider api={api}>{children}</LyricsProvider>
      </SongsProvider>
    );
  };
}

function renderResults(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('LyricsResults', () => {
  it('shows the heading, the count and the highlighted snippet', () => {
    renderResults(<LyricsResults hits={[hit(song)]} pending={false} />);
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    expect(screen.getByText('1 música')).toBeInTheDocument();
    expect(screen.getByText('Santo,').tagName).toBe('MARK');
    expect(screen.getByText('Santo,').closest('.lyric-snippet')).toHaveTextContent(
      'Santo, é o Senhor',
    );
  });

  it('uses the plural count for several songs', () => {
    renderResults(<LyricsResults hits={[hit(song), hit(song2)]} pending={false} />);
    expect(screen.getByText('2 músicas')).toBeInTheDocument();
  });

  it('shows skeleton cards while pending, without text', () => {
    const { container } = renderResults(<LyricsResults hits={[]} pending />);
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy?.querySelectorAll('.lyric-skeleton-card')).toHaveLength(2);
    expect(busy).toHaveTextContent('');
  });

  it('renders nothing without hits and not pending', () => {
    const { container } = renderResults(<LyricsResults hits={[]} pending={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('marks the snippet words inside a list card with a link to the song', () => {
    renderResults(<LyricsResults hits={[hit(song)]} pending={false} />);
    const card = screen.getByRole('link', { name: 'Santo Aline' }).closest('li')!;
    expect(within(card).getByText('Santo,').tagName).toBe('MARK');
  });
});

describe('useLyricSearch', () => {
  const songs = [song, song2];

  it('is not active below 3 normalized characters', () => {
    const api = fakeCatalogApi(songs, {
      subscribeLyrics: (cb) => {
        cb(new Map([['s1', 'santo']]));
        return () => undefined;
      },
    });
    const { result } = renderHook(() => useLyricSearch(songs, ' ab ', new Set()), {
      wrapper: wrapperFor(api),
    });
    expect(result.current).toEqual({
      hits: [],
      active: false,
      pending: false,
      settled: true,
    });
  });

  it('is pending while lyrics are loading and returns no hits', () => {
    const api = fakeCatalogApi(songs, { subscribeLyrics: () => () => undefined });
    const { result } = renderHook(() => useLyricSearch(songs, 'santo', new Set()), {
      wrapper: wrapperFor(api),
    });
    expect(result.current).toMatchObject({ hits: [], active: true, pending: true, settled: false });
  });

  it('is settled with hits once lyrics are ready', () => {
    const api = fakeCatalogApi(songs, {
      subscribeLyrics: (cb) => {
        cb(new Map([['s1', 'Santo é o Senhor']]));
        return () => undefined;
      },
    });
    const { result } = renderHook(() => useLyricSearch(songs, 'santo', new Set()), {
      wrapper: wrapperFor(api),
    });
    expect(result.current).toMatchObject({ active: true, pending: false, settled: true });
    expect(result.current.hits.map((h) => h.song.id)).toEqual(['s1']);
  });

  it('is settled without hits when lyrics fail', () => {
    const api = fakeCatalogApi(songs, {
      subscribeLyrics: (_cb, onError) => {
        onError(new Error('falhou'));
        return () => undefined;
      },
    });
    const { result } = renderHook(() => useLyricSearch(songs, 'santo', new Set()), {
      wrapper: wrapperFor(api),
    });
    expect(result.current).toMatchObject({ hits: [], active: true, pending: false, settled: true });
  });

  it('skips excluded songs', () => {
    const api = fakeCatalogApi(songs, {
      subscribeLyrics: (cb) => {
        cb(new Map([['s1', 'Santo é o Senhor']]));
        return () => undefined;
      },
    });
    const { result } = renderHook(() => useLyricSearch(songs, 'santo', new Set(['s1'])), {
      wrapper: wrapperFor(api),
    });
    expect(result.current.hits).toEqual([]);
  });
});
