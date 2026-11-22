import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  FIREBASE_SDK_VERSION,
  messagingServiceWorkerSource,
  messagingSwConfig,
  messagingSwPlugin,
} from './messagingSw';

const env = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'auth.example',
  VITE_FIREBASE_PROJECT_ID: 'proj',
  VITE_FIREBASE_STORAGE_BUCKET: 'bucket',
  VITE_FIREBASE_APP_ID: 'app-id',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
};

describe('messagingSwConfig', () => {
  it('reads the six keys and needs all of them', () => {
    expect(messagingSwConfig(env)).toEqual({
      apiKey: 'key',
      authDomain: 'auth.example',
      projectId: 'proj',
      storageBucket: 'bucket',
      appId: 'app-id',
      messagingSenderId: '123',
    });
    expect(messagingSwConfig({ ...env, VITE_FIREBASE_MESSAGING_SENDER_ID: undefined })).toBeNull();
  });
});

describe('messagingServiceWorkerSource', () => {
  it('pins the compat SDK to the firebase version of apps/web/package.json', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as {
      dependencies: Record<string, string>;
    };
    expect(FIREBASE_SDK_VERSION).toBe(pkg.dependencies.firebase);
    const source = messagingServiceWorkerSource(messagingSwConfig(env)!);
    expect(source).toContain(`firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`);
    expect(source).toContain('"messagingSenderId":"123"');
    expect(source).not.toContain('VITE_');
  });
});

describe('messagingSwPlugin', () => {
  it('emits firebase-messaging-sw.js at the root of the build', () => {
    const emitFile = vi.fn();
    const plugin = messagingSwPlugin(env);
    (plugin.generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: expect.stringContaining('firebase.messaging()'),
      }),
    );
  });

  it('emits nothing without the full config', () => {
    const emitFile = vi.fn();
    const plugin = messagingSwPlugin({ ...env, VITE_FIREBASE_MESSAGING_SENDER_ID: undefined });
    (plugin.generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile).not.toHaveBeenCalled();
  });
});

describe('messaging service worker (criteria 9 and 11)', () => {
  const source = messagingServiceWorkerSource(messagingSwConfig(env)!);

  it('does not register a scope of its own (the SDK registers /firebase-cloud-messaging-push-scope)', () => {
    expect(source).not.toMatch(/serviceWorker\.register/);
  });

  it('has no background handler: the SDK shows the notification, and nothing shows while the app is open', () => {
    expect(source).not.toContain('onBackgroundMessage');
    expect(source).not.toContain('onMessage');
  });
});
