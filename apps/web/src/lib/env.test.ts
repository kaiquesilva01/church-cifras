import { describe, expect, it } from 'vitest';
import { readWebEnv } from './env';

const full = {
  VITE_FIREBASE_API_KEY: 'k',
  VITE_FIREBASE_AUTH_DOMAIN: 'd',
  VITE_FIREBASE_PROJECT_ID: 'p',
  VITE_FIREBASE_STORAGE_BUCKET: 'b',
  VITE_FIREBASE_APP_ID: 'a',
  VITE_USE_EMULATORS: 'true',
  VITE_EMULATOR_HOST: 'localhost',
};

describe('readWebEnv', () => {
  it('returns typed env when complete', () => {
    expect(readWebEnv({ ...full, EXTRA: 'x' })).toEqual(full);
  });

  it('throws listing every missing env key', () => {
    const raw = { ...full, VITE_FIREBASE_API_KEY: undefined, VITE_FIREBASE_APP_ID: '' };
    expect(() => readWebEnv(raw)).toThrow(
      'Configuração ausente: VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID',
    );
  });
});
