import type { AuthState } from './useAuth';

export const canListSetlists = (s: AuthState) => s.access === 'granted' && s.ministry !== null;
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
