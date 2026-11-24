import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { authStateFor } from '../test/authState';
import { LoginPage } from './LoginPage';

function mount(from: unknown) {
  const auth: AuthState = { ...authStateFor('member'), status: 'signed-in', user: testUser };
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

describe('LoginPage note', () => {
  it('explains that a first access chooses a ministry and waits for an admin', () => {
    const auth: AuthState = {
      status: 'signed-out',
      user: null,
      access: 'checking',
      prepareSignIn: () => Promise.resolve(),
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    } as unknown as AuthState;
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(
      screen.getByText(
        'Quem entra pela primeira vez escolhe o ministério e pede para entrar. Um admin aprova.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/liberação de um admin/)).toBeNull();
  });
});

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
