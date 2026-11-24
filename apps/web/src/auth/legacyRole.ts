import type { Role } from './roles';
import type { AuthState } from './useAuth';

/**
 * Ponte até as Tarefas 20 a 25: telas que ainda pedem um papel de rota (RequireRole, MaisPage)
 * derivam o papel do estado novo. App admin ou admin de ministério = admin; vínculo = member; sem vínculo = viewer.
 * Sai junto com essas telas.
 */
export function legacyRole(auth: Pick<AuthState, 'appAdmin' | 'ministry'>): Role {
  if (auth.appAdmin || auth.ministry?.role === 'admin') return 'admin';
  return auth.ministry ? 'member' : 'viewer';
}
