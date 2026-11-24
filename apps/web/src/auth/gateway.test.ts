import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseServices } from '../lib/firebase';
import {
  browserPopupRedirectResolver,
  getIdTokenResult,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { _getInstance } from '@firebase/auth/internal';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { createAuthGateway } from './gateway';
import { clearRemovedNotice } from './removedNotice';

type Snap = { data: () => unknown; docs?: unknown[] };
type Next = (snap: Snap) => void;
type Fail = (error: Error) => void;
let handlers: { next: Next; fail: Fail };

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  browserPopupRedirectResolver: { resolver: true },
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
const initialize = vi.fn();
vi.mock('@firebase/auth/internal', () => ({
  _getInstance: vi.fn(() => ({ _initialize: initialize })),
}));
vi.mock('firebase/firestore', () => ({
  terminate: vi.fn(() => Promise.resolve()),
  clearIndexedDbPersistence: vi.fn(() => Promise.resolve()),
  doc: vi.fn(() => ({})),
  collectionGroup: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref: unknown, next: Next, fail: Fail) => {
    handlers = { next, fail };
    return () => undefined;
  }),
}));

const services = { auth: {}, db: {} } as unknown as FirebaseServices;

afterEach(() => {
  vi.unstubAllGlobals();
  clearRemovedNotice();
});

