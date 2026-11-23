import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AccessState, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { RequireAccess } from './RequireAccess';

function renderAt(access: AccessState, path: string) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'viewer',
    access,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
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

  it('granted renders the child route', () => {
    renderAt('granted', '/');
    expect(screen.getByText('app')).toBeInTheDocument();
  });
});
