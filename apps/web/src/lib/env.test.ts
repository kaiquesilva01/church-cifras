import { describe, expect, it } from 'vitest';
import { readPushConfig, readWebEnv } from './env';

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

  it('requires emulator host only when emulators are on', () => {
    const raw = { ...full, VITE_EMULATOR_HOST: undefined };
    expect(() => readWebEnv(raw)).toThrow('VITE_EMULATOR_HOST');
    const prod = readWebEnv({ ...raw, VITE_USE_EMULATORS: 'false' });
    expect(prod.VITE_EMULATOR_HOST).toBe('');
  });

  it('throws listing every missing env key', () => {
    const raw = { ...full, VITE_FIREBASE_API_KEY: undefined, VITE_FIREBASE_APP_ID: '' };
    expect(() => readWebEnv(raw)).toThrow(
      'Configuração ausente: VITE_FIREBASE_API_KEY, VITE_FIREBASE_APP_ID',
    );
  });
});

describe('readPushConfig', () => {
  it('is null without the VAPID key, and never throws', () => {
    expect(readPushConfig({})).toBeNull();
    expect(readPushConfig({ VITE_FIREBASE_MESSAGING_SENDER_ID: '123' })).toBeNull();
  });

  it('is null without the sender id (the line would be dead)', () => {
    expect(readPushConfig({ VITE_FIREBASE_VAPID_KEY: 'vapid' })).toBeNull();
  });

  it('treats an empty string as absent', () => {
    expect(
      readPushConfig({ VITE_FIREBASE_VAPID_KEY: '', VITE_FIREBASE_MESSAGING_SENDER_ID: '123' }),
    ).toBeNull();
  });

  it('returns both values when both exist', () => {
    expect(
      readPushConfig({
        VITE_FIREBASE_VAPID_KEY: 'vapid',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
      }),
    ).toEqual({ vapidKey: 'vapid', messagingSenderId: '123' });
  });
});
