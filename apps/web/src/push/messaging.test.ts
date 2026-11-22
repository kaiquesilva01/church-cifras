import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMessagingPort, type MessagingSdk } from './messaging';

function fakeSdk(overrides: Partial<Record<keyof MessagingSdk, unknown>> = {}) {
  return {
    isSupported: vi.fn(async () => true),
    getMessaging: vi.fn(() => ({ name: 'messaging' })),
    getToken: vi.fn(async () => 'tok-1'),
    deleteToken: vi.fn(async () => true),
    ...overrides,
  };
}

const app = { name: 'app' } as never;
const loaderFor = (sdk: unknown) => async () => sdk as MessagingSdk;

beforeEach(() => {
  vi.stubGlobal('Notification', { permission: 'default' });
});

describe('createMessagingPort', () => {
  it('reports false only when the SDK says the browser is unsupported', async () => {
    const sdk = fakeSdk({ isSupported: vi.fn(async () => false) });
    await expect(createMessagingPort(app, loaderFor(sdk)).isSupported()).resolves.toBe(false);
  });

  it('rejects when the SDK chunk fails to load (an error, not "unsupported")', async () => {
    const port = createMessagingPort(app, async () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    await expect(port.isSupported()).rejects.toThrow('Failed to fetch');
  });

  it('does not cache a failed load: the next call tries again', async () => {
    const sdk = fakeSdk();
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(sdk);
    const port = createMessagingPort(app, loader as never);
    await expect(port.isSupported()).rejects.toThrow('offline');
    await expect(port.isSupported()).resolves.toBe(true);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('gets the token with the VAPID key', async () => {
    const sdk = fakeSdk();
    const port = createMessagingPort(app, loaderFor(sdk));
    await port.isSupported();
    await expect(port.getToken('vapid')).resolves.toBe('tok-1');
    expect(sdk.getToken).toHaveBeenCalledWith({ name: 'messaging' }, { vapidKey: 'vapid' });
  });

  it('calls the SDK synchronously once loaded (keeps the tap gesture)', async () => {
    const sdk = fakeSdk();
    const port = createMessagingPort(app, loaderFor(sdk));
    await port.isSupported();
    void port.getToken('vapid');
    expect(sdk.getToken).toHaveBeenCalledTimes(1);
  });

  it('reads permission, and "unsupported" without the Notification API', () => {
    const port = createMessagingPort(app, loaderFor(fakeSdk()));
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(port.permission()).toBe('denied');
    vi.stubGlobal('Notification', undefined);
    expect(port.permission()).toBe('unsupported');
  });

  it('never subscribes to foreground messages (criterion 11: no duplicate with the app open)', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'messaging.ts'), 'utf8');
    expect(source).not.toMatch(/onMessage/);
  });
});
