import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading')
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  if (status === 'signed-out')
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  return <Outlet />;
}
