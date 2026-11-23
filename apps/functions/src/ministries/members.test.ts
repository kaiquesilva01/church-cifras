import { describe, expect, it } from 'vitest';
import { createFakeMinistryDeps, NOW } from './fakeDeps';
import { removeMember, setMemberRole } from './members';

const HAJA = {
  'ministries/hajaluz': { name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo' },
};
const usuario = (uid: string, appAdmin = false) => ({
  [`users/${uid}`]: { role: 'viewer', appAdmin, displayName: uid, email: null, photoURL: null },
});
const vinculo = (mid: string, uid: string, role: 'member' | 'admin') => ({
  [`ministries/${mid}/members/${uid}`]: {
    uid,
    role,
    displayName: uid,
    email: null,
    photoURL: null,
    joinedAt: NOW,
    updatedAt: NOW,
    updatedBy: 'seed',
  },
});
const seed = (...partes: Array<Record<string, Record<string, unknown>>>) =>
  Object.assign({}, HAJA, ...partes);

describe('setMemberRole', () => {
  it('admin do ministério torna membro em admin: canUploadSong passa a true', async () => {
    const { deps, docs, claimCalls } = createFakeMinistryDeps(
      seed(
        usuario('adm'),
        vinculo('hajaluz', 'adm', 'admin'),
        usuario('u1'),
        vinculo('hajaluz', 'u1', 'member'),
      ),
    );
    await setMemberRole(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1', role: 'admin' });
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'admin',
      updatedBy: 'adm',
    });
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ hasMinistry: true, canUploadSong: true }),
    ]);
  });

  it('com dois admins, o admin do ministério rebaixa um deles', async () => {
    const { deps, docs } = createFakeMinistryDeps(
      seed(
        usuario('adm'),
        vinculo('hajaluz', 'adm', 'admin'),
        usuario('u2'),
        vinculo('hajaluz', 'u2', 'admin'),
      ),
    );
    await setMemberRole(deps, 'adm', { ministryId: 'hajaluz', uid: 'u2', role: 'member' });
    expect(docs.get('ministries/hajaluz/members/u2')).toMatchObject({ role: 'member' });
  });

  it('admin do ministério não rebaixa o último admin: failed-precondition', async () => {
    const { deps, docs } = createFakeMinistryDeps(
      seed(usuario('m1'), vinculo('hajaluz', 'm1', 'admin')),
    );
    await expect(
      setMemberRole(deps, 'm1', { ministryId: 'hajaluz', uid: 'm1', role: 'member' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(docs.get('ministries/hajaluz/members/m1')).toMatchObject({ role: 'admin' });
  });

  it('admin da app pode rebaixar o último admin', async () => {
    const { deps, docs } = createFakeMinistryDeps(
      seed(usuario('app', true), usuario('m1'), vinculo('hajaluz', 'm1', 'admin')),
    );
    await setMemberRole(deps, 'app', { ministryId: 'hajaluz', uid: 'm1', role: 'member' });
    expect(docs.get('ministries/hajaluz/members/m1')).toMatchObject({ role: 'member' });
  });

  it('membro comum: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(
      seed(
        usuario('u1'),
        vinculo('hajaluz', 'u1', 'member'),
        usuario('u2'),
        vinculo('hajaluz', 'u2', 'member'),
      ),
    );
    await expect(
      setMemberRole(deps, 'u1', { ministryId: 'hajaluz', uid: 'u2', role: 'admin' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('admin de outro ministério: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(
      seed(
        usuario('o2'),
        vinculo('outro', 'o2', 'admin'),
        usuario('u1'),
        vinculo('hajaluz', 'u1', 'member'),
      ),
    );
    await expect(
      setMemberRole(deps, 'o2', { ministryId: 'hajaluz', uid: 'u1', role: 'admin' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('alvo sem vínculo: not-found', async () => {
    const { deps } = createFakeMinistryDeps(
      seed(usuario('adm'), vinculo('hajaluz', 'adm', 'admin')),
    );
    await expect(
      setMemberRole(deps, 'adm', { ministryId: 'hajaluz', uid: 'ghost', role: 'member' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('repetir o mesmo papel: ok, sem regravar o vínculo, e recalcula claims', async () => {
    const { deps, docs, claimCalls } = createFakeMinistryDeps(
      seed(
        usuario('adm'),
        vinculo('hajaluz', 'adm', 'admin'),
        usuario('u1'),
        vinculo('hajaluz', 'u1', 'admin'),
      ),
    );
    await expect(
      setMemberRole(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1', role: 'admin' }),
    ).resolves.toEqual({ ok: true });
    expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({
      role: 'admin',
      updatedBy: 'seed',
    });
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ hasMinistry: true, canUploadSong: true }),
    ]);
  });
});

describe('removeMember', () => {
  it('admin do ministério não remove o último admin: failed-precondition', async () => {
    const { deps, docs } = createFakeMinistryDeps(
      seed(usuario('m1'), vinculo('hajaluz', 'm1', 'admin')),
    );
    await expect(
      removeMember(deps, 'm1', { ministryId: 'hajaluz', uid: 'm1' }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(docs.has('ministries/hajaluz/members/m1')).toBe(true);
  });

  it('admin da app pode remover o último admin', async () => {
    const { deps, docs } = createFakeMinistryDeps(
      seed(usuario('app', true), usuario('m1'), vinculo('hajaluz', 'm1', 'admin')),
    );
    await removeMember(deps, 'app', { ministryId: 'hajaluz', uid: 'm1' });
    expect(docs.has('ministries/hajaluz/members/m1')).toBe(false);
  });

  it('remover apaga o vínculo e recalcula hasMinistry false', async () => {
    const { deps, docs, claimCalls } = createFakeMinistryDeps(
      seed(
        usuario('adm'),
        vinculo('hajaluz', 'adm', 'admin'),
        usuario('u1'),
        vinculo('hajaluz', 'u1', 'member'),
      ),
    );
    await removeMember(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
    expect(docs.has('ministries/hajaluz/members/u1')).toBe(false);
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ hasMinistry: false, canUploadSong: false }),
    ]);
  });

  it('repetir a remoção de quem já saiu: ok e recalcula claims', async () => {
    const { deps, claimCalls } = createFakeMinistryDeps(
      seed(usuario('adm'), vinculo('hajaluz', 'adm', 'admin'), usuario('u1')),
    );
    await expect(removeMember(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' })).resolves.toEqual({
      ok: true,
    });
    expect(claimCalls.at(-1)).toEqual([
      'u1',
      expect.objectContaining({ hasMinistry: false, canUploadSong: false }),
    ]);
  });
});
