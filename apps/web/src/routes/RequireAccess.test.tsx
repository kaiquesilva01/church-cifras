import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AccessState, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { RequireAccess } from './RequireAccess';

function renderAt(access: AccessState, path: string, overrides: Partial<AuthState> = {}) {
  const signOut = vi.fn(() => Promise.resolve());
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    access,
    appAdmin: false,
    canUploadSong: false,
    ministry: null,
    ministryFailed: false,
    ministryMissing: false,
    accessFailed: false,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut,
    ...overrides,
  };
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<RequireAccess />}>
            <Route path="*" element={<p>app</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { signOut };
}

describe('RequireAccess', () => {
  it('checking shows the loading status', () => {
    renderAt('checking', '/');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.queryByText('app')).toBeNull();
  });

  it('blocked renders the pending screen for any path', () => {
    renderAt('blocked', '/musicas/s1');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Acesso ainda não liberado' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('blocked with accessFailed shows the error with retry and sign-out, not the pending screen', () => {
    const { signOut } = renderAt('blocked', '/', { accessFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Tente de novo');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acesso ainda não liberado' })).toBeNull();
    expect(screen.queryByText('app')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('granted renders the child route', () => {
    renderAt('granted', '/');
    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
