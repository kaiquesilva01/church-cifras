import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { LoginPage } from './LoginPage';
import { RequireAuth } from './RequireAuth';

const base = {
  prepareSignIn: () => Promise.resolve(),
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};
const signedOut: AuthState = {
  ...base,
  status: 'signed-out',
  user: null,
  role: 'viewer',
  access: 'granted',
};
const signedIn: AuthState = {
  ...base,
  status: 'signed-in',
  user: testUser,
  role: 'member',
  access: 'granted',
};

function Where() {
  const { pathname, search, hash } = useLocation();
  return <p data-testid="where">{`${pathname}${search}${hash}`}</p>;
}

function tree(auth: AuthState) {
  return (
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/repertorios/r1?x=1#item-b']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/repertorios/:id" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('RequireAuth return path', () => {
  it('comes back to the same path, query and hash after the login', () => {
    const { rerender } = render(tree(signedOut));
    expect(screen.getByText('Entrar com Google')).toBeInTheDocument();
    rerender(tree(signedIn));
    expect(screen.getByTestId('where')).toHaveTextContent('/repertorios/r1?x=1#item-b');
  });
});
