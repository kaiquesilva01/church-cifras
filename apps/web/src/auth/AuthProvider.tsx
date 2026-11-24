import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState, type CurrentMinistry, type MinistryRole } from './useAuth';

export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type Claims = { appAdmin: boolean; hasMinistry: boolean; canUploadSong: boolean };
export type Membership = { ministryId: string; role: MinistryRole };
export type MinistryInfo = { name: string; city: string };

export interface AuthGateway {
  onUser(cb: (u: SessionUser | null) => void): () => void;
  /** Lê o token atual, sem forçar refresh. Claim ausente conta como false. */
  getClaims(): Promise<Claims>;
  /** users/{uid}: só o campo appAdmin importa aqui. */
  onUserDoc(uid: string, cb: (profile: { appAdmin: boolean }) => void): () => void;
  /** collectionGroup('members') where uid == uid. */
  onMemberships(
    uid: string,
    cb: (m: Membership[]) => void,
    onError: (e: unknown) => void,
  ): () => void;
  /** ministries/{mid}; null se o documento não existe. */
  onMinistry(
    ministryId: string,
    cb: (m: MinistryInfo | null) => void,
    onError: (e: unknown) => void,
  ): () => void;
  refreshToken(): Promise<void>;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /** Limpa o cache local e recarrega; com `removedFrom`, deixa o aviso para a entrada. */
  forgetLocalData(removedFrom?: string): Promise<void>;
}

/** Esperas (ms) entre releituras do token enquanto o gatilho que grava os claims não termina (~31 s ao todo). */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const NO_CLAIMS: Claims = { appAdmin: false, hasMinistry: false, canUploadSong: false };

type Session = { resolved: false } | { resolved: true; user: SessionUser | null };
type Loaded<T> = { loaded: boolean; value: T };
type Memberships = { loaded: boolean; failed: boolean; list: Membership[] };

