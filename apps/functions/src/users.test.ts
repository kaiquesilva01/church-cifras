import { describe, expect, it } from 'vitest';
import { changeUserRole, createUserProfile, type UserDeps } from './users';

const NOW = new Date('2026-11-14T12:00:00Z');

function fakeDeps(exists = true) {
  const claims: Array<[string, { role: string }]> = [];
  const writes: Array<[string, Record<string, unknown>, boolean]> = [];
  const deps: UserDeps = {
    setClaims: async (uid, c) => void claims.push([uid, c]),
    writeUser: async (uid, data, merge) => void writes.push([uid, data, merge]),
    userExists: async () => exists,
    now: () => NOW,
  };
  return { deps, claims, writes };
}

describe('createUserProfile', () => {
  it('creates viewer profile and claim', async () => {
    const { deps, claims, writes } = fakeDeps();
    const role = await createUserProfile(
      deps,
      { uid: 'u1', email: 'a@x.com', displayName: 'A', photoURL: 'p' },
      ['admin@cifras.local'],
    );
    expect(role).toBe('viewer');
    expect(claims).toEqual([['u1', { role: 'viewer' }]]);
    expect(writes).toEqual([
      ['u1', { displayName: 'A', email: 'a@x.com', photoURL: 'p', role: 'viewer', createdAt: NOW }, false],
    ]);
  });

  it('creates admin profile for admin email', async () => {
    const { deps, claims, writes } = fakeDeps();
    const role = await createUserProfile(deps, { uid: 'u9', email: 'Admin@Cifras.local' }, [
      'admin@cifras.local',
    ]);
    expect(role).toBe('admin');
    expect(claims).toEqual([['u9', { role: 'admin' }]]);
    expect(writes[0]?.[1]).toMatchObject({ role: 'admin' });
  });
});

describe('changeUserRole', () => {
  const input = { callerUid: 'u1', callerRole: 'admin', targetUid: 'u2', newRole: 'member' };

  it('sets claim and merges role', async () => {
    const { deps, claims, writes } = fakeDeps();
    const result = await changeUserRole(deps, input);
    expect(result).toEqual({ uid: 'u2', role: 'member' });
    expect(claims).toEqual([['u2', { role: 'member' }]]);
    expect(writes).toEqual([['u2', { role: 'member', roleUpdatedAt: NOW }, true]]);
  });

  it('throws HttpsError with validation code', async () => {
    const { deps } = fakeDeps();
    await expect(changeUserRole(deps, { ...input, callerRole: 'member' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('fails when target user does not exist', async () => {
    const { deps } = fakeDeps(false);
    await expect(changeUserRole(deps, input)).rejects.toMatchObject({ code: 'not-found' });
  });
});
