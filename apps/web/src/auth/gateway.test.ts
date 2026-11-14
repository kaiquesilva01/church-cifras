import { describe, expect, it, vi } from 'vitest';
import type { FirebaseServices } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, terminate } from 'firebase/firestore';
import { createAuthGateway } from './gateway';

type Next = (snap: { data: () => unknown }) => void;
type Fail = (error: Error) => void;
let handlers: { next: Next; fail: Fail };

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
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

describe('createAuthGateway', () => {
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
});
