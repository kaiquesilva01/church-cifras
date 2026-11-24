import { describe, expect, it } from 'vitest';
import type { Claims } from './ministries/claims';
import type { Role } from './roles';
import { createUserProfile, type UserDeps } from './users';

const NOW = new Date('2026-11-14T12:00:00Z');

function fakeDeps(existingRole?: Role) {
  const claims: Array<[string, Claims]> = [];
  const writes: Array<[string, Record<string, unknown>, boolean]> = [];
  const calls: string[] = [];
  const deps: UserDeps = {
    setClaims: async (uid, c) => {
      claims.push([uid, c]);
      calls.push('setClaims');
    },
    writeUser: async (uid, data, merge) => {
      writes.push([uid, data, merge]);
      calls.push(`writeUser:${uid}`);
    },
    getUserRole: async () => existingRole,
    now: () => NOW,
  };
  return { deps, claims, writes, calls };
}

describe('createUserProfile', () => {
  it('creates viewer profile and claim with the four fields', async () => {
    const { deps, claims, writes } = fakeDeps();
    const role = await createUserProfile(
      deps,
      { uid: 'u1', email: 'a@x.com', emailVerified: true, displayName: 'A', photoURL: 'p' },
      ['admin@cifras.local'],
    );
    expect(role).toBe('viewer');
    expect(claims).toEqual([
      ['u1', { role: 'viewer', appAdmin: false, hasMinistry: false, canUploadSong: false }],
    ]);
    expect(writes).toEqual([
      [
        'u1',
        {
          displayName: 'A',
          email: 'a@x.com',
          photoURL: 'p',
          role: 'viewer',
          appAdmin: false,
          createdAt: NOW,
        },
        false,
      ],
    ]);
  });

  it('creates admin profile for admin email with appAdmin true', async () => {
    const { deps, claims, writes } = fakeDeps();
    const role = await createUserProfile(
      deps,
      { uid: 'adm', email: 'admin@cifras.local', emailVerified: true },
      ['admin@cifras.local'],
    );
    expect(role).toBe('admin');
    expect(claims).toEqual([
      ['adm', { role: 'admin', appAdmin: true, hasMinistry: false, canUploadSong: true }],
    ]);
    expect(writes[0]?.[1]).toMatchObject({ role: 'admin', appAdmin: true });
  });

  it('does not grant admin to unverified email', async () => {
    const { deps, claims } = fakeDeps();
    const role = await createUserProfile(
      deps,
      { uid: 'u9', email: 'admin@cifras.local', emailVerified: false },
      ['admin@cifras.local'],
    );
    expect(role).toBe('viewer');
    expect(claims).toEqual([
      ['u9', { role: 'viewer', appAdmin: false, hasMinistry: false, canUploadSong: false }],
    ]);
  });

  it('does not overwrite an existing profile', async () => {
    const { deps, claims, writes } = fakeDeps('member');
    const role = await createUserProfile(
      deps,
      { uid: 'u1', email: 'a@x.com', emailVerified: true },
      [],
    );
    expect(role).toBe('member');
    expect(claims).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
});

describe('createUserProfile retries', () => {
  const user = { uid: 'u1', email: 'a@x.com', emailVerified: true };

  it('retries setClaims before writing profile', async () => {
    const { deps, writes } = fakeDeps();
    let calls = 0;
    deps.setClaims = async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
    };
    await createUserProfile(deps, user, []);
    expect(calls).toBe(2);
    expect(writes).toHaveLength(1);
  });

  it('does not write profile when claims keep failing', async () => {
    const { deps, writes } = fakeDeps();
    let calls = 0;
    deps.setClaims = async () => {
      calls += 1;
      throw new Error('boom');
    };
    await expect(createUserProfile(deps, user, [])).rejects.toThrow('boom');
    expect(calls).toBe(3);
    expect(writes).toHaveLength(0);
  });
});
