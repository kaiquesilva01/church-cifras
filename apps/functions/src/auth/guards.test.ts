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

describe('sem uid: unauthenticated em todos os guards', () => {
  it.each([
    ['requireAppAdmin', requireAppAdmin],
    ['requireMinistryMember', requireMinistryMember],
    ['requireUploader', requireUploader],
    ['requireCatalogContributor', requireCatalogContributor],
  ])('%s', async (_name, guard) => {
    await expect(guard(d, undefined)).rejects.toMatchObject({
      code: 'unauthenticated',
      message: 'Faça login para continuar.',
    });
  });
});

describe('falha fechada', () => {
  it('users/{uid} ausente nega o admin da app', async () => {
    const semDoc = deps({}, {});
    await expect(requireAppAdmin(semDoc, 'fantasma')).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(requireUploader(semDoc, 'fantasma')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
  it("appAdmin como string 'true' não vale como admin", async () => {
    const str: GuardDeps = {
      readUser: async () => ({ appAdmin: 'true' as unknown as boolean }),
      listMembershipsOfUser: async () => [],
    };
    await expect(requireAppAdmin(str, 'x')).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(requireUploader(str, 'x')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
