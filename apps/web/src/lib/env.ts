import type { WebEnv } from './firebase';

const ALWAYS: (keyof WebEnv)[] = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
  'VITE_USE_EMULATORS',
];

export function readWebEnv(raw: Record<string, string | undefined>): WebEnv {
  const keys: (keyof WebEnv)[] =
    raw.VITE_USE_EMULATORS === 'true' ? [...ALWAYS, 'VITE_EMULATOR_HOST'] : ALWAYS;
  const missing = keys.filter((key) => !raw[key]);
  if (missing.length > 0) {
    throw new Error(`Configuração ausente: ${missing.join(', ')}`);
  }
  return {
    VITE_FIREBASE_API_KEY: raw.VITE_FIREBASE_API_KEY!,
    VITE_FIREBASE_AUTH_DOMAIN: raw.VITE_FIREBASE_AUTH_DOMAIN!,
    VITE_FIREBASE_PROJECT_ID: raw.VITE_FIREBASE_PROJECT_ID!,
    VITE_FIREBASE_STORAGE_BUCKET: raw.VITE_FIREBASE_STORAGE_BUCKET!,
    VITE_FIREBASE_APP_ID: raw.VITE_FIREBASE_APP_ID!,
    VITE_USE_EMULATORS: raw.VITE_USE_EMULATORS!,
    VITE_EMULATOR_HOST: raw.VITE_EMULATOR_HOST ?? '',
  };
}