export function AuthProvider({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ resolved: false });
  const [claims, setClaims] = useState<Loaded<Claims>>({ loaded: false, value: NO_CLAIMS });
  const [profile, setProfile] = useState<Loaded<{ appAdmin: boolean }>>({
    loaded: false,
    value: { appAdmin: false },
  });
  const [memberships, setMemberships] = useState<Memberships>({
    loaded: false,
    failed: false,
    list: [],
  });
  // Leitura do ministério, presa ao id: troca de vínculo não herda o nome do anterior.
  const [ministryLoad, setMinistryLoad] = useState<{
    id: string;
    info: MinistryInfo | null;
    failed: boolean;
    missing: boolean;
  }>({ id: '', info: null, failed: false, missing: false });
  // Chave (uid, vínculo, admin) cujas releituras do token se esgotaram sem o claim bater.
  const [syncFailedKey, setSyncFailedKey] = useState<string | null>(null);
  const uid = session.resolved ? session.user?.uid : undefined;
  const hadMinistry = useRef(false);
  const lastMinistryName = useRef<string | undefined>(undefined);
  const claimsRef = useRef<Claims>(NO_CLAIMS);

  useEffect(() => {
    claimsRef.current = claims.value;
  }, [claims.value]);

  useEffect(() => gateway.onUser((user) => setSession({ resolved: true, user })), [gateway]);

  // Claims: lidos ao entrar; relidos depois de cada refresh (abaixo).
  useEffect(() => {
    if (!uid) return;
    let active = true;
    gateway.getClaims().then(
      (value) => {
        if (active) setClaims({ loaded: true, value });
      },
      (error: unknown) => {
        console.warn('Falha ao ler as permissões do token', error);
        if (active) setClaims({ loaded: true, value: NO_CLAIMS });
      },
    );
    return () => {
      active = false;
      setClaims({ loaded: false, value: NO_CLAIMS });
    };
  }, [gateway, uid]);

  // Perfil (appAdmin do documento) e vínculos, em tempo real.
  useEffect(() => {
    if (!uid) return;
    const offProfile = gateway.onUserDoc(uid, (value) => setProfile({ loaded: true, value }));
    const offMemberships = gateway.onMemberships(
      uid,
      (list) => setMemberships({ loaded: true, failed: false, list }),
      (error) => {
        console.warn('Falha ao ler os vínculos', error);
        setMemberships((prev) => ({ ...prev, loaded: true, failed: true }));
      },
    );
    return () => {
      offProfile();
      offMemberships();
      lastMinistryName.current = undefined;
      setProfile({ loaded: false, value: { appAdmin: false } });
      setMemberships({ loaded: false, failed: false, list: [] });
      setMinistryLoad({ id: '', info: null, failed: false, missing: false });
    };
  }, [gateway, uid]);

  const user = session.resolved ? session.user : null;
  const status: AuthState['status'] =
    !session.resolved || (user && !profile.loaded) ? 'loading' : user ? 'signed-in' : 'signed-out';
  // Liberado: admin da app, ou claim hasMinistry com vínculo carregado. O vínculo é a fonte de
  // verdade: claim antigo sem vínculo (pessoa removida) é bloqueio, nunca erro de carregamento.
  const access: AuthState['access'] =
    status !== 'signed-in' || !claims.loaded
      ? 'checking'
      : claims.value.appAdmin
        ? 'granted'
        : !memberships.loaded
          ? 'checking'
          : !memberships.failed && memberships.list.length > 0 && claims.value.hasMinistry
            ? 'granted'
            : 'blocked';

  // Ministério atual: o primeiro vínculo (a interface aceita um só).
  const first = memberships.list[0];
  const ministryId = first?.ministryId;
  const ministryCurrent = ministryId !== undefined && ministryLoad.id === ministryId;
  const ministryInfo = ministryCurrent ? ministryLoad.info : null;
  // Só lê o documento do ministério com o acesso liberado: bloqueado, nada é assinado.
  const granted = access === 'granted';
  useEffect(() => {
    if (!ministryId || !granted) return;
    return gateway.onMinistry(
      ministryId,
      (info) =>
        setMinistryLoad({
          id: ministryId,
          info,
          failed: info === null,
          missing: info === null,
        }),
      (error) => {
        console.warn('Falha ao carregar o ministério', error);
        setMinistryLoad({ id: ministryId, info: null, failed: true, missing: false });
      },
    );
  }, [gateway, ministryId, granted]);
  useEffect(() => {
    if (ministryInfo) lastMinistryName.current = ministryInfo.name;
  }, [ministryInfo]);

  // Vínculo que some (havia, agora não há): apaga o cache local e avisa na entrada.
  useEffect(() => {
    const has = memberships.list.length > 0;
    const had = hadMinistry.current;
    hadMinistry.current = has;
    if (memberships.loaded && had && !has) void gateway.forgetLocalData(lastMinistryName.current);
  }, [gateway, memberships]);

  // Claim divergente do vínculo ou do appAdmin do documento: renova o token e relê os claims.
  // O gatilho que grava os claims pode levar segundos: repete com espera crescente, e para.
  const hasMinistry = memberships.list.length > 0;
  const appAdminDoc = profile.value.appAdmin;
  const ready = claims.loaded && profile.loaded && memberships.loaded && !memberships.failed;
  // canUploadSong: admin de algum ministério ou admin da app (o claim é gravado pelo servidor).
  const canUploadDoc = appAdminDoc || memberships.list.some((m) => m.role === 'admin');
  const mismatch =
    ready &&
    (claims.value.hasMinistry !== hasMinistry ||
      claims.value.appAdmin !== appAdminDoc ||
      claims.value.canUploadSong !== canUploadDoc);
  const syncKey = `${uid}|${hasMinistry}|${appAdminDoc}|${canUploadDoc}`;
  useEffect(() => {
    if (!uid || !mismatch) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      // Erro de acesso só quando há vínculo e o claim hasMinistry continua falso (o último lido
      // neste ciclo, ou o de agora se nenhum foi lido); appAdmin e canUploadSong nunca mostram
      // erro de ministério (só a releitura limitada).
      let last: Claims | undefined;
      const fail = () => {
        if (active && hasMinistry && (last ?? claimsRef.current).hasMinistry !== true)
          setSyncFailedKey(syncKey);
      };
      for (let attempt = 0; ; attempt += 1) {
        try {
          await gateway.refreshToken();
          const value = await gateway.getClaims();
          if (!active) return;
          last = value;
          setClaims({ loaded: true, value });
          if (
            value.hasMinistry === hasMinistry &&
            value.appAdmin === appAdminDoc &&
            value.canUploadSong === canUploadDoc
          )
            return;
        } catch (error) {
          console.warn('Falha ao atualizar o token de sessão', error);
          fail();
          return;
        }
        if (attempt >= RETRY_DELAYS_MS.length) {
          // Esgotou as releituras sem o claim bater: vira erro, não espera infinita.
          fail();
          return;
        }
        await new Promise<void>((resolve) => {
          timer = setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 0);
        });
        if (!active) return;
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
      // O erro vale só para o ciclo que falhou: uma chave igual que volte depois começa limpa.
      setSyncFailedKey(null);
    };
  }, [gateway, uid, mismatch, hasMinistry, appAdminDoc, canUploadDoc, syncKey]);

  // Bloqueado por falha, não por falta de liberação: a leitura dos vínculos falhou, ou o claim não
  // refletiu o vínculo depois das releituras. Erro com "Tentar de novo" e "Sair", não "acesso pendente".
  const accessFailed =
    access === 'blocked' && (memberships.failed || (mismatch && syncFailedKey === syncKey));
  const ministryFailed = ministryCurrent && ministryLoad.failed;
  const ministryMissing = ministryCurrent && ministryLoad.missing;
  // Vínculo sem documento ainda: nem carregou, nem falhou (o documento chega por onMinistry).
  const ministryPending = first !== undefined && ministryInfo === null && !ministryFailed;

  // Estável entre mudanças de sessão: a tela de entrada aquece o popup uma vez só.
  const prepareSignIn = useCallback(() => gateway.prepareSignIn(), [gateway]);

  const value = useMemo<AuthState>(() => {
    const ministry: CurrentMinistry | null =
      first && ministryInfo
        ? {
            id: first.ministryId,
            name: ministryInfo.name,
            city: ministryInfo.city,
            role: first.role,
          }
        : null;
    return {
      status,
      user,
      access,
      appAdmin: claims.value.appAdmin,
      canUploadSong: claims.value.canUploadSong,
      ministry,
      ministryFailed,
      ministryMissing,
      ministryPending,
      accessFailed,
      prepareSignIn,
      signIn: () => gateway.signIn(),
      signOut: () => gateway.signOut(),
    };
  }, [
    status,
    user,
    access,
    claims.value,
    first,
    ministryInfo,
    ministryFailed,
    ministryMissing,
    ministryPending,
    accessFailed,
    gateway,
    prepareSignIn,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
