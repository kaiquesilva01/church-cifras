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
  onUserDoc(uid: string, cb: (role: Role | undefined) => void): () => void;
  refreshToken(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

type Session = { resolved: false } | { resolved: true; user: SessionUser | null };

export function AuthProvider({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ resolved: false });
  const [docRole, setDocRole] = useState<Role | undefined>(undefined);
  const uid = session.resolved ? session.user?.uid : undefined;

  useEffect(() => {
    return gateway.onUser((user) => setSession({ resolved: true, user }));
  }, [gateway]);

  useEffect(() => {
    if (!uid) return;
    let seen = false;
    let previous: Role | undefined;
    const unsubscribe = gateway.onUserDoc(uid, (role) => {
      // O gatilho define o claim depois do login: ao mudar o papel, renova o token.
      if (seen && role !== previous) void gateway.refreshToken().catch(() => undefined);
      seen = true;
      previous = role;
      setDocRole(role);
    });
    return () => {
      unsubscribe();
      setDocRole(undefined);
    };
  }, [gateway, uid]);

  const value = useMemo<AuthState>(() => {
    const user = session.resolved ? session.user : null;
    return {
      status: !session.resolved ? 'loading' : user ? 'signed-in' : 'signed-out',
      user,
      role: docRole ?? 'viewer',
      signIn: () => gateway.signIn(),
      signOut: () => gateway.signOut(),
    };
  }, [session, docRole, gateway]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
