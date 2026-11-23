import { describe, expect, it } from 'vitest';
import { createFakeMinistryDeps } from './fakeDeps';
import { assertAppAdmin, assertCanManageMinistry } from './permissions';

const seed = {
  'ministries/hajaluz': { name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo' },
  'ministries/outro': { name: 'Outro', nameNormalized: 'outro', city: 'Sumaré' },
  'users/app': { role: 'viewer', appAdmin: true, displayName: 'App', email: null, photoURL: null },
  'users/m1': { role: 'viewer', appAdmin: false, displayName: 'M1', email: null, photoURL: null },
  'users/u1': { role: 'viewer', appAdmin: false, displayName: 'U1', email: null, photoURL: null },
  'users/o2': { role: 'viewer', appAdmin: false, displayName: 'O2', email: null, photoURL: null },
  'ministries/hajaluz/members/m1': { uid: 'm1', role: 'admin' },
  'ministries/hajaluz/members/u1': { uid: 'u1', role: 'member' },
  'ministries/outro/members/o2': { uid: 'o2', role: 'admin' },
};

describe('assertCanManageMinistry', () => {
  it('app admin sem vínculo: app-admin', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertCanManageMinistry(deps, 'app', 'hajaluz')).resolves.toBe('app-admin');
  });

  it('admin do ministério: ministry-admin', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertCanManageMinistry(deps, 'm1', 'hajaluz')).resolves.toBe('ministry-admin');
  });

  it('membro comum: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertCanManageMinistry(deps, 'u1', 'hajaluz')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('admin de outro ministério: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertCanManageMinistry(deps, 'o2', 'hajaluz')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('caller sem users/{uid}: permission-denied', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertCanManageMinistry(deps, 'ghost', 'hajaluz')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });
});

describe('assertAppAdmin', () => {
  it('admin da app passa; admin de ministério não', async () => {
    const { deps } = createFakeMinistryDeps(seed);
    await expect(assertAppAdmin(deps, 'app')).resolves.toBeUndefined();
    await expect(assertAppAdmin(deps, 'm1')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
