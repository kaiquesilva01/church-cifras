import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getCountFromServer: vi.fn(),
  onSnapshot: vi.fn(),
  httpsCallable: vi.fn(),
  callFn: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  collectionGroup: vi.fn((_db: unknown, name: string) => ({ path: `group:${name}` })),
  query: vi.fn((base: object, ...constraints: unknown[]) => ({ ...base, constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  getDocs: m.getDocs,
  getCountFromServer: m.getCountFromServer,
  onSnapshot: m.onSnapshot,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: m.httpsCallable,
}));

import { collection, collectionGroup, where } from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import { CallableError, GENERIC_MESSAGE } from './callable';
import { createMinistriesApi } from './ministriesApi';

const db = { kind: 'db' };
const functions = { kind: 'functions' };
const services = {
  db,
  loadFunctions: vi.fn(() => Promise.resolve(functions)),
} as unknown as FirebaseServices;

function snap(docs: Array<{ id?: string; path?: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((d) => ({
      id: d.id,
      ref: { parent: { parent: d.path ? { id: d.path } : null } },
      data: () => d.data,
    })),
  };
}

/** Responde getDocs pelo caminho da consulta (collection/collectionGroup). */
function answerGetDocs(answers: Record<string, ReturnType<typeof snap>>) {
  m.getDocs.mockImplementation((q: { path: string }) =>
    Promise.resolve(answers[q.path] ?? snap([])),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.httpsCallable.mockReturnValue(m.callFn);
  m.callFn.mockResolvedValue({ data: undefined });
  m.getDocs.mockResolvedValue(snap([]));
});

describe('leituras de ministérios', () => {
  it('listMinistries ordena por nome em pt-BR e devolve nameNormalized', async () => {
    answerGetDocs({
      ministries: snap([
        { id: 'b', data: { name: 'Zeta', city: 'Recife' } },
        { id: 'a', data: { name: 'Água Viva', city: 'São Paulo', nameNormalized: 'agua viva' } },
      ]),
    });
    const api = createMinistriesApi(services);
    await expect(api.listMinistries()).resolves.toEqual([
      { id: 'a', name: 'Água Viva', city: 'São Paulo', nameNormalized: 'agua viva' },
      { id: 'b', name: 'Zeta', city: 'Recife', nameNormalized: 'zeta' },
    ]);
  });

  it('subscribeMyRequests consulta collectionGroup requests filtrado pelo uid', () => {
    const cb = vi.fn();
    const onError = vi.fn();
    m.onSnapshot.mockImplementation((_q: unknown, next: (s: unknown) => void) => {
      next(snap([{ path: 'hajaluz', data: { status: 'pending' } }]));
      return vi.fn();
    });
    const api = createMinistriesApi(services);
    api.subscribeMyRequests('u1', cb, onError);
    expect(collectionGroup).toHaveBeenCalledWith(db, 'requests');
    expect(where).toHaveBeenCalledWith('uid', '==', 'u1');
    expect(cb).toHaveBeenCalledWith([{ ministryId: 'hajaluz', status: 'pending' }]);
  });

  it('countPending conta pedidos pendentes do ministério no servidor', async () => {
    m.getCountFromServer.mockResolvedValue({ data: () => ({ count: 3 }) });
    const api = createMinistriesApi(services);
    await expect(api.countPending('hajaluz')).resolves.toBe(3);
    expect(collection).toHaveBeenCalledWith(db, 'ministries', 'hajaluz', 'requests');
    expect(where).toHaveBeenCalledWith('status', '==', 'pending');
  });

  it('countPendingAll conta pedidos pendentes em todos os ministérios', async () => {
    m.getCountFromServer.mockResolvedValue({ data: () => ({ count: 5 }) });
    const api = createMinistriesApi(services);
    await expect(api.countPendingAll()).resolves.toBe(5);
    expect(collectionGroup).toHaveBeenCalledWith(db, 'requests');
    expect(where).toHaveBeenCalledWith('status', '==', 'pending');
  });

  it('listRequests traz só os pedidos pendentes do ministério', async () => {
    answerGetDocs({
      'ministries/hajaluz/requests': snap([
        { id: 'u9', data: { displayName: 'Ana', email: 'ana@exemplo.test', photoURL: null } },
      ]),
    });
    const api = createMinistriesApi(services);
    await expect(api.listRequests('hajaluz')).resolves.toEqual([
      { uid: 'u9', displayName: 'Ana', email: 'ana@exemplo.test', photoURL: null, createdAt: null },
    ]);
    expect(where).toHaveBeenCalledWith('status', '==', 'pending');
  });

  it('listMembers traz os membros com o papel', async () => {
    answerGetDocs({
      'ministries/hajaluz/members': snap([
        { id: 'u1', data: { displayName: 'Bia', email: 'bia@exemplo.test', role: 'admin' } },
      ]),
    });
    const api = createMinistriesApi(services);
    await expect(api.listMembers('hajaluz')).resolves.toEqual([
      expect.objectContaining({ uid: 'u1', displayName: 'Bia', role: 'admin' }),
    ]);
  });

  it('listAllPendingRequests junta o pedido ao nome do ministério', async () => {
    answerGetDocs({
      'group:requests': snap([
        { id: 'u2', path: 'hajaluz', data: { displayName: 'Caio', email: 'caio@exemplo.test' } },
      ]),
      ministries: snap([{ id: 'hajaluz', data: { name: 'Haja Luz', city: 'São Paulo' } }]),
    });
    const api = createMinistriesApi(services);
    await expect(api.listAllPendingRequests()).resolves.toEqual([
      expect.objectContaining({
        uid: 'u2',
        ministryId: 'hajaluz',
        ministryName: 'Haja Luz',
        ministryCity: 'São Paulo',
      }),
    ]);
  });

  it('listAppUsers ordena por nome e marca appAdmin', async () => {
    answerGetDocs({
      users: snap([
        { id: 'u2', data: { displayName: 'Zé', email: 'ze@exemplo.test' } },
        { id: 'u1', data: { displayName: 'Ana', email: 'ana@exemplo.test', appAdmin: true } },
      ]),
    });
    const api = createMinistriesApi(services);
    const users = await api.listAppUsers();
    expect(users.map((u) => [u.uid, u.appAdmin])).toEqual([
      ['u1', true],
      ['u2', false],
    ]);
  });
});

