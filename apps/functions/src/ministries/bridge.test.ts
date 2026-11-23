import { logger } from 'firebase-functions/logger';
import { describe, expect, it, vi } from 'vitest';
import { applyHajaLuzRole } from './bridge';
import { createFakeMinistryDeps, NOW } from './fakeDeps';

vi.mock('firebase-functions/logger', () => ({ logger: { warn: vi.fn() } }));

const OLD = new Date('2026-01-01T00:00:00Z');
const haja = {
  'ministries/hajaluz': { name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo' },
};
const ana = {
  'users/u1': {
    role: 'viewer',
    appAdmin: false,
    displayName: 'Ana',
    email: 'ana@example.com',
    photoURL: null,
  },
};
const pedido = {
  'ministries/hajaluz/requests/u1': {
    uid: 'u1',
    status: 'pending',
    displayName: 'Ana',
    email: 'ana@example.com',
    photoURL: null,
    createdAt: NOW,
    decidedBy: null,
    decidedAt: null,
  },
};
const vinculo = {
  'ministries/hajaluz/members/u1': {
    uid: 'u1',
    role: 'member',
    displayName: 'Ana',
    email: 'ana@example.com',
    photoURL: null,
    joinedAt: OLD,
    updatedAt: OLD,
    updatedBy: 'seed',
  },
};

describe('applyHajaLuzRole', () => {
  it('member cria vínculo com joinedAt e apaga o pedido pendente', async () => {
    const { deps, docs } = createFakeMinistryDeps({ ...haja, ...ana, ...pedido });
    await applyHajaLuzRole(deps, 'u1', 'member', 'adm');
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'member',
      displayName: 'Ana',
      updatedBy: 'adm',
      joinedAt: NOW,
    });
    expect(docs.has('ministries/hajaluz/requests/u1')).toBe(false);
  });

  it('admin cria vínculo com role admin', async () => {
    const { deps, docs } = createFakeMinistryDeps({ ...haja, ...ana });
    await applyHajaLuzRole(deps, 'u1', 'admin', 'adm');
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({ role: 'admin' });
  });

  it('viewer apaga o vínculo existente e mantém o pedido pendente', async () => {
    const { deps, docs } = createFakeMinistryDeps({ ...haja, ...ana, ...vinculo, ...pedido });
    await applyHajaLuzRole(deps, 'u1', 'viewer', 'adm');
    expect(docs.has('ministries/hajaluz/members/u1')).toBe(false);
    expect(docs.has('ministries/hajaluz/requests/u1')).toBe(true);
  });

  it('sem ministries/hajaluz: no-op, nada lido nem gravado no vínculo ou pedido', async () => {
    const { deps, docs } = createFakeMinistryDeps({ ...ana, ...pedido, ...vinculo });
    const antes = new Map(docs);
    await expect(applyHajaLuzRole(deps, 'u1', 'admin', 'adm')).resolves.toBeUndefined();
    expect(docs).toEqual(antes);
  });

  it('sem ministries/hajaluz: avisa no log, sem dados pessoais', async () => {
    vi.mocked(logger.warn).mockClear();
    const { deps } = createFakeMinistryDeps({ ...ana });
    await applyHajaLuzRole(deps, 'u1', 'admin', 'adm');
    const calls = vi.mocked(logger.warn).mock.calls;
    expect(calls).toHaveLength(1);
    const [message] = calls[0] ?? [];
    expect(typeof message).toBe('string');
    expect(message).not.toMatch(/u1|ana@|example\.com|adm/);
  });

  it('com ministries/hajaluz: não avisa', async () => {
    vi.mocked(logger.warn).mockClear();
    const { deps } = createFakeMinistryDeps({ ...haja, ...ana });
    await applyHajaLuzRole(deps, 'u1', 'admin', 'adm');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('vínculo existente preserva joinedAt', async () => {
    const { deps, docs } = createFakeMinistryDeps({ ...haja, ...ana, ...vinculo });
    await applyHajaLuzRole(deps, 'u1', 'admin', 'adm');
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'admin',
      joinedAt: OLD,
    });
  });
});
