import { Navigate, Outlet } from 'react-router';
import {
  canListSetlists,
  canUpload,
  isAppAdmin,
  isMinistryAdmin,
  isMinistryLoading,
} from '../auth/permissions';
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
  // Vínculo confirmado e documento do ministério ainda carregando: espera, sem redirecionar.
  if (isMinistryLoading(auth)) {
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  }
  // Sem ministério e sem carga pendente, só resta a falha do documento.
  if (auth.access === 'granted' && !auth.appAdmin && !auth.ministry) {
    return <MinistryLoadError missing={auth.ministryMissing} />;
  }
  return PERMISSIONS[when](auth) ? <Outlet /> : <Navigate to="/" replace />;
}
