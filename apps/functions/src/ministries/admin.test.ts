import { describe, expect, it } from 'vitest';
import { createMinistry, setAppAdmin, updateMinistry } from './admin';
import { createFakeMinistryDeps, NOW } from './fakeDeps';

const base = {
  'users/app': { role: 'viewer', appAdmin: true, displayName: 'App', email: null, photoURL: null },
  'users/adm': { role: 'admin', appAdmin: false, displayName: 'Adm', email: null, photoURL: null },
  'users/u1': { role: 'viewer', appAdmin: false, displayName: 'U1', email: null, photoURL: null },
  'ministries/hajaluz': { name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo' },
};

describe('createMinistry', () => {
  it('cria ministério com id slug e campos de busca', async () => {
    const { deps, docs } = createFakeMinistryDeps(base);
    await expect(
      createMinistry(deps, 'app', { name: 'Vida Nova', city: 'Sumaré' }),
    ).resolves.toEqual({ ministryId: 'vida-nova' });
    expect(docs.get('ministries/vida-nova')).toEqual({
      name: 'Vida Nova',
      nameNormalized: 'vida nova',
      city: 'Sumaré',
      createdBy: 'app',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('id já usado: failed-precondition', async () => {
    const { deps } = createFakeMinistryDeps({
      ...base,
      'ministries/vida-nova': { name: 'Vida Nova', nameNormalized: 'vida nova', city: 'X' },
    });
    await expect(
      createMinistry(deps, 'app', { name: 'Vida Nova', city: 'Sumaré' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('nome sem letras: invalid-argument', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(
      createMinistry(deps, 'app', { name: '!!!', city: 'Sumaré' }),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('admin de ministério não cria: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(
      createMinistry(deps, 'adm', { name: 'Vida Nova', city: 'Sumaré' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('updateMinistry', () => {
  it('atualiza nome e cidade e recalcula nameNormalized', async () => {
    const { deps, docs } = createFakeMinistryDeps(base);
    await updateMinistry(deps, 'app', {
      ministryId: 'hajaluz',
      name: 'Haja Luz Central',
      city: 'Santos',
    });
    expect(docs.get('ministries/hajaluz')).toMatchObject({
      name: 'Haja Luz Central',
      nameNormalized: 'haja luz central',
      city: 'Santos',
      updatedAt: NOW,
    });
  });

  it('ministério inexistente: not-found', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(
      updateMinistry(deps, 'app', { ministryId: 'nada', name: 'X', city: 'Y' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('setAppAdmin', () => {
  it('marca outro usuário e recalcula claims (appAdmin true)', async () => {
    const { deps, docs, claimCalls } = createFakeMinistryDeps(base);
    await setAppAdmin(deps, 'app', { uid: 'u1', appAdmin: true });
    expect(docs.get('users/u1')).toMatchObject({ appAdmin: true });
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ appAdmin: true, canUploadSong: true }),
    ]);
  });

  it('repetir o mesmo valor é aceito e recalcula claims de novo', async () => {
    const { deps, claimCalls } = createFakeMinistryDeps(base);
    await setAppAdmin(deps, 'app', { uid: 'u1', appAdmin: true });
    await expect(setAppAdmin(deps, 'app', { uid: 'u1', appAdmin: true })).resolves.toEqual({
      ok: true,
    });
    expect(claimCalls).toHaveLength(2);
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ appAdmin: true, canUploadSong: true }),
    ]);
  });

  it('no próprio uid: failed-precondition', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(setAppAdmin(deps, 'app', { uid: 'app', appAdmin: false })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('alvo sem users/{uid}: not-found', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(setAppAdmin(deps, 'app', { uid: 'ghost', appAdmin: true })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('de quem não é admin da app: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(base);
    await expect(setAppAdmin(deps, 'adm', { uid: 'u1', appAdmin: true })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