describe('createAuthGateway', () => {
  it('signs in with the popup resolver passed explicitly (auth is created without one)', async () => {
    await createAuthGateway(services).signIn();
    expect(signInWithPopup).toHaveBeenCalledWith(
      services.auth,
      expect.anything(),
      browserPopupRedirectResolver,
    );
  });

  it('prepareSignIn initializes the shared popup resolver instance (opens the auth iframe)', async () => {
    initialize.mockResolvedValueOnce(undefined);
    await createAuthGateway(services).prepareSignIn();
    expect(_getInstance).toHaveBeenCalledWith(browserPopupRedirectResolver);
    expect(initialize).toHaveBeenCalledWith(services.auth);
  });

  it('prepareSignIn swallows failures (offline, blocked iframe)', async () => {
    initialize.mockRejectedValueOnce(new Error('network'));
    await expect(createAuthGateway(services).prepareSignIn()).resolves.toBeUndefined();
  });

  describe('getClaims', () => {
    it('reads the three claims of the token', async () => {
      vi.mocked(getIdTokenResult).mockResolvedValueOnce({
        claims: { appAdmin: true, hasMinistry: true, canUploadSong: false },
      } as never);
      const gateway = createAuthGateway({ auth: { currentUser: {} }, db: {} } as never);
      await expect(gateway.getClaims()).resolves.toEqual({
        appAdmin: true,
        hasMinistry: true,
        canUploadSong: false,
      });
    });

    it('treats a missing claim as false', async () => {
      vi.mocked(getIdTokenResult).mockResolvedValueOnce({ claims: {} } as never);
      const gateway = createAuthGateway({ auth: { currentUser: {} }, db: {} } as never);
      await expect(gateway.getClaims()).resolves.toEqual({
        appAdmin: false,
        hasMinistry: false,
        canUploadSong: false,
      });
    });

    it('does not accept the string "true" as a claim', async () => {
      vi.mocked(getIdTokenResult).mockResolvedValueOnce({
        claims: { appAdmin: 'true', hasMinistry: 'true', canUploadSong: 'true' },
      } as never);
      const gateway = createAuthGateway({ auth: { currentUser: {} }, db: {} } as never);
      await expect(gateway.getClaims()).resolves.toEqual({
        appAdmin: false,
        hasMinistry: false,
        canUploadSong: false,
      });
    });

    it('is all false without a signed-in user', async () => {
      const gateway = createAuthGateway({ auth: { currentUser: null }, db: {} } as never);
      await expect(gateway.getClaims()).resolves.toEqual({
        appAdmin: false,
        hasMinistry: false,
        canUploadSong: false,
      });
    });
  });

  describe('onUserDoc', () => {
    it('reports appAdmin only when it is true', () => {
      const cb = vi.fn();
      createAuthGateway(services).onUserDoc('u1', cb);
      handlers.next({ data: () => ({ appAdmin: 'true' }) });
      expect(cb).toHaveBeenLastCalledWith({ appAdmin: false });
      handlers.next({ data: () => ({ appAdmin: true }) });
      expect(cb).toHaveBeenLastCalledWith({ appAdmin: true });
    });

    it('falls back to appAdmin false when the users doc fails to load', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const cb = vi.fn();
      createAuthGateway(services).onUserDoc('u1', cb);
      handlers.fail(new Error('permission-denied'));
      expect(cb).toHaveBeenCalledWith({ appAdmin: false });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('onMemberships', () => {
    it('takes the ministry id from the parent of the members collection and ignores invalid roles', () => {
      const cb = vi.fn();
      const doc = (ministryId: string, role: unknown) => ({
        ref: { parent: { parent: { id: ministryId } } },
        get: (field: string) => (field === 'role' ? role : undefined),
      });
      createAuthGateway(services).onMemberships('u1', cb, vi.fn());
      handlers.next({
        data: () => ({}),
        docs: [doc('hajaluz', 'admin'), doc('outro', 'superuser'), doc('cantares', 'member')],
      });
      expect(cb).toHaveBeenCalledWith([
        { ministryId: 'hajaluz', role: 'admin' },
        { ministryId: 'cantares', role: 'member' },
      ]);
    });

    it('reports listener errors to the caller', () => {
      const onError = vi.fn();
      createAuthGateway(services).onMemberships('u1', vi.fn(), onError);
      handlers.fail(new Error('failed-precondition'));
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('onMinistry', () => {
    it('reports name and city of the ministry', () => {
      const cb = vi.fn();
      createAuthGateway(services).onMinistry('hajaluz', cb);
      handlers.next({ data: () => ({ name: 'Haja Luz', city: 'São Paulo' }) });
      expect(cb).toHaveBeenCalledWith({ name: 'Haja Luz', city: 'São Paulo' });
    });

    it('reports null when the ministry document does not exist', () => {
      const cb = vi.fn();
      createAuthGateway(services).onMinistry('hajaluz', cb);
      handlers.next({ data: () => undefined });
      expect(cb).toHaveBeenCalledWith(null);
    });
  });

  it('clears pdf cache on sign out', async () => {
    const calls: string[] = [];
    const deleteCache = vi.fn((name: string) => {
      calls.push(`delete:${name}`);
      return Promise.resolve(true);
    });
    vi.stubGlobal('caches', { delete: deleteCache });
    const reload = vi.fn(() => calls.push('reload'));
    await createAuthGateway(services, { reload }).signOut();
    expect(deleteCache).toHaveBeenCalledWith('cifras-pdfs');
    expect(calls).toEqual(['delete:cifras-pdfs', 'reload']);
  });

  it('still reloads when the cache storage is unavailable or fails', async () => {
    vi.stubGlobal('caches', undefined);
    const reload = vi.fn();
    await createAuthGateway(services, { reload }).signOut();
    expect(reload).toHaveBeenCalledTimes(1);
    vi.stubGlobal('caches', { delete: () => Promise.reject(new Error('denied')) });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await createAuthGateway(services, { reload }).signOut();
    expect(reload).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('sign-out ends the session, wipes the local cache and reloads', async () => {
    const calls: string[] = [];
    vi.mocked(signOut).mockImplementationOnce(() => {
      calls.push('signOut');
      return Promise.resolve();
    });
    vi.mocked(terminate).mockImplementationOnce(() => {
      calls.push('terminate');
      return Promise.resolve();
    });
    vi.mocked(clearIndexedDbPersistence).mockImplementationOnce(() => {
      calls.push('clear');
      return Promise.resolve();
    });
    const reload = vi.fn(() => calls.push('reload'));
    await createAuthGateway(services, { reload }).signOut();
    expect(calls).toEqual(['signOut', 'terminate', 'clear', 'reload']);
  });

  it('still reloads when clearing the cache fails', async () => {
    vi.mocked(clearIndexedDbPersistence).mockRejectedValueOnce(new Error('busy'));
    const reload = vi.fn();
    await createAuthGateway(services, { reload }).signOut();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('runs beforeSignOut before signOut, then reloads', async () => {
    const order: string[] = [];
    vi.mocked(signOut).mockImplementationOnce(async () => {
      order.push('signOut');
    });
    const gateway = createAuthGateway(services, {
      reload: () => order.push('reload'),
      beforeSignOut: async () => {
        order.push('before');
      },
    });
    await gateway.signOut();
    expect(order).toEqual(['before', 'signOut', 'reload']);
  });

  it('still signs out and reloads when beforeSignOut rejects', async () => {
    const order: string[] = [];
    vi.mocked(signOut).mockImplementationOnce(async () => {
      order.push('signOut');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const gateway = createAuthGateway(services, {
      reload: () => order.push('reload'),
      beforeSignOut: async () => {
        throw new Error('offline');
      },
    });
    try {
      await gateway.signOut();
      expect(order).toEqual(['signOut', 'reload']);
      expect(warn).toHaveBeenCalledWith('Falha ao desativar os avisos ao sair', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  describe('forgetLocalData', () => {
    it('stores the removal notice in sessionStorage, wipes the cache and reloads', async () => {
      const calls: string[] = [];
      vi.mocked(terminate).mockImplementationOnce(() => {
        calls.push('terminate');
        return Promise.resolve();
      });
      const reload = vi.fn(() => calls.push('reload'));
      await createAuthGateway(services, { reload }).forgetLocalData('Haja Luz');
      expect(sessionStorage.getItem('cifras:removido')).toBe('Haja Luz');
      expect(calls).toEqual(['terminate', 'reload']);
    });

    it('does not store a notice when no ministry name is given', async () => {
      const reload = vi.fn();
      await createAuthGateway(services, { reload }).forgetLocalData();
      expect(sessionStorage.getItem('cifras:removido')).toBeNull();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('still reloads when terminate fails', async () => {
      vi.mocked(terminate).mockRejectedValueOnce(new Error('busy'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const reload = vi.fn();
      await createAuthGateway(services, { reload }).forgetLocalData('Haja Luz');
      expect(reload).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});
