import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { authStateFor } from '../test/authState';
import { RequireRole } from './RequireRole';

function renderAt(path: string, auth: AuthState, when: Parameters<typeof RequireRole>[0]['when']) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<p>Início</p>} />
          <Route element={<RequireRole when={when} />}>
            <Route path={path} element={<p>Página protegida</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const withAuth = (base: AuthState, patch: Partial<AuthState>): AuthState => ({ ...base, ...patch });

describe('RequireRole', () => {
  it('when="upload" deixa passar quem tem o claim e redireciona os outros para /', () => {
    const { unmount } = renderAt('/nova', authStateFor('admin'), 'upload');
    expect(screen.getByText('Página protegida')).toBeInTheDocument();
    unmount();
    renderAt('/nova', authStateFor('member'), 'upload');
    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.queryByText('Página protegida')).not.toBeInTheDocument();
  });

  it('when="ministryAdmin" exige admin do ministério, não o claim de app admin', () => {
    const { unmount } = renderAt('/pessoas', authStateFor('member'), 'ministryAdmin');
    expect(screen.getByText('Início')).toBeInTheDocument();
    unmount();
    const appAdminOnly = withAuth(authStateFor(null), { appAdmin: true });
    const second = renderAt('/pessoas', appAdminOnly, 'ministryAdmin');
    expect(screen.getByText('Início')).toBeInTheDocument();
    second.unmount();
    renderAt('/pessoas', authStateFor('admin'), 'ministryAdmin');
    expect(screen.getByText('Página protegida')).toBeInTheDocument();
  });

  it('when="appAdmin" deixa passar só o admin da app', () => {
    const { unmount } = renderAt('/gestao', authStateFor('admin'), 'appAdmin');
    expect(screen.getByText('Início')).toBeInTheDocument();
    unmount();
    const appAdmin = withAuth(authStateFor(null), { appAdmin: true });
    renderAt('/gestao', appAdmin, 'appAdmin');
    expect(screen.getByText('Página protegida')).toBeInTheDocument();
  });

  it('when="listSetlists" redireciona o admin da app sem ministério', () => {
    const { unmount } = renderAt('/repertorios/x', authStateFor('member'), 'listSetlists');
    expect(screen.getByText('Página protegida')).toBeInTheDocument();
    unmount();
    const appAdminNoMinistry = withAuth(authStateFor(null), { appAdmin: true });
    renderAt('/repertorios/x', appAdminNoMinistry, 'listSetlists');
    expect(screen.getByText('Início')).toBeInTheDocument();
  });

  it('mostra o erro do ministério, sem redirecionar, quando o documento falhou', () => {
    const auth = withAuth(authStateFor(null), { ministryFailed: true });
    renderAt('/pessoas', auth, 'ministryAdmin');
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o ministério.');
    expect(screen.queryByText('Início')).not.toBeInTheDocument();
  });

  it('mostra "Carregando…", sem redirecionar, enquanto o ministério carrega', () => {
    renderAt('/pessoas', { ...authStateFor(null), ministryPending: true }, 'ministryAdmin');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.queryByText('Início')).not.toBeInTheDocument();
    expect(screen.queryByText('Página protegida')).not.toBeInTheDocument();
  });
});
