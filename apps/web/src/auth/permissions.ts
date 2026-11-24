import type { AuthState } from './useAuth';

export const canListSetlists = (s: AuthState) => s.access === 'granted' && s.ministry !== null;
/**
 * Vínculo ainda carregando: acesso liberado e o documento do ministério pendente (vínculo sem
 * documento, sem falha). O admin da app que é membro entra aqui como qualquer membro; o admin da
 * app sem vínculo não, porque não tem nada para carregar.
 */
export const isMinistryLoading = (s: AuthState) => s.access === 'granted' && s.ministryPending;
/** Aba e item Repertórios: com ministério, ou enquanto o ministério carrega (evita piscar). */
export const canShowRepertorios = (s: AuthState) => canListSetlists(s) || isMinistryLoading(s);
/** Mudar tom: todo membro. */
export const canChangeKey = (s: AuthState) => s.access === 'granted';
/** Repertório: admin do ministério. */
export const canEditSetlist = (s: AuthState) => s.ministry?.role === 'admin';
/** Apagar e corrigir cifra: admin da app. */
export const canManageSongs = (s: AuthState) => s.appAdmin;
/** Nova cifra, Importar: admin de ministério ou admin da app. */
export const canUpload = (s: AuthState) => s.canUploadSong;
export const isMinistryAdmin = (s: AuthState) => s.ministry?.role === 'admin';
export const isAppAdmin = (s: AuthState) => s.appAdmin;
