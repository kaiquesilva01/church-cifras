import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Role } from './roles';
import { AuthContext, type AuthState } from './useAuth';

export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface AuthGateway {
  onUser(cb: (u: SessionUser | null) => void): () => void;
  getClaimRole(): Promise<Role | undefined>;
  onUserDoc(uid: string, cb: (role: Role | undefined) => void): () => void;
  refreshToken(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

type Session = { resolved: false } | { resolved: true; user: SessionUser | null };

export function AuthProvider({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ resolved: false });
  const [doc, setDoc] = useState<{ loaded: boolean; role: Role | undefined }>({
    loaded: false,
    role: undefined,
  });
  const uid = session.resolved ? session.user?.uid : undefined;

  useEffect(() => {
    return gateway.onUser((user) => setSession({ resolved: true, user }));
  }, [gateway]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    const requested = new Set<Role>();
    const syncClaim = async (role: Role) => {
      if (requested.has(role)) return;
      requested.add(role);
      try {
        // O gatilho define o claim depois do login: renova o token se estiver defasado.
        if ((await gateway.getClaimRole()) !== role && active) await gateway.refreshToken();
      } catch (error) {
        requested.delete(role);
        console.warn('Falha ao atualizar o token de sessão', error);
      }
    };
    const unsubscribe = gateway.onUserDoc(uid, (role) => {
      setDoc({ loaded: true, role });
      if (role) void syncClaim(role);
    });
    return () => {
      active = false;
      unsubscribe();
      setDoc({ loaded: false, role: undefined });
    };
  }, [gateway, uid]);

  const value = useMemo<AuthState>(() => {
    const user = session.resolved ? session.user : null;
    return {
      status:
        !session.resolved || (user && !doc.loaded) ? 'loading' : user ? 'signed-in' : 'signed-out',
      user,
      role: doc.role ?? 'viewer',
      signIn: () => gateway.signIn(),
      signOut: () => gateway.signOut(),
    };
  }, [session, doc, gateway]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