describe('callables de ministérios', () => {
  it.each([
    ['requestAccess', ['hajaluz'], 'requestMinistryAccess', { ministryId: 'hajaluz' }],
    ['cancelRequest', ['hajaluz'], 'cancelMinistryRequest', { ministryId: 'hajaluz' }],
    ['approve', ['hajaluz', 'u1'], 'approveMinistryRequest', { ministryId: 'hajaluz', uid: 'u1' }],
    ['reject', ['hajaluz', 'u1'], 'rejectMinistryRequest', { ministryId: 'hajaluz', uid: 'u1' }],
    [
      'setRole',
      ['hajaluz', 'u1', 'admin'],
      'setMinistryMemberRole',
      { ministryId: 'hajaluz', uid: 'u1', role: 'admin' },
    ],
    [
      'removeMember',
      ['hajaluz', 'u1'],
      'removeMinistryMember',
      { ministryId: 'hajaluz', uid: 'u1' },
    ],
    [
      'updateMinistry',
      ['hajaluz', 'Haja', 'Recife'],
      'updateMinistry',
      { ministryId: 'hajaluz', name: 'Haja', city: 'Recife' },
    ],
    ['setAppAdmin', ['u1', true], 'setAppAdmin', { uid: 'u1', appAdmin: true }],
    ['createMinistry', ['Nova', 'Recife'], 'createMinistry', { name: 'Nova', city: 'Recife' }],
  ] as const)('%s chama %s com a chave de C3', async (method, args, name, payload) => {
    const api = createMinistriesApi(services);
    if (method === 'createMinistry') m.callFn.mockResolvedValue({ data: { ministryId: 'nova' } });
    const fn = api.callable[method] as (...a: unknown[]) => Promise<unknown>;
    await fn(...args);
    expect(m.httpsCallable).toHaveBeenCalledWith(functions, name);
    expect(m.callFn).toHaveBeenCalledWith(payload);
  });

  it('createMinistry devolve o ministryId', async () => {
    m.callFn.mockResolvedValue({ data: { ministryId: 'nova' } });
    const api = createMinistriesApi(services);
    await expect(api.callable.createMinistry('Nova', 'Recife')).resolves.toEqual({
      ministryId: 'nova',
    });
  });

  it('getStats manda ministryId só quando pedido e devolve StatsCallerResult', async () => {
    const result = { general: null, ministry: null };
    m.callFn.mockResolvedValue({ data: result });
    const api = createMinistriesApi(services);
    await expect(api.callable.getStats('hajaluz')).resolves.toEqual(result);
    expect(m.callFn).toHaveBeenLastCalledWith({ ministryId: 'hajaluz' });
    await api.callable.getStats();
    expect(m.callFn).toHaveBeenLastCalledWith({});
  });

  it('erro conhecido do servidor chega com a mensagem dele', async () => {
    m.callFn.mockRejectedValue({
      code: 'functions/failed-precondition',
      message: 'Este pedido não está pendente.',
    });
    const api = createMinistriesApi(services);
    const error = await api.callable.approve('hajaluz', 'u1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CallableError);
    expect(error).toMatchObject({
      code: 'failed-precondition',
      message: 'Este pedido não está pendente.',
    });
  });

  it('falha de rede (sem código conhecido) vira mensagem genérica', async () => {
    m.callFn.mockRejectedValue({ code: 'functions/unavailable', message: 'UNAVAILABLE' });
    const api = createMinistriesApi(services);
    const error = await api.callable.reject('hajaluz', 'u1').catch((e: unknown) => e);
    expect(error).toMatchObject({ message: GENERIC_MESSAGE });
  });
});
