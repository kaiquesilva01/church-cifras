import { createContext, useContext } from 'react';
import type { SessionUser } from './AuthProvider';
import type { Role } from './roles';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  role: Role;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}
