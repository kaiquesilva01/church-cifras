import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { PushContext, type PushService } from '../push/types';
import { MaisPage } from './MaisPage';

function renderMais(role: Role, signOut = vi.fn(() => Promise.resolve())) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    access: 'granted',
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

  it('links Importar to the batch import, for admins only', () => {
    renderMais('admin');
    const link = screen.getByRole('link', { name: /Importar/ });
    expect(link).toHaveAttribute('href', '/importar');
    expect(link).toHaveTextContent('Importar várias cifras em PDF de uma vez');
    expect(link).not.toHaveTextContent('Em breve');
  });

  it('hides Importar from members (admin tool)', () => {
    renderMais('member');
    expect(screen.queryByText('Importar')).not.toBeInTheDocument();
    expect(screen.getByText('Pessoas')).toBeInTheDocument();
  });

  it('links Estatísticas to the stats screen, for admins only', () => {
    renderMais('admin');
    const link = screen.getByRole('link', { name: /Estatísticas/ });
    expect(link).toHaveAttribute('href', '/estatisticas');
    expect(link).toHaveTextContent('PDFs, espaço e cifras mais usadas');
  });

  it.each(['member', 'viewer'] as const)('hides Estatísticas from %s', (role) => {
    renderMais(role);
    expect(screen.queryByText('Estatísticas')).not.toBeInTheDocument();
  });

  it('keeps Pessoas disabled with "Em breve"', () => {
    renderMais('admin');
    for (const name of ['Pessoas']) {
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

const pushService = (): PushService => ({
  load: vi.fn(async () => 'available' as const),
  enable: vi.fn(async () => 'active' as const),
  disable: vi.fn(async () => 'available' as const),
  sendTest: vi.fn(async () => 'sent' as const),
  revalidate: vi.fn(async () => {}),
  forgetDevice: vi.fn(async () => {}),
});

function renderWithPush(role: Role, service: PushService | null) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <PushContext.Provider value={service}>
          <MaisPage />
        </PushContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('MaisPage Avisos row', () => {
  it('shows Avisos above Pessoas for members and admins', () => {
    renderWithPush('member', pushService());
    const avisos = screen.getByText('Avisos');
    const pessoas = screen.getByText('Pessoas');
    expect(avisos.compareDocumentPosition(pessoas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides Avisos from visitors', () => {
    renderWithPush('viewer', pushService());
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
  });

  it('hides Avisos without a push service (no VAPID in the build)', () => {
    renderWithPush('member', null);
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
  });
});
