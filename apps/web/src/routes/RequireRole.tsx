import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router';
import type { Role } from '../auth/roles';
import { legacyRole } from '../auth/legacyRole';
import { useAuth } from '../auth/useAuth';
import { MinistryLoadError } from './MinistryLoadError';

export function RequireRole({ roles, children }: { roles: Role[]; children?: ReactNode }) {
  const auth = useAuth();
  // Vínculo confirmado (claim) e documento do ministério sem carregar: espera, sem redirecionar.
  if (auth.access === 'granted' && !auth.appAdmin && !auth.ministry) {
    return auth.ministryFailed ? <MinistryLoadError missing={auth.ministryMissing} /> : null;
  }
  const role = legacyRole(auth);
  return roles.includes(role) ? (children ?? <Outlet />) : <Navigate to="/" replace />;
}
