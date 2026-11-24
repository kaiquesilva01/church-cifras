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

/** Predicados que leem o ministério: esperam a carga e mostram o erro dela. Os de claim, não. */
const NEEDS_MINISTRY: Record<RoutePermission, boolean> = {
  upload: false,
  appAdmin: false,
  ministryAdmin: true,
  listSetlists: true,
};

export function RequireRole({ when }: { when: RoutePermission }) {
  const auth = useAuth();
  if (NEEDS_MINISTRY[when]) {
    // Vínculo confirmado e documento do ministério ainda carregando: espera, sem redirecionar.
    if (isMinistryLoading(auth)) {
      return (
        <p role="status" className="status">
          Carregando…
        </p>
      );
    }
    // Falha ao carregar o documento do ministério: erro com retry, sem redirecionar.
    if (auth.access === 'granted' && auth.ministryFailed) {
      return <MinistryLoadError missing={auth.ministryMissing} />;
    }
  }
  // Claims (upload, appAdmin) decidem na hora, mesmo com o documento do ministério pendente ou falho.
  return PERMISSIONS[when](auth) ? <Outlet /> : <Navigate to="/" replace />;
}
