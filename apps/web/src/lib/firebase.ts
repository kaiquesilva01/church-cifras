import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import type { Functions } from 'firebase/functions';
import type { FirebaseStorage } from 'firebase/storage';

export interface WebEnv {
  VITE_FIREBASE_API_KEY: string;
  VITE_FIREBASE_AUTH_DOMAIN: string;
  VITE_FIREBASE_PROJECT_ID: string;
  VITE_FIREBASE_STORAGE_BUCKET: string;
  VITE_FIREBASE_APP_ID: string;
  VITE_USE_EMULATORS: string;
  VITE_EMULATOR_HOST: string;
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  /** Storage e Functions só são baixados (import dinâmico) no primeiro uso. */
  loadStorage(): Promise<FirebaseStorage>;
  loadFunctions(): Promise<Functions>;
}

export const FUNCTIONS_REGION = 'southamerica-east1';

export function createFirebase(env: WebEnv): FirebaseServices {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  // Cache persistente só onde há IndexedDB (navegador); jsdom/SSR usam o cache em memória.
  const db = initializeFirestore(
    app,
    typeof indexedDB === 'undefined'
      ? {}
      : { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  );
  const useEmulators = env.VITE_USE_EMULATORS === 'true';
  const host = env.VITE_EMULATOR_HOST;

  if (useEmulators) {
    connectAuthEmulator(auth, `http://${host}:9099`);
    connectFirestoreEmulator(db, host, 8080);
  }

  let storagePromise: Promise<FirebaseStorage> | undefined;
  let functionsPromise: Promise<Functions> | undefined;

  const loadStorage = (): Promise<FirebaseStorage> =>
    (storagePromise ??= import('firebase/storage').then(
      ({ getStorage, connectStorageEmulator }) => {
        const storage = getStorage(app);
        if (useEmulators) connectStorageEmulator(storage, host, 9199);
        return storage;
      },
    ));
  const loadFunctions = (): Promise<Functions> =>
    (functionsPromise ??= import('firebase/functions').then(
      ({ getFunctions, connectFunctionsEmulator }) => {
        const functions = getFunctions(app, FUNCTIONS_REGION);
        if (useEmulators) connectFunctionsEmulator(functions, host, 5001);
        return functions;
      },
    ));

  return { app, auth, db, loadStorage, loadFunctions };
}
