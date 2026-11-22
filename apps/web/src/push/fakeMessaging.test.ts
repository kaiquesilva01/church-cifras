import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeMessagingPort } from './fakeMessaging';

beforeEach(() => {
  window.sessionStorage.clear();
  window.__CIFRAS_PUSH_FAKE__ = undefined;
});

describe('createFakeMessagingPort', () => {
  it('grants on the simulated prompt and returns the fake token', async () => {
    window.__CIFRAS_PUSH_FAKE__ = { permission: 'default', answer: 'granted' };
    const port = createFakeMessagingPort(window);
    expect(port.permission()).toBe('default');
    await expect(port.getToken('vapid')).resolves.toBe('fake-token-e2e');
    expect(port.permission()).toBe('granted');
  });

  it('rejects with the SDK code when the prompt is answered "denied"', async () => {
    window.__CIFRAS_PUSH_FAKE__ = { permission: 'default', answer: 'denied' };
    const port = createFakeMessagingPort(window);
    await expect(port.getToken('vapid')).rejects.toMatchObject({
      code: 'messaging/permission-blocked',
    });
  });

  it('keeps the answer across reloads of the tab (the E2E reloads the page)', async () => {
    window.__CIFRAS_PUSH_FAKE__ = { permission: 'default', answer: 'granted' };
    await createFakeMessagingPort(window).getToken('vapid');
    // Recarregar: o init script põe de novo 'default', mas a aba já guardou a resposta.
    expect(createFakeMessagingPort(window).permission()).toBe('granted');
  });

  it('fails enable when asked to, and reports unsupported browsers', async () => {
    window.__CIFRAS_PUSH_FAKE__ = { failEnable: true };
    await expect(createFakeMessagingPort(window).getToken('v')).rejects.toThrow();
    window.__CIFRAS_PUSH_FAKE__ = { supported: false };
    await expect(createFakeMessagingPort(window).isSupported()).resolves.toBe(false);
  });
});
