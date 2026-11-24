import { vi, type Mock } from 'vitest';
import type {
  AuthGateway,
  Claims,
  Membership,
  MinistryInfo,
  SessionUser,
} from '../auth/AuthProvider';

export interface FakeGateway extends AuthGateway {
  emitUser(user: SessionUser | null): void;
  emitProfile(p: { appAdmin: boolean }): void;
  emitMemberships(m: Membership[]): void;
  emitMinistry(m: MinistryInfo | null): void;
  /** Simula erro ao ler o documento do ministério. */
  failMinistry(): void;
  /** Claims devolvidos por getClaims(). */
  claims: Claims;
  /** Claims que aparecem depois de refreshToken(). */
  nextClaims: Claims;
  forgetLocalData: Mock<(removedFrom?: string) => Promise<void>>;
}

export const testUser: SessionUser = {
  uid: 'u1',
  displayName: 'Maria Souza',
  email: 'maria@example.com',
  photoURL: null,
};

const NONE: Claims = { appAdmin: false, hasMinistry: false, canUploadSong: false };

export function createFakeGateway(): FakeGateway {
  let userCb: ((u: SessionUser | null) => void) | undefined;
  let profileCb: ((p: { appAdmin: boolean }) => void) | undefined;
  let membershipsCb: ((m: Membership[]) => void) | undefined;
  let ministryCb: ((m: MinistryInfo | null) => void) | undefined;
  let ministryErrCb: ((e: unknown) => void) | undefined;
  let ministryLast: { doc: MinistryInfo | null; error: boolean } | undefined;
  const gateway: FakeGateway = {
    claims: NONE,
    nextClaims: NONE,
    onUser: (cb) => {
      userCb = cb;
      return () => {
        userCb = undefined;
      };
    },
    onUserDoc: (_uid, cb) => {
      profileCb = cb;
      return () => {
        profileCb = undefined;
      };
    },
    onMemberships: (_uid, cb) => {
      membershipsCb = cb;
      return () => {
        membershipsCb = undefined;
      };
    },
    onMinistry: (_id, cb, onError) => {
      ministryCb = cb;
      ministryErrCb = onError;
      // Como o Firestore: quem assina depois recebe o último estado emitido (o provedor só assina
      // com o acesso liberado, depois de os claims serem lidos).
      if (ministryLast?.error) onError(new Error('rede'));
      else if (ministryLast) cb(ministryLast.doc);
      return () => {
        ministryCb = undefined;
        ministryErrCb = undefined;
        ministryLast = undefined;
      };
    },
    getClaims: () => Promise.resolve(gateway.claims),
    refreshToken: vi.fn(() => {
      gateway.claims = gateway.nextClaims;
      return Promise.resolve();
    }),
    prepareSignIn: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    forgetLocalData: vi.fn(() => Promise.resolve()),
    emitUser: (u) => userCb?.(u),
    emitProfile: (p) => profileCb?.(p),
    emitMemberships: (m) => membershipsCb?.(m),
    emitMinistry: (m) => {
      ministryLast = { doc: m, error: false };
      ministryCb?.(m);
    },
    failMinistry: () => {
      ministryLast = { doc: null, error: true };
      ministryErrCb?.(new Error('rede'));
    },
  };
  return gateway;
}
