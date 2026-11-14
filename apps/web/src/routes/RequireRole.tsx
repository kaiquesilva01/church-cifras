import { Navigate, Outlet } from 'react-router';
import { isAdmin } from '../auth/roles';
import { useAuth } from '../auth/useAuth';

export function RequireAdmin() {
  const { role } = useAuth();
  return isAdmin(role) ? <Outlet /> : <Navigate to="/" replace />;
}
