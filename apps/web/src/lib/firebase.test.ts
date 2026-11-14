import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({ name: 'app' })) }));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ name: 'auth' })),
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

import { connectAuthEmulator, getAuth } from 'firebase/auth';
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

  it('connects to emulators only when flag is true', () => {
    const s = createFirebase(baseEnv);
    expect(connectAuthEmulator).toHaveBeenCalledWith(s.auth, 'http://localhost:9099');
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(s.db, 'localhost', 8080);
    expect(connectStorageEmulator).toHaveBeenCalledWith(s.storage, 'localhost', 9199);
    expect(connectFunctionsEmulator).toHaveBeenCalledWith(s.functions, 'localhost', 5001);

    vi.clearAllMocks();
    createFirebase({ ...baseEnv, VITE_USE_EMULATORS: 'false' });
    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectStorageEmulator).not.toHaveBeenCalled();
    expect(connectFunctionsEmulator).not.toHaveBeenCalled();
  });

  it('uses southamerica-east1 for functions', () => {
    const s = createFirebase(baseEnv);
    expect(getFunctions).toHaveBeenCalledWith(s.app, 'southamerica-east1');
    expect(getAuth).toHaveBeenCalled();
    expect(initializeFirestore).toHaveBeenCalled();
    expect(getStorage).toHaveBeenCalled();
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
