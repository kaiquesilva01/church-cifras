import type { Role } from './roles';
import type { AuthState } from './useAuth';

/**
 * Ponte até as Tarefas 20 a 25: telas que ainda pedem um papel de rota (RequireRole, MaisPage)
 * derivam o papel do estado novo. App admin = admin; admin de ministério = admin só com o claim
 * canUploadSong (o token já reflete a promoção); vínculo = member; sem vínculo = viewer.
 * Sai junto com essas telas.
 */
export function legacyRole(auth: Pick<AuthState, 'appAdmin' | 'canUploadSong' | 'ministry'>): Role {
  if (auth.appAdmin || (auth.ministry?.role === 'admin' && auth.canUploadSong)) return 'admin';
  return auth.ministry ? 'member' : 'viewer';
}
