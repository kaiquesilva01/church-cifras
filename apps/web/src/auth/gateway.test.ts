import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FirebaseServices } from '../lib/firebase';
import { browserPopupRedirectResolver, signInWithPopup, signOut } from 'firebase/auth';
import { _getInstance } from '@firebase/auth/internal';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { createAuthGateway } from './gateway';

type Next = (snap: { data: () => unknown }) => void;
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
  onSnapshot: vi.fn((_ref: unknown, next: Next, fail: Fail) => {
    handlers = { next, fail };
    return () => undefined;
  }),
}));

const services = { auth: {}, db: {} } as unknown as FirebaseServices;

afterEach(() => vi.unstubAllGlobals());

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

  it('falls back to viewer when users doc fails to load', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cb = vi.fn();
    createAuthGateway(services).onUserDoc('u1', cb);
    handlers.fail(new Error('permission-denied'));
    expect(cb).toHaveBeenCalledWith(undefined);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats an unknown role in the users doc as missing', () => {
    const cb = vi.fn();
    createAuthGateway(services).onUserDoc('u1', cb);
    handlers.next({ data: () => ({ role: 'superuser' }) });
    expect(cb).toHaveBeenCalledWith(undefined);
  });

  it('reports the role from the users doc', () => {
    const cb = vi.fn();
    createAuthGateway(services).onUserDoc('u1', cb);
    handlers.next({ data: () => ({ role: 'member' }) });
    expect(cb).toHaveBeenCalledWith('member');
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
});
