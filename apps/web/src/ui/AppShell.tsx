import { Link, Outlet } from 'react-router';
import { ROLE_LABELS, isAdmin } from '../auth/roles';
import { useAuth } from '../auth/useAuth';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function AppShell() {
  const { user, role, signOut } = useAuth();
  const name = user?.displayName ?? user?.email ?? '';
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            Cifras · Louvor
          </Link>
          {isAdmin(role) && (
            <Link to="/pessoas" className="nav-link">
              Pessoas
            </Link>
          )}
          <span className="spacer" />
          <span className="avatar" aria-hidden="true">
            {initials(name)}
          </span>
          <span className="role">{ROLE_LABELS[role]}</span>
          <button type="button" className="btn" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
