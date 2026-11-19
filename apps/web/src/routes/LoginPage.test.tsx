import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { LoginPage } from './LoginPage';

function mount(from: unknown) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role: 'member',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from } }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<p>Início</p>} />
          <Route path="/repertorios/:id" element={<p>Repertório</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('LoginPage redirect after sign-in', () => {
  it('goes back to the protected screen the person was sent from', () => {
    mount('/repertorios/r1');
    expect(screen.getByText('Repertório')).toBeInTheDocument();
  });

  it.each([['//evil.com'], ['https://x'], ['/login']])(
    'ignores an unsafe return target (%s) and goes home',
    (from) => {
      mount(from);
      expect(screen.getByText('Início')).toBeInTheDocument();
    },
  );

  it('goes home when there is no return target', () => {
    mount(undefined);
    expect(screen.getByText('Início')).toBeInTheDocument();
  });
});
