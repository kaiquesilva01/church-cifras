import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';

export function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <p className="status">Carregando…</p>;
  if (status === 'signed-out') return <Navigate to="/login" replace />;
  return <Outlet />;
}
