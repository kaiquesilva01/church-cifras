import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import type { SongSummary } from '../catalog/types';
import { fakeCatalogApi } from '../test/fakeCatalogApi';
import { testUser } from '../test/fakeGateway';
import { HomePage } from './HomePage';

function renderHome(options: { role?: Role; path?: string; songs?: SongSummary[] } = {}) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: options.role ?? 'viewer',
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[options.path ?? '/']}>
        <HomePage api={fakeCatalogApi(options.songs)} />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('HomePage', () => {
  it('lists songs with key chips linking to the key', () => {
    renderHome();
    const row = screen.getByRole('link', { name: /Sonda-me/ });
    expect(row).toHaveAttribute('href', '/musicas/s1');
    expect(within(row).getByText('Aline Barros')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'A' })).toHaveAttribute('href', '/musicas/s1?tom=A');
    expect(screen.getByRole('link', { name: 'F#m' })).toHaveAttribute(
      'href',
      '/musicas/s2?tom=Fsm',
    );
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
    expect(screen.getByRole('tab', { name: 'Músicas' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Cantores' }));
    expect(screen.getByRole('tab', { name: 'Cantores' })).toHaveAttribute('aria-selected', 'true');
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
    expect(screen.getByRole('tab', { name: 'Cantores' })).toHaveAttribute('aria-selected', 'true');
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
