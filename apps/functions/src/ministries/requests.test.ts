import { describe, expect, it } from 'vitest';
import { createFakeMinistryDeps, NOW } from './fakeDeps';
import { approveRequest, cancelRequest, rejectRequest, requestAccess } from './requests';

const base = {
  'ministries/hajaluz': { name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo' },
  'ministries/outro': { name: 'Outro', nameNormalized: 'outro', city: 'Sumaré' },
  'users/u1': {
    role: 'viewer',
    appAdmin: false,
    displayName: 'Ana',
    email: 'ana@example.com',
    photoURL: null,
  },
  'users/u2': { role: 'viewer', appAdmin: false, displayName: 'U2', email: null, photoURL: null },
  'users/adm': { role: 'admin', appAdmin: false, displayName: 'Adm', email: null, photoURL: null },
  'ministries/hajaluz/members/adm': {
    uid: 'adm',
    role: 'admin',
    displayName: 'Adm',
    email: null,
    photoURL: null,
    joinedAt: NOW,
    updatedAt: NOW,
    updatedBy: 'seed',
  },
};
const setup = (extra: Record<string, Record<string, unknown>> = {}) =>
  createFakeMinistryDeps({ ...base, ...extra });
const pedidoU1 = {
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

describe('requestAccess', () => {
  it('pede entrada num ministério sem vínculo', async () => {
    const { deps, docs } = setup();
    await requestAccess(deps, 'u1', { ministryId: 'hajaluz' });
    expect(docs.get('ministries/hajaluz/requests/u1')).toMatchObject({
      uid: 'u1',
      status: 'pending',
      displayName: 'Ana',
      decidedBy: null,
    });
  });

  it('bloqueia quem já tem ministério', async () => {
    const { deps } = setup({ 'ministries/outro/members/u1': { uid: 'u1', role: 'member' } });
    await expect(requestAccess(deps, 'u1', { ministryId: 'hajaluz' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('bloqueia segundo pedido em outro ministério', async () => {
    const { deps } = setup({
      'ministries/outro/requests/u1': {
        uid: 'u1',
        status: 'pending',
        displayName: 'Ana',
        email: null,
        photoURL: null,
      },
    });
    await expect(requestAccess(deps, 'u1', { ministryId: 'hajaluz' })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('repetir o pedido no mesmo ministério é idempotente e não grava', async () => {
    const { deps, docs } = setup(pedidoU1);
    const antes = docs.get('ministries/hajaluz/requests/u1');
    await expect(requestAccess(deps, 'u1', { ministryId: 'hajaluz' })).resolves.toEqual({
      ministryId: 'hajaluz',
      status: 'pending',
    });
    expect(docs.get('ministries/hajaluz/requests/u1')).toEqual(antes);
  });

  it('pede de novo depois de recusado (sobrescreve rejected)', async () => {
    const { deps, docs } = setup({
      'ministries/hajaluz/requests/u2': {
        uid: 'u2',
        status: 'rejected',
        displayName: 'U2',
        email: null,
        photoURL: null,
        createdAt: NOW,
        decidedBy: 'adm',
        decidedAt: NOW,
      },
    });
    await requestAccess(deps, 'u2', { ministryId: 'hajaluz' });
    expect(docs.get('ministries/hajaluz/requests/u2')).toMatchObject({
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it('ministério inexistente: not-found', async () => {
    const { deps } = setup();
    await expect(requestAccess(deps, 'u1', { ministryId: 'nada' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('lê vínculos e pedidos de outros ministérios dentro da transação, antes de gravar', async () => {
    const { deps, log } = setup();
    await requestAccess(deps, 'u1', { ministryId: 'hajaluz' });
    expect(log).toContain('tx:listMembershipsOfUser');
    expect(log).toContain('tx:listPendingRequestsOfUser');
    expect(log.indexOf('tx:listMembershipsOfUser')).toBeLessThan(log.indexOf('tx:write'));
    expect(log.indexOf('tx:listPendingRequestsOfUser')).toBeLessThan(log.indexOf('tx:write'));
  });

  it('pedido recusado não impede novo pedido, inclusive para o mesmo ministério', async () => {
    const { deps } = setup({
      'ministries/hajaluz/requests/u1': {
        uid: 'u1',
        status: 'rejected',
        displayName: 'Ana',
        email: null,
        photoURL: null,
      },
    });
    await expect(requestAccess(deps, 'u1', { ministryId: 'hajaluz' })).resolves.toEqual({
      ministryId: 'hajaluz',
      status: 'pending',
    });
  });

  it('pedido pendente no mesmo ministério devolve pending sem gravar de novo', async () => {
    const { deps, log } = setup(pedidoU1);
    await expect(requestAccess(deps, 'u1', { ministryId: 'hajaluz' })).resolves.toEqual({
      ministryId: 'hajaluz',
      status: 'pending',
    });
    expect(log).not.toContain('tx:write');
  });
});

describe('approveRequest', () => {
  it('aprovar cria membro, apaga o pedido e recalcula claims', async () => {
    const { deps, docs, claimCalls } = setup(pedidoU1);
    await approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
    expect(docs.has('ministries/hajaluz/requests/u1')).toBe(false);
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'member',
      updatedBy: 'adm',
    });
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ hasMinistry: true, canUploadSong: false }),
    ]);
  });

  it('aprovar pedido que não está pendente: failed-precondition', async () => {
    const { deps } = setup({
      'ministries/hajaluz/requests/u1': {
        uid: 'u1',
        status: 'rejected',
        displayName: 'Ana',
        email: null,
        photoURL: null,
      },
    });
    await expect(
      approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('membro comum não aprova: permission-denied', async () => {
    const { deps } = setup({
      ...pedidoU1,
      'ministries/hajaluz/members/u2': { uid: 'u2', role: 'member' },
    });
    await expect(
      approveRequest(deps, 'u2', { ministryId: 'hajaluz', uid: 'u1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('rejectRequest', () => {
  it('recusar marca rejected com decidedBy', async () => {
    const { deps, docs } = setup(pedidoU1);
    await rejectRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
    expect(docs.get('ministries/hajaluz/requests/u1')).toMatchObject({
      status: 'rejected',
      decidedBy: 'adm',
    });
  });
});

describe('cancelRequest', () => {
  it('cancelar apaga o próprio pedido pendente e é idempotente', async () => {
    const { deps, docs } = setup(pedidoU1);
    await cancelRequest(deps, 'u1', { ministryId: 'hajaluz' });
    expect(docs.has('ministries/hajaluz/requests/u1')).toBe(false);
    await expect(cancelRequest(deps, 'u1', { ministryId: 'hajaluz' })).resolves.toEqual({
      ok: true,
    });
  });
});

describe('approveRequest: recuperação e casos de borda', () => {
  it('aprovar duas vezes: a segunda é ok e recalcula claims', async () => {
    const { deps, docs, claimCalls } = setup(pedidoU1);
    await approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
    const primeira = claimCalls.length;
    await expect(
      approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' }),
    ).resolves.toEqual({ ok: true });
    expect(claimCalls.length).toBe(primeira + 1);
    expect(claimCalls.at(-1)).toEqual(['u1', expect.objectContaining({ hasMinistry: true })]);
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'member',
      updatedBy: 'adm',
    });
  });

  it('sem pedido e sem vínculo: not-found', async () => {
    const { deps } = setup();
    await expect(
      approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('com vínculo já existente, não sobrescreve o membro', async () => {
    const membro = {
      uid: 'u1',
      role: 'member',
      displayName: 'Original',
      email: null,
      photoURL: null,
      joinedAt: NOW,
      updatedAt: NOW,
      updatedBy: 'seed',
    };
    const { deps, docs } = setup({ ...pedidoU1, 'ministries/hajaluz/members/u1': membro });
    await approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
    expect(docs.has('ministries/hajaluz/requests/u1')).toBe(false);
    expect(docs.get('ministries/hajaluz/members/u1')).toEqual(membro);
  });
});

describe('rejectRequest: autorização e estados', () => {
  it('membro comum não recusa: permission-denied', async () => {
    const { deps, docs } = setup({
      ...pedidoU1,
      'ministries/hajaluz/members/u2': { uid: 'u2', role: 'member' },
    });
    await expect(
      rejectRequest(deps, 'u2', { ministryId: 'hajaluz', uid: 'u1' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(docs.get('ministries/hajaluz/requests/u1')).toMatchObject({ status: 'pending' });
  });

  it('recusar pedido que não está pendente: failed-precondition', async () => {
    const { deps } = setup({
      'ministries/hajaluz/requests/u1': {
        uid: 'u1',
        status: 'rejected',
        displayName: 'Ana',
        email: null,
        photoURL: null,
      },
    });
    await expect(
      rejectRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' }),
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Este pedido não está pendente.',
    });
  });
});

describe('requestAccess: usuário sem documento', () => {
  it('caller sem users/{uid}: not-found', async () => {
    const { deps } = setup();
    await expect(requestAccess(deps, 'ghost', { ministryId: 'hajaluz' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});
