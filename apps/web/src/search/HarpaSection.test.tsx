import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
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
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-16T15:00:00Z') });
});
afterEach(() => vi.useRealTimers());

const auth: AuthState = {
  status: 'signed-in',
  user: testUser,
  role: 'viewer',
  prepareSignIn: () => Promise.resolve(),
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};

function renderWith(path: string, page: 'home' | 'busca' = 'home') {
  const setlistApi = fakeSetlistApi();
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <SongsProvider api={fakeCatalogApi(songs)}>
          <SetlistsProvider api={setlistApi}>
            {page === 'home' ? <HomePage setlistApi={setlistApi} /> : <BuscaPage />}
          </SetlistsProvider>
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

  it('opens the Harpa tab from the url and sorts its songs by title', () => {
    renderWith('/?aba=harpa');
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.song-title')?.textContent)
      .filter(Boolean);
    expect(titles).toEqual(['Cântico Novo', 'Hino da Esperança']);
  });

  it('searches inside the Harpa tab only', () => {
    renderWith('/?aba=harpa');
    const search = screen.getByRole('searchbox');
    fireEvent.change(search, { target: { value: 'sonda' } });
    expect(screen.getByText('Nada encontrado para “sonda”.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'esperanca' } });
    expect(screen.getByText('Hino da Esperança')).toBeInTheDocument();
  });

  it('Busca does not list Harpa songs or the Harpa singer', () => {
    renderWith('/busca?q=a', 'busca');
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
    expect(screen.queryByText('Hino da Esperança')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Harpa/ })).not.toBeInTheDocument();
  });
});
