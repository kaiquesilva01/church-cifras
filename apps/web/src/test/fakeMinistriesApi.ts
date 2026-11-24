import { vi } from 'vitest';
import type { MinistriesApi } from '../ministries/ministriesApi';

type CallableOverrides = Partial<MinistriesApi['callable']>;

/**
 * Fake de MinistriesApi: leituras vazias e callables resolvidas por padrão.
 * `overrides.callable` mescla por campo; cada teste sobrescreve só o que usa.
 * Um override que rejeita deve usar `new CallableError(code, mensagem)` (de `ministries/callable.ts`),
 * como o tradutor real: `messageFor` só mostra a mensagem para a classe `CallableError`.
 */
export function createFakeMinistriesApi(
  overrides: Partial<Omit<MinistriesApi, 'callable'>> & { callable?: CallableOverrides } = {},
): MinistriesApi {
  const { callable: callableOverrides, ...readOverrides } = overrides;
  const callable: MinistriesApi['callable'] = {
    requestAccess: vi.fn(() => Promise.resolve()),
    cancelRequest: vi.fn(() => Promise.resolve()),
    approve: vi.fn(() => Promise.resolve()),
    reject: vi.fn(() => Promise.resolve()),
    setRole: vi.fn(() => Promise.resolve()),
    removeMember: vi.fn(() => Promise.resolve()),
    createMinistry: vi.fn(() => Promise.resolve({ ministryId: 'novo' })),
    updateMinistry: vi.fn(() => Promise.resolve()),
    setAppAdmin: vi.fn(() => Promise.resolve()),
    getStats: vi.fn(() => Promise.resolve({ general: null, ministry: null })),
    ...callableOverrides,
  };
  return {
    listMinistries: vi.fn(() => Promise.resolve([])),
    subscribeMyRequests: vi.fn((_uid, cb) => {
      cb([]);
      return () => {};
    }),
    countPending: vi.fn(() => Promise.resolve(0)),
    countPendingAll: vi.fn(() => Promise.resolve(0)),
    listRequests: vi.fn(() => Promise.resolve([])),
    listMembers: vi.fn(() => Promise.resolve([])),
    listAllPendingRequests: vi.fn(() => Promise.resolve([])),
    listAppUsers: vi.fn(() => Promise.resolve([])),
    ...readOverrides,
    callable,
  };
}
