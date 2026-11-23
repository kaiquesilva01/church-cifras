import { describe, expect, it } from 'vitest';
import { createFakeMinistryDeps } from './fakeDeps';

describe('fake: escritas em transação', () => {
  it('create em documento existente falha com ALREADY_EXISTS e código 6', async () => {
    const { deps } = createFakeMinistryDeps({
      'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    });
    const err = await deps
      .runTransaction(async (tx) =>
        tx.write({ op: 'create', path: 'ministries/hajaluz', data: { name: 'x' } }),
      )
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ message: 'ALREADY_EXISTS', code: 6 });
  });

  it('merge cria documento ausente', async () => {
    const { deps, docs } = createFakeMinistryDeps({});
    await deps.runTransaction(async (tx) =>
      tx.write({ op: 'merge', path: 'users/u1', data: { appAdmin: true } }),
    );
    expect(docs.get('users/u1')).toEqual({ appAdmin: true });
  });

  it('merge preserva os demais campos', async () => {
    const { deps, docs } = createFakeMinistryDeps({
      'users/u1': { role: 'member', appAdmin: false },
    });
    await deps.runTransaction(async (tx) =>
      tx.write({ op: 'merge', path: 'users/u1', data: { appAdmin: true } }),
    );
    expect(docs.get('users/u1')).toEqual({ role: 'member', appAdmin: true });
  });

  it('set sobrescreve o documento inteiro', async () => {
    const { deps, docs } = createFakeMinistryDeps({
      'users/u1': { role: 'member', appAdmin: true },
    });
    await deps.runTransaction(async (tx) =>
      tx.write({ op: 'set', path: 'users/u1', data: { role: 'viewer' } }),
    );
    expect(docs.get('users/u1')).toEqual({ role: 'viewer' });
  });

  it('delete de documento ausente não falha', async () => {
    const { deps, docs } = createFakeMinistryDeps({});
    await expect(
      deps.runTransaction(async (tx) => tx.write({ op: 'delete', path: 'users/ghost' })),
    ).resolves.toBeUndefined();
    expect(docs.has('users/ghost')).toBe(false);
  });

  it('só aplica as escritas quando a transação termina: é tudo ou nada', async () => {
    const { deps, docs } = createFakeMinistryDeps({ 'users/u1': { role: 'viewer' } });
    await expect(
      deps.runTransaction(async (tx) => {
        tx.write({ op: 'set', path: 'users/u2', data: { role: 'member' } });
        tx.write({ op: 'set', path: 'users/u1', data: { role: 'admin' } });
        throw new Error('falhou no meio');
      }),
    ).rejects.toThrow('falhou no meio');
    expect(docs.has('users/u2')).toBe(false);
    expect(docs.get('users/u1')).toEqual({ role: 'viewer' });
  });

  it('conflito de create no commit não deixa escrita parcial', async () => {
    const { deps, docs } = createFakeMinistryDeps({ 'users/u1': { role: 'viewer' } });
    await expect(
      deps.runTransaction(async (tx) => {
        tx.write({ op: 'set', path: 'users/u2', data: { role: 'member' } });
        tx.write({ op: 'create', path: 'users/u1', data: { role: 'admin' } });
      }),
    ).rejects.toMatchObject({ code: 6 });
    expect(docs.has('users/u2')).toBe(false);
    expect(docs.get('users/u1')).toEqual({ role: 'viewer' });
  });

  it('leitura depois de escrita na mesma transação lança erro', async () => {
    const { deps } = createFakeMinistryDeps({ 'users/u1': { role: 'viewer' } });
    await expect(
      deps.runTransaction(async (tx) => {
        tx.write({ op: 'set', path: 'users/u2', data: { role: 'member' } });
        await tx.readUser('u1');
      }),
    ).rejects.toThrow();
  });

  it('leituras antes das escritas funcionam normalmente', async () => {
    const { deps, docs } = createFakeMinistryDeps({
      'users/u1': { role: 'viewer', appAdmin: false },
    });
    await deps.runTransaction(async (tx) => {
      const u = await tx.readUser('u1');
      tx.write({ op: 'merge', path: 'users/u1', data: { appAdmin: !u?.appAdmin } });
    });
    expect(docs.get('users/u1')).toEqual({ role: 'viewer', appAdmin: true });
  });
});

describe('fake: listagens', () => {
  const seed = {
    'ministries/hajaluz/members/u1': { uid: 'u1', role: 'member' },
    'ministries/outro/members/u1': { uid: 'u1', role: 'admin' },
    'ministries/hajaluz/members/u2': { uid: 'u2', role: 'admin' },
    'ministries/hajaluz/requests/u1': { uid: 'u1', status: 'pending' },
    'ministries/outro/requests/u1': { uid: 'u1', status: 'rejected' },
    'ministries/outro/requests/u2': { uid: 'u2', status: 'pending' },
  };

  it('listMembershipsOfUser filtra pelo uid', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    const found = await deps.listMembershipsOfUser('u1');
    expect(found).toEqual(
      expect.arrayContaining([
        { ministryId: 'hajaluz', role: 'member' },
        { ministryId: 'outro', role: 'admin' },
      ]),
    );
    expect(found).toHaveLength(2);
  });

  it('listPendingRequestsOfUser filtra pelo uid e pelo status pending', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    expect(await deps.listPendingRequestsOfUser('u1')).toEqual([{ ministryId: 'hajaluz' }]);
    expect(await deps.listPendingRequestsOfUser('u2')).toEqual([{ ministryId: 'outro' }]);
  });
});
