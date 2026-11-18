import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { MaisPage } from './MaisPage';

function renderMais(role: Role, signOut = vi.fn(() => Promise.resolve())) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut,
  };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <MaisPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
  return signOut;
}

describe('MaisPage', () => {
  it('shows who is signed in, with the role badge', () => {
    renderMais('member');
    expect(screen.getByRole('heading', { level: 1, name: 'Mais' })).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
    expect(screen.getByText('Membro')).toBeInTheDocument();
  });

  it('offers Admin (to Pessoas) only to admins', () => {
    renderMais('admin');
    expect(screen.getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/pessoas');
  });

  it.each(['member', 'viewer'] as const)('hides Admin from %s', (role) => {
    renderMais(role);
    expect(screen.queryByRole('link', { name: /Admin/ })).not.toBeInTheDocument();
  });

  it('shows Importar (admin tool) only to admins', () => {
    renderMais('member');
    expect(screen.queryByText('Importar')).not.toBeInTheDocument();
    expect(screen.getByText('Pessoas')).toBeInTheDocument();
  });

  it('keeps Pessoas and Importar disabled with "Em breve"', () => {
    renderMais('admin');
    for (const name of ['Pessoas', 'Importar']) {
      const row = screen.getByText(name).closest('.menu-row');
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row?.querySelector('a')).toBeNull();
      expect(row).toHaveTextContent('Em breve');
    }
  });

  it('signs out', () => {
    const signOut = renderMais('viewer');
    fireEvent.click(screen.getByRole('button', { name: /Sair/ }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('has the theme button', () => {
    renderMais('viewer');
    expect(screen.getByRole('button', { name: /tema/i })).toBeInTheDocument();
  });
});
