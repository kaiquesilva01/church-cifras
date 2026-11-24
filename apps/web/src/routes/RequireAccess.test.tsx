import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AccessState, type AuthState } from '../auth/useAuth';
import { testUser } from '../test/fakeGateway';
import { createFakeMinistriesApi } from '../test/fakeMinistriesApi';
import { RequireAccess } from './RequireAccess';

let mounted = 0;

/** Stand-in for a data provider: counts how many times it mounts. */
function DataProvider() {
  useEffect(() => {
    mounted += 1;
  }, []);
  return <p>app</p>;
}

function renderAt(access: AccessState, path: string, overrides: Partial<AuthState> = {}) {
  mounted = 0;
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
  const api = createFakeMinistriesApi({
    subscribeMyRequests: (_uid, cb) => {
      cb([]);
      return () => {};
    },
  });
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<RequireAccess api={api} />}>
            <Route path="*" element={<DataProvider />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return { signOut };
}

describe('RequireAccess', () => {
  it('checking shows the loading status and mounts no data', () => {
    renderAt('checking', '/');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.queryByText('app')).toBeNull();
    expect(mounted).toBe(0);
  });

  it('blocked renders the entry page for any path and mounts no data provider', () => {
    renderAt('blocked', '/musicas/s1');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Escolha seu ministério' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('app')).toBeNull();
    expect(mounted).toBe(0);
  });

  it('blocked with accessFailed shows the error with retry and sign-out, not the entry page', () => {
    const { signOut } = renderAt('blocked', '/', { accessFailed: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Tente de novo');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Escolha seu ministério' })).toBeNull();
    expect(screen.queryByText('app')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('granted renders the child route and mounts the data provider', () => {
    renderAt('granted', '/');
    expect(screen.getByText('app')).toBeInTheDocument();
    expect(mounted).toBe(1);
  });
});
