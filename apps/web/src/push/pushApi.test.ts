import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPushApi } from './pushApi';

const callable = vi.fn(async (data?: unknown) => ({ data: { ok: true, data } }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));
import { httpsCallable } from 'firebase/functions';

const functions = { name: 'functions' };
const api = createPushApi({ loadFunctions: async () => functions as never });

beforeEach(() => {
  callable.mockClear();
  vi.mocked(httpsCallable).mockClear();
});

describe('createPushApi', () => {
  it('calls registerDevice with token and origin', async () => {
    await api.register('tok', 'teste');
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'registerDevice');
    expect(callable).toHaveBeenCalledWith({ token: 'tok', origin: 'teste' });
  });

  it('calls unregisterDevice with the token only', async () => {
    await api.unregister('tok');
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'unregisterDevice');
    expect(callable).toHaveBeenCalledWith({ token: 'tok' });
  });

  it('returns the sendTestPush counts', async () => {
    callable.mockResolvedValueOnce({ data: { sent: 2, failed: 0, pruned: 1 } } as never);
    await expect(api.sendTest()).resolves.toEqual({ sent: 2, failed: 0, pruned: 1 });
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'sendTestPush');
  });
});
