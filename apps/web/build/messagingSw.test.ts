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

  it('has no background handler: the SDK shows the notification in the background, and the page does not subscribe to messages', () => {
    expect(source).not.toContain('onBackgroundMessage');
    expect(source).not.toContain('onMessage');
  });
});

type PushEvent = { data: { json: () => unknown } | null; waitUntil: (p: Promise<unknown>) => void };

/** Roda o SW gerado num escopo falso: captura o `push` e espera o `waitUntil`. */
function runServiceWorker(source: string, windows: Array<{ visibilityState: string }> = []) {
  let pushHandler: ((event: PushEvent) => void) | undefined;
  const showNotification = vi.fn(() => Promise.resolve());
  const matchAll = vi.fn(() => Promise.resolve(windows));
  const fakeSelf = {
    addEventListener: (type: string, fn: (event: PushEvent) => void) => {
      if (type === 'push') pushHandler = fn;
    },
    clients: { matchAll },
    registration: { showNotification },
  };
  const importScripts = vi.fn();
  const firebaseGlobal = { initializeApp: vi.fn(), messaging: vi.fn() };
  new Function('self', 'importScripts', 'firebase', source)(
    fakeSelf,
    importScripts,
    firebaseGlobal,
  );
  const dispatch = async (data: PushEvent['data']) => {
    const pending: Promise<unknown>[] = [];
    pushHandler?.({ data, waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  };
  return { dispatch, showNotification, matchAll };
}

const testPayload = {
  notification: { title: 'Aviso de teste', body: 'b', tag: 'aviso-teste' },
  fcmOptions: { link: 'https://x/' },
};
const pushOf = (payload: unknown): PushEvent['data'] => ({ json: () => payload });

describe('push handler of the messaging service worker (issue #99)', () => {
  const source = messagingServiceWorkerSource(messagingSwConfig(env)!);

  it('shows the notice with the app open (visible window), keeping the FCM payload for the click', async () => {
    const sw = runServiceWorker(source, [{ visibilityState: 'visible' }]);
    await sw.dispatch(pushOf(testPayload));
    expect(sw.showNotification).toHaveBeenCalledTimes(1);
    expect(sw.showNotification).toHaveBeenCalledWith('Aviso de teste', {
      title: 'Aviso de teste',
      body: 'b',
      tag: 'aviso-teste',
      data: { FCM_MSG: testPayload },
    });
  });

  it('leaves the notice to the SDK when no window is visible (hidden tab or no window)', async () => {
    const hidden = runServiceWorker(source, [{ visibilityState: 'hidden' }]);
    await hidden.dispatch(pushOf(testPayload));
    expect(hidden.showNotification).not.toHaveBeenCalled();

    const none = runServiceWorker(source, []);
    await none.dispatch(pushOf(testPayload));
    expect(none.showNotification).not.toHaveBeenCalled();
  });

  it('asks for the window list of this app, including uncontrolled windows', async () => {
    const sw = runServiceWorker(source, []);
    await sw.dispatch(pushOf(testPayload));
    expect(sw.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
  });

  it('shows nothing for a payload without notification', async () => {
    const sw = runServiceWorker(source, [{ visibilityState: 'visible' }]);
    await sw.dispatch(pushOf({ data: { x: '1' } }));
    expect(sw.showNotification).not.toHaveBeenCalled();
  });

  it('shows nothing and does not reject when the push has no data or the JSON is invalid', async () => {
    const sw = runServiceWorker(source, [{ visibilityState: 'visible' }]);
    await expect(sw.dispatch(null)).resolves.toBeUndefined();
    await expect(
      sw.dispatch({
        json: () => {
          throw new SyntaxError('bad json');
        },
      }),
    ).resolves.toBeUndefined();
    expect(sw.showNotification).not.toHaveBeenCalled();
  });
});
