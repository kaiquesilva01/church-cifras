import { vi } from 'vitest';
import type { AuthGateway, SessionUser } from '../auth/AuthProvider';
import type { Role } from '../auth/roles';

export interface FakeGateway extends AuthGateway {
  emitUser(user: SessionUser | null): void;
  emitRole(role: Role | undefined): void;
  claimRole: Role | undefined;
}

export const testUser: SessionUser = {
  uid: 'u1',
  displayName: 'Maria Souza',
  email: 'maria@example.com',
  photoURL: null,
};

export function createFakeGateway(): FakeGateway {
  let userCb: ((u: SessionUser | null) => void) | undefined;
  let currentRole: Role | undefined;
  let roleCb: ((r: Role | undefined) => void) | undefined;
  const gateway: FakeGateway = {
    claimRole: 'viewer',
    onUser: (cb) => {
      userCb = cb;
      return () => {
        userCb = undefined;
      };
    },
    onUserDoc: (_uid, cb) => {
      roleCb = cb;
      return () => {
        roleCb = undefined;
      };
    },
    getClaimRole: () => Promise.resolve(gateway.claimRole),
    refreshToken: vi.fn(() => {
      gateway.claimRole = currentRole;
      return Promise.resolve();
    }),
    prepareSignIn: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    emitUser: (u) => userCb?.(u),
    emitRole: (r) => {
      currentRole = r;
      roleCb?.(r);
    },
  };
  return gateway;
}
