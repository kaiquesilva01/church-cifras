import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { AccessPending } from './AccessPending';

function renderPending(overrides: Partial<AuthState> = {}) {
  const signOut = vi.fn(() => Promise.resolve());
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'viewer',
    access: 'blocked',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut,
    ...overrides,
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter>
        <AccessPending />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { signOut };
}

describe('AccessPending', () => {
  it('shows the title as h1', () => {
    renderPending();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Acesso ainda não liberado' }),
    ).toBeInTheDocument();
  });

  it('explains who to ask', () => {
    renderPending();
    expect(
      screen.getByText(
        'Peça a um admin do ministério para liberar a sua conta. Depois que ele liberar, é só entrar de novo.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the account e-mail in the card', () => {
    renderPending();
    expect(screen.getByText('Conta')).toBeInTheDocument();
    expect(screen.getByText('maria@example.com')).toBeInTheDocument();
  });

  it('signs out with the existing signOut', () => {
    const { signOut } = renderPending();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows an alert when sign out fails', async () => {
    renderPending({ signOut: () => Promise.reject(new Error('rede')) });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível sair. Tente de novo.',
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled());
  });

  it('has no app navigation', () => {
    renderPending();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
