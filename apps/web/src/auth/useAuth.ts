import { createContext, useContext } from 'react';
import type { SessionUser } from './AuthProvider';

export type MinistryRole = 'member' | 'admin';
export type CurrentMinistry = { id: string; name: string; city: string; role: MinistryRole };
/** `checking` até os claims serem lidos; `granted` com hasMinistry ou appAdmin; `blocked` caso contrário. */
export type AccessState = 'checking' | 'blocked' | 'granted';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  /** granted quando o token tem hasMinistry ou appAdmin; blocked caso contrário; checking até os claims serem lidos. */
  access: AccessState;
  /** claim appAdmin do token (a Gestão e as ações de admin da app dependem dele). */
  appAdmin: boolean;
  /** claim canUploadSong do token (Nova cifra, Importar, tom feito à mão). */
  canUploadSong: boolean;
  /** Único vínculo da pessoa (a interface aceita um). null sem ministério. */
  ministry: CurrentMinistry | null;
  /** Vínculo confirmado, mas o documento do ministério falhou ao carregar (ou não existe). */
  ministryFailed: boolean;
  /** O documento do ministério não existe (distinto de erro de leitura, que aceita tentar de novo). */
  ministryMissing: boolean;
  /**
   * Há vínculo, e o documento do ministério ainda não chegou nem falhou. Vale também para o admin
   * da app que é membro (ele tem ministério, só espera a carga).
   */
  ministryPending: boolean;
  /**
   * Bloqueado por falha, não por falta de liberação: a leitura dos vínculos falhou, ou há vínculo e
   * o claim hasMinistry não acompanhou depois das releituras (ou o refresh falhou). Tem retry e Sair.
   */
  accessFailed: boolean;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}
