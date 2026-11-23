import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { canEdit, type Role } from './roles';
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
  prepareSignIn(): Promise<void>;
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
  // Papel do token (mesma fonte das Rules): é ele que libera o acesso aos dados.
  const [claim, setClaim] = useState<{ loaded: boolean; role: Role | undefined }>({
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
    gateway.getClaimRole().then(
      (role) => {
        if (active) setClaim({ loaded: true, role });
      },
      (error: unknown) => {
        console.warn('Falha ao ler o papel do token', error);
        if (active) setClaim({ loaded: true, role: undefined });
      },
    );
    return () => {
      active = false;
      setClaim({ loaded: false, role: undefined });
    };
  }, [gateway, uid]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    let last: Role | undefined;
    const syncClaim = async (role: Role) => {
      if (role === last) return;
      last = role;
      try {
        // O gatilho define o claim depois do login: renova o token se estiver defasado.
        if ((await gateway.getClaimRole()) !== role && active) await gateway.refreshToken();
        // Relê o claim renovado: o gate de acesso libera ou bloqueia sem recarregar.
        if (active) setClaim({ loaded: true, role: await gateway.getClaimRole() });
      } catch (error) {
        last = undefined;
        console.warn('Falha ao atualizar o token de sessão', error);
        if (active) setClaim({ loaded: true, role: undefined });
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

  // Stable across session changes so the sign-in screen warms the popup once, not per update.
  const prepareSignIn = useCallback(() => gateway.prepareSignIn(), [gateway]);

  const value = useMemo<AuthState>(() => {
    const user = session.resolved ? session.user : null;
    const status: AuthState['status'] =
      !session.resolved || (user && !doc.loaded) ? 'loading' : user ? 'signed-in' : 'signed-out';
    const access: AuthState['access'] =
      status !== 'signed-in' || !claim.loaded
        ? 'checking'
        : canEdit(claim.role ?? 'viewer')
          ? 'granted'
          : 'blocked';
    return {
      status,
      user,
      role: doc.role ?? 'viewer',
      access,
      prepareSignIn,
      signIn: () => gateway.signIn(),
      signOut: () => gateway.signOut(),
    };
  }, [session, doc, claim, gateway, prepareSignIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
