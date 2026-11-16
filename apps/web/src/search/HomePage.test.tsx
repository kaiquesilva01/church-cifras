import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
import { SongsProvider } from '../catalog/SongsProvider';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { HomePage } from './HomePage';

function StateProbe() {
  const { state } = useLocation();
  return <output data-testid="state">{JSON.stringify(state)}</output>;
}

function renderHome(
  options: { role?: Role; path?: string; songs?: SongSummary[]; state?: unknown } = {},
) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: options.role ?? 'viewer',
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter
        initialEntries={[
          options.state === undefined
            ? (options.path ?? '/')
            : { pathname: options.path ?? '/', state: options.state },
        ]}
      >
        <SongsProvider api={fakeCatalogApi(options.songs)}>
          <HomePage />
          <StateProbe />
        </SongsProvider>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('HomePage', () => {
  it('shows the notice passed by navigation state once', async () => {
    renderHome({ state: { notice: 'Música apagada.' } });
    expect(screen.getByText('Música apagada.').closest('[role="status"]')).not.toBeNull();
  });

  it('clears the navigation state after showing the notice', async () => {
    renderHome({ state: { notice: 'Música apagada.' } });
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('null'));
    expect(screen.getByText('Música apagada.')).toBeInTheDocument();
  });

  it('shows no notice without navigation state', () => {
    renderHome();
    expect(screen.queryByText('Música apagada.')).not.toBeInTheDocument();
  });

  it('lists songs with key chips linking to the key', () => {
    renderHome();
    const row = screen.getByText('Sonda-me').closest('a')!;
    expect(row).toHaveAttribute('href', '/musicas/s1');
    expect(within(row).getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sonda-me, tom A' })).toHaveAttribute(
      'href',
      '/musicas/s1?tom=A',
    );
    expect(screen.getByRole('link', { name: 'Ressuscita-me, tom F#m' })).toHaveAttribute(
      'href',
      '/musicas/s2?tom=Fsm',
    );
  });

  it('lists songs sorted by normalized title', () => {
    renderHome();
    const titles = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('.song-title')?.textContent)
      .filter(Boolean);
    expect(titles).toEqual(['Grande é o Senhor', 'Ressuscita-me', 'Sonda-me']);
  });

  it('searches by artist', () => {
    renderHome();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar música ou cantor…' }), {
      target: { value: 'adhemar' },
    });
    expect(screen.getByText('Grande é o Senhor')).toBeInTheDocument();
    expect(screen.queryByText('Sonda-me')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('Nada encontrado para “zzz”.')).toBeInTheDocument();
  });

  it('switches to Cantores tab and filters artists', () => {
    renderHome();
    expect(screen.getByRole('link', { name: 'Músicas' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('link', { name: 'Cantores' }));
    expect(screen.getByRole('link', { name: 'Cantores' })).toHaveAttribute('aria-current', 'page');
    const aline = screen.getByRole('link', { name: /Aline Barros/ });
    expect(aline).toHaveAttribute('href', '/cantores/aline-barros');
    expect(aline).toHaveTextContent('2 músicas');
    expect(screen.getByRole('link', { name: /Adhemar de Campos/ })).toHaveTextContent('1 música ›');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cantor…' }), {
      target: { value: 'aline' },
    });
    expect(screen.queryByText('Adhemar de Campos')).not.toBeInTheDocument();
  });

  it('opens the Cantores tab from the url', () => {
    renderHome({ path: '/?aba=cantores' });
    expect(screen.getByRole('link', { name: 'Cantores' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the search when navigating back', () => {
    renderHome({ path: '/?q=aline' });
    expect(screen.getByRole('searchbox')).toHaveValue('aline');
    expect(screen.queryByText('Grande é o Senhor')).not.toBeInTheDocument();
    expect(screen.getByText('Sonda-me')).toBeInTheDocument();
  });

  it('clears the search when switching tabs', () => {
    renderHome({ path: '/?q=aline' });
    fireEvent.click(screen.getByRole('link', { name: 'Cantores' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('shows the error copy when loading fails', () => {
    const api = fakeCatalogApi([], {
      subscribeSongs: (_cb, onError) => {
        onError(new Error('x'));
        return () => undefined;
      },
    });
    render(
      <AuthContext.Provider
        value={{
          status: 'signed-in',
          user: testUser,
          role: 'viewer',
          signIn: () => Promise.resolve(),
          signOut: () => Promise.resolve(),
        }}
      >
        <MemoryRouter>
          <SongsProvider api={api}>
            <HomePage />
            <StateProbe />
          </SongsProvider>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar as cifras.');
  });

  it('shows Nova cifra only for editors', () => {
    const { unmount } = renderHome({ role: 'viewer' });
    expect(screen.queryByRole('link', { name: /Nova cifra/ })).not.toBeInTheDocument();
    unmount();
    renderHome({ role: 'member' });
    expect(screen.getByRole('link', { name: '＋ Nova cifra' })).toHaveAttribute('href', '/nova');
  });

  it('shows empty catalog message', () => {
    renderHome({ songs: [] });
    expect(screen.getByText('Nenhuma cifra ainda.')).toBeInTheDocument();
  });
});
