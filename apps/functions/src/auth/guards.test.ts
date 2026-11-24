import { describe, expect, it } from 'vitest';
import {
  requireAppAdmin,
  requireCatalogContributor,
  requireMinistryMember,
  requireUploader,
  type GuardDeps,
} from './guards';

type Membership = { ministryId: string; role: 'member' | 'admin' };

function deps(
  users: Record<string, { appAdmin: boolean }>,
  memberships: Record<string, Membership[]>,
): GuardDeps {
  return {
    readUser: async (uid) => users[uid] ?? null,
    listMembershipsOfUser: async (uid) => memberships[uid] ?? [],
  };
}

const d = deps(
  {
    chefe: { appAdmin: true },
    ana: { appAdmin: false },
    adm: { appAdmin: false },
    sem: { appAdmin: false },
  },
  {
    ana: [{ ministryId: 'hajaluz', role: 'member' }],
    adm: [{ ministryId: 'hajaluz', role: 'admin' }],
  },
);

describe('requireAppAdmin', () => {
  it('sem login: unauthenticated', async () => {
    await expect(requireAppAdmin(d, undefined)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('membro comum: permission-denied', async () => {
    await expect(requireAppAdmin(d, 'ana')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('admin da app: passa', async () => {
    await expect(requireAppAdmin(d, 'chefe')).resolves.toBeUndefined();
  });
});

describe('requireMinistryMember', () => {
  it('membro passa', async () => {
    await expect(requireMinistryMember(d, 'ana')).resolves.toBeUndefined();
  });
  it('admin da app sem vínculo é negado (hasMinistry é a regra)', async () => {
    await expect(requireMinistryMember(d, 'chefe')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
  it('sem nenhum vínculo é negado', async () => {
    await expect(requireMinistryMember(d, 'sem')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('requireUploader (pode subir cifra)', () => {
  it('membro não sobe', async () => {
    await expect(requireUploader(d, 'ana')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('admin de ministério sobe', async () => {
    await expect(requireUploader(d, 'adm')).resolves.toBeUndefined();
  });
  it('admin da app sobe sem ministério', async () => {
    await expect(requireUploader(d, 'chefe')).resolves.toBeUndefined();
  });
});

describe('requireCatalogContributor (tom gerado, descarte de upload)', () => {
  it('membro passa', async () => {
    await expect(requireCatalogContributor(d, 'ana')).resolves.toBeUndefined();
  });
  it('admin da app sem ministério passa', async () => {
    await expect(requireCatalogContributor(d, 'chefe')).resolves.toBeUndefined();
  });
  it('sem vínculo e sem app admin é negado', async () => {
    await expect(requireCatalogContributor(d, 'sem')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});
