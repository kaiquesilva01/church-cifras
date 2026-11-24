import { Navigate, Outlet } from 'react-router';
import { canListSetlists, canUpload, isAppAdmin, isMinistryAdmin } from '../auth/permissions';
import { type AuthState, useAuth } from '../auth/useAuth';
import { MinistryLoadError } from './MinistryLoadError';

/** Predicado de rota: cada um vem de `auth/permissions.ts`. */
export type RoutePermission = 'upload' | 'appAdmin' | 'ministryAdmin' | 'listSetlists';

const PERMISSIONS: Record<RoutePermission, (auth: AuthState) => boolean> = {
  upload: canUpload,
  appAdmin: isAppAdmin,
  ministryAdmin: isMinistryAdmin,
  listSetlists: canListSetlists,
};

export function RequireRole({ when }: { when: RoutePermission }) {
  const auth = useAuth();
  // Vínculo confirmado (claim) e documento do ministério sem carregar: espera, sem redirecionar.
  if (auth.access === 'granted' && !auth.appAdmin && !auth.ministry) {
    return auth.ministryFailed ? <MinistryLoadError missing={auth.ministryMissing} /> : null;
  }
  return PERMISSIONS[when](auth) ? <Outlet /> : <Navigate to="/" replace />;
}
