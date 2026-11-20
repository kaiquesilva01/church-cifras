import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LyricsProvider } from '../catalog/LyricsProvider';
import { SongsProvider } from '../catalog/SongsProvider';
import type { CatalogApi } from '../catalog/catalogApi';
import type { SongSummary } from '../catalog/types';
import { fakeCatalogApi, makeSong, sampleSongs } from '../test/fakeCatalogApi';
import { BuscaPage } from './BuscaPage';

const lyrics = new Map([
  ['s1', 'Santo, santo, santo é o Senhor Deus todo poderoso'],
  ['s3', 'Grande é o Senhor, digno de louvor'],
]);

function renderBusca(
  path = '/busca',
  api: CatalogApi = fakeCatalogApi(sampleSongs, {
    subscribeLyrics: (cb) => {
      cb(lyrics);
      return () => undefined;
    },
  }),
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SongsProvider api={api}>
        <LyricsProvider api={api}>
          <BuscaPage />
        </LyricsProvider>
      </SongsProvider>
    </MemoryRouter>,
  );
}

/** Songs with a Harpa hymn, to check which section each one lands in. */
const mixedSongs: SongSummary[] = [
  makeSong({
    id: 's1',
    title: 'Sonda-me',
    titleNormalized: 'sonda me',
    artistName: 'Aline Barros',
  }),
  makeSong({
    id: 'h1',
    title: 'Hino de louvor',
    titleNormalized: 'hino de louvor',
    artistId: 'harpa',
    artistName: 'Harpa',
  }),
];
const mixedLyrics = new Map([
  ['s1', 'Santo, santo, santo é o Senhor'],
  ['h1', 'Santo é o Senhor Deus'],
]);
const mixedApi = fakeCatalogApi(mixedSongs, {
  subscribeLyrics: (cb) => {
    cb(mixedLyrics);
    return () => undefined;
  },
});

describe('BuscaPage', () => {
  it('asks for a search before showing anything', () => {
    renderBusca();
    expect(screen.getByRole('heading', { level: 1, name: 'Busca' })).toBeInTheDocument();
    expect(screen.getByText('Digite para buscar uma música ou um cantor.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
  });

  it('shows singers and songs together for the same query', () => {
    renderBusca('/busca?q=aline');
    const singers = screen.getByRole('heading', { name: 'Cantores' }).nextElementSibling!;
    expect(within(singers as HTMLElement).getByText('Aline Barros')).toBeInTheDocument();
    const songs = screen.getByRole('heading', { name: 'Músicas' }).nextElementSibling!;
    expect(within(songs as HTMLElement).getByText('Sonda-me')).toBeInTheDocument();
    expect(within(songs as HTMLElement).getByText('Ressuscita-me')).toBeInTheDocument();
  });

  it('filters to songs only or singers only', () => {
    renderBusca('/busca?q=aline');
    fireEvent.click(screen.getByRole('button', { name: 'Músicas' }));
    expect(screen.queryByRole('heading', { name: 'Cantores' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Músicas' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cantores' }));
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cantores' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cantores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('clears the query with the × button and keeps the chosen filter', () => {
    renderBusca('/busca?q=aline&tipo=cantores');
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(screen.getByText('Digite para buscar uma música ou um cantor.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cantores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the filter in the url, next to the query', () => {
    renderBusca('/busca?q=aline&tipo=cantores');
    expect(screen.getByRole('button', { name: 'Cantores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'sonda' } });
    // Typing keeps the chosen filter.
    expect(screen.getByRole('button', { name: 'Cantores' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('types into the url and says when nothing matches', () => {
    renderBusca();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
  });

  it('finds songs by accent-insensitive title', () => {
    renderBusca('/busca?q=ressuscita');
    expect(screen.getByText('Ressuscita-me')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
  });

  it('places the search in the Busca placeholder and label', () => {
    renderBusca();
    const field = screen.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' });
    expect(field).toHaveAttribute('placeholder', 'Buscar música, cantor ou letra…');
  });

  it('shows a "Na letra" section with the snippet and the highlighted words', () => {
    renderBusca('/busca?q=santo');
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    // A single word is highlighted on every occurrence in the snippet (one merged run).
    expect(screen.getByText('Santo, santo, santo').tagName).toBe('MARK');
    expect(screen.getByText('1 música')).toBeInTheDocument();
  });

  it('does not repeat a song already listed by title', () => {
    renderBusca(
      '/busca?q=sonda',
      fakeCatalogApi(sampleSongs, {
        subscribeLyrics: (cb) => {
          cb(new Map([['s1', 'Sonda-me, sonda-me']]));
          return () => undefined;
        },
      }),
    );
    expect(screen.getByRole('heading', { name: 'Músicas' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
  });

  it('hides "Na letra" under the Cantores filter', () => {
    renderBusca('/busca?q=santo&tipo=cantores', mixedApi);
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
  });

  it('shows "Na letra" under Tudo with songs and hymns, only songs under Músicas, only hymns under Harpa', () => {
    const tudo = renderBusca('/busca?q=santo', mixedApi);
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    expect(screen.getByText('2 músicas')).toBeInTheDocument();
    tudo.unmount();

    const musicas = renderBusca('/busca?q=santo&tipo=musicas', mixedApi);
    expect(screen.getByText('1 música')).toBeInTheDocument();
    expect(screen.queryByText('Hino de louvor')).not.toBeInTheDocument();
    musicas.unmount();

    renderBusca('/busca?q=santo&tipo=harpa', mixedApi);
    expect(screen.getByText('1 música')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
    expect(screen.getByText('Hino de louvor')).toBeInTheDocument();
  });

  it('shows skeleton cards while lyrics load, with title results already visible', () => {
    const { container } = renderBusca(
      '/busca?q=aline',
      fakeCatalogApi(sampleSongs, { subscribeLyrics: () => () => undefined }),
    );
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('does not show "Nada encontrado" while lyrics are loading', () => {
    renderBusca(
      '/busca?q=zzz',
      fakeCatalogApi(sampleSongs, { subscribeLyrics: () => () => undefined }),
    );
    expect(screen.getByRole('heading', { name: 'Na letra' })).toBeInTheDocument();
    expect(screen.queryByText(/Nada encontrado/)).not.toBeInTheDocument();
  });

  it('shows "Nada encontrado" when lyrics are ready and nothing matched', () => {
    renderBusca('/busca?q=zzz');
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
  });

  it('shows nothing in "Na letra" when lyrics fail, and titles keep working', () => {
    renderBusca(
      '/busca?q=aline',
      fakeCatalogApi(sampleSongs, {
        subscribeLyrics: (_cb, onError) => {
          onError(new Error('falhou'));
          return () => undefined;
        },
      }),
    );
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('does not search lyrics for queries under 3 characters', () => {
    const { container } = renderBusca(
      '/busca?q=ab',
      fakeCatalogApi(sampleSongs, { subscribeLyrics: () => () => undefined }),
    );
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('shows a song without a lyrics entry by its title', () => {
    renderBusca(
      '/busca?q=ressuscita',
      fakeCatalogApi(sampleSongs, {
        subscribeLyrics: (cb) => {
          cb(new Map());
          return () => undefined;
        },
      }),
    );
    expect(screen.getByText('Ressuscita-me')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
  });

  it('shows no endless skeleton when the songs fail to load', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { container } = renderBusca(
      '/busca?q=senhor',
      fakeCatalogApi(sampleSongs, {
        subscribeSongs: (_cb, onError) => {
          onError(new Error('offline'));
          return () => undefined;
        },
        subscribeLyrics: () => () => undefined,
      }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as cifras.');
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Na letra' })).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
