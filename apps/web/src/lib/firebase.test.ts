import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeApp } from 'firebase/app';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ name: 'app' })) }));
vi.mock('firebase/auth', () => ({
  initializeAuth: vi.fn(() => ({ name: 'auth' })),
  indexedDBLocalPersistence: { type: 'idb' },
  browserLocalPersistence: { type: 'local' },
  connectAuthEmulator: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(() => ({ name: 'db' })),
  persistentLocalCache: vi.fn((o: unknown) => ({ cache: o })),
  persistentMultipleTabManager: vi.fn(() => ({ tab: 'multi' })),
  connectFirestoreEmulator: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({ name: 'storage' })),
  connectStorageEmulator: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(() => ({ name: 'functions' })),
  connectFunctionsEmulator: vi.fn(),
}));

import { connectAuthEmulator, initializeAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { createFirebase, type WebEnv } from './firebase';

const baseEnv: WebEnv = {
  VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-church-cifras.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-church-cifras',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-church-cifras.appspot.com',
  VITE_FIREBASE_APP_ID: 'demo-app-id',
  VITE_USE_EMULATORS: 'true',
  VITE_EMULATOR_HOST: 'localhost',
};

describe('createFirebase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects to emulators only when flag is true', async () => {
    const s = createFirebase(baseEnv);
    expect(connectAuthEmulator).toHaveBeenCalledWith(s.auth, 'http://localhost:9099');
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(s.db, 'localhost', 8080);
    const storage = await s.loadStorage();
    const functions = await s.loadFunctions();
    expect(connectStorageEmulator).toHaveBeenCalledWith(storage, 'localhost', 9199);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith(functions, 'localhost', 5001);

    vi.clearAllMocks();
    const off = createFirebase({ ...baseEnv, VITE_USE_EMULATORS: 'false' });
    await off.loadStorage();
    await off.loadFunctions();
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectStorageEmulator).not.toHaveBeenCalled();
    expect(connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it('adds messagingSenderId to the app config only when given', () => {
    vi.mocked(initializeApp).mockClear();
    createFirebase(baseEnv);
    expect(initializeApp).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ messagingSenderId: expect.anything() }),
    );

    vi.mocked(initializeApp).mockClear();
    createFirebase(baseEnv, { messagingSenderId: '123' });
    expect(initializeApp).toHaveBeenLastCalledWith(
      expect.objectContaining({ messagingSenderId: '123' }),
    );
  });

  it('loads storage and functions lazily', async () => {
    const s = createFirebase(baseEnv);
    expect(getStorage).not.toHaveBeenCalled();
    expect(getFunctions).not.toHaveBeenCalled();

    const [a, b] = await Promise.all([s.loadStorage(), s.loadStorage()]);
    expect(a).toBe(b);
    expect(getStorage).toHaveBeenCalledTimes(1);
    expect(connectStorageEmulator).toHaveBeenCalledTimes(1);
    expect(getFunctions).not.toHaveBeenCalled();

    await s.loadFunctions();
    await s.loadFunctions();
    expect(getFunctions).toHaveBeenCalledTimes(1);
    expect(getFunctions).toHaveBeenCalledWith(s.app, 'southamerica-east1');
  });

  it('retries loading storage and functions after an import failure', async () => {
    const s = createFirebase(baseEnv);
    vi.mocked(getStorage).mockImplementationOnce(() => {
      throw new Error('chunk gone');
    });
    await expect(s.loadStorage()).rejects.toThrow('chunk gone');
    await expect(s.loadStorage()).resolves.toEqual({ name: 'storage' });
    vi.mocked(getFunctions).mockImplementationOnce(() => {
      throw new Error('chunk gone');
    });
    await expect(s.loadFunctions()).rejects.toThrow('chunk gone');
    await expect(s.loadFunctions()).resolves.toEqual({ name: 'functions' });
  });

  it('creates auth and firestore eagerly', () => {
    createFirebase(baseEnv);
    expect(initializeAuth).toHaveBeenCalled();
    expect(initializeFirestore).toHaveBeenCalled();
  });

  it('creates auth without a popup resolver so the gapi iframe stays off the startup path', () => {
    createFirebase(baseEnv);
    expect(initializeAuth).toHaveBeenCalledWith(
      { name: 'app' },
      { persistence: [{ type: 'idb' }, { type: 'local' }] },
    );
  });

  it('uses memory cache without IndexedDB and persistent cache with it', () => {
    expect(typeof indexedDB).toBe('undefined');
    createFirebase(baseEnv);
    expect(initializeFirestore).toHaveBeenLastCalledWith({ name: 'app' }, {});
    expect(persistentLocalCache).not.toHaveBeenCalled();

    vi.stubGlobal('indexedDB', {});
    try {
      createFirebase(baseEnv);
      expect(persistentLocalCache).toHaveBeenCalledWith({ tabManager: { tab: 'multi' } });
      expect(initializeFirestore).toHaveBeenLastCalledWith(
        { name: 'app' },
        { localCache: { cache: { tabManager: { tab: 'multi' } } } },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
