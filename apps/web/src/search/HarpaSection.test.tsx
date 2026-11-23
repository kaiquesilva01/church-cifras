import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
import { LyricsProvider } from '../catalog/LyricsProvider';
import { SongsProvider } from '../catalog/SongsProvider';
import { SetlistsProvider } from '../setlists/SetlistsProvider';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { makeSong } from '../test/fakeCatalogApi';
import { fakeSetlistApi } from '../test/fakeSetlistApi';
import { testUser } from '../test/fakeGateway';
import { BuscaPage } from './BuscaPage';
import { HomePage } from './HomePage';

const songs: SongSummary[] = [
  makeSong({
    id: 'a1',
    title: 'Sonda-me',
    titleNormalized: 'sonda me',
    artistId: 'aline-barros',
    artistName: 'Aline Barros',
  }),
  makeSong({
    id: 'h1',
    title: 'Hino da Esperança',
    titleNormalized: 'hino da esperanca',
    artistId: 'harpa',
    artistName: 'Harpa',
  }),
  makeSong({
    id: 'h2',
    title: 'Cântico Novo',
    titleNormalized: 'cantico novo',
    artistId: 'harpa',
    artistName: 'Harpa',
  }),
  makeSong({
    id: 'h3',
    title: '134 - Trabalhai E Orai',
    titleNormalized: '134 trabalhai e orai',
    artistId: 'harpa',
    artistName: 'Harpa',
  }),
  makeSong({
    id: 'h4',
    title: '15 - Conversão',
    titleNormalized: '15 conversao',
    artistId: 'harpa',
    artistName: 'Harpa',
  }),
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

const auth: AuthState = {
  status: 'signed-in',
  user: testUser,
  role: 'viewer',
  access: 'granted',
  prepareSignIn: () => Promise.resolve(),
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};

function renderWith(path: string, page: 'home' | 'busca' = 'home') {
  const setlistApi = fakeSetlistApi();
  const catalogApi = fakeCatalogApi(songs);
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <SongsProvider api={catalogApi}>
          <LyricsProvider api={catalogApi}>
            <SetlistsProvider api={setlistApi}>
              {page === 'home' ? <HomePage setlistApi={setlistApi} /> : <BuscaPage />}
            </SetlistsProvider>
          </LyricsProvider>
        </SongsProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('seção Harpa', () => {
  it('Músicas does not list Harpa songs', () => {
    renderWith('/');
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
    expect(screen.queryByText('Hino da Esperança')).not.toBeInTheDocument();
    expect(screen.queryByText('Cântico Novo')).not.toBeInTheDocument();
  });

  it('Cantores does not list the Harpa singer', () => {
    renderWith('/?aba=cantores');
    expect(screen.getByRole('link', { name: /Aline Barros/ })).toBeInTheDocument();
    expect(within(screen.getByRole('list')).queryByText('Harpa')).not.toBeInTheDocument();
  });

  it('has a Harpa tab that lists only Harpa songs', () => {
    renderWith('/');
    fireEvent.click(screen.getByRole('link', { name: 'Harpa' }));
    expect(screen.getByRole('link', { name: 'Harpa' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Hino da Esperança')).toBeInTheDocument();
    expect(screen.getByText('Cântico Novo')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
  });

  it('opens the Harpa tab from the url and sorts hymns by number, then title', () => {
    renderWith('/?aba=harpa');
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.song-title')?.textContent)
      .filter(Boolean);
    expect(titles).toEqual([
      '15 - Conversão',
      '134 - Trabalhai E Orai',
      'Cântico Novo',
      'Hino da Esperança',
    ]);
  });

  it('searches inside the Harpa tab only', () => {
    renderWith('/?aba=harpa');
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'sonda' } });
    expect(screen.getByText('Nada encontrado para “sonda”.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'esperanca' } });
    expect(screen.getByText('Hino da Esperança')).toBeInTheDocument();
  });

  it('Busca "Tudo" has a Harpa section with Harpa songs, apart from Músicas and Cantores', () => {
    renderWith('/busca?q=a', 'busca');
    const harpa = screen.getByRole('heading', { name: 'Harpa' }).nextElementSibling as HTMLElement;
    expect(within(harpa).getByText('Hino da Esperança')).toBeInTheDocument();
    expect(within(harpa).queryByText('Sonda-me')).not.toBeInTheDocument();
    const musicas = screen.getByRole('heading', { name: 'Músicas' })
      .nextElementSibling as HTMLElement;
    expect(within(musicas).getByText('Sonda-me')).toBeInTheDocument();
    expect(within(musicas).queryByText('Hino da Esperança')).not.toBeInTheDocument();
    // Harpa is not a singer.
    const cantores = screen.getByRole('heading', { name: 'Cantores' })
      .nextElementSibling as HTMLElement;
    expect(within(cantores).queryByText('Harpa')).not.toBeInTheDocument();
  });

  it('Busca sorts the Harpa section by hymn number', () => {
    renderWith('/busca?q=a', 'busca');
    const harpa = screen.getByRole('heading', { name: 'Harpa' }).nextElementSibling as HTMLElement;
    const titles = [...harpa.querySelectorAll('.song-title')].map((n) => n.textContent);
    expect(titles).toEqual([
      '15 - Conversão',
      '134 - Trabalhai E Orai',
      'Cântico Novo',
      'Hino da Esperança',
    ]);
  });

  it('Busca has a Harpa filter that shows only that section', () => {
    renderWith('/busca?q=a&tipo=harpa', 'busca');
    expect(screen.getByRole('button', { name: 'Harpa' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Harpa' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Músicas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Cantores' })).not.toBeInTheDocument();
  });

  it('Músicas and Cantores filters hide the Harpa section', () => {
    renderWith('/busca?q=a&tipo=musicas', 'busca');
    expect(screen.queryByRole('heading', { name: 'Harpa' })).not.toBeInTheDocument();
  });
});
