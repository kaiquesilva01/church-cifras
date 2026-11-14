import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import type { Role } from '../auth/roles';
import { useAuth } from '../auth/useAuth';

export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const { role } = useAuth();
  return roles.includes(role) ? (children ?? <Outlet />) : <Navigate to="/" replace />;
}
