import { describe, expect, it } from 'vitest';
import { recalcClaims, type Claims } from './ministries/claims';
import { createFakeMinistryDeps } from './ministries/fakeDeps';
import type { Role } from './roles';
import { changeUserRole, createUserProfile, type UserDeps } from './users';

const NOW = new Date('2026-11-14T12:00:00Z');

function fakeDeps(exists = true, existingRole?: Role) {
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
    userExists: async () => exists,
    getUserRole: async () => existingRole,
    applyHajaLuzRole: async (uid, role) => {
      calls.push(`applyHajaLuzRole:${uid}:${role}`);
    },
    recalcClaims: async (uid) => {
      calls.push(`recalcClaims:${uid}`);
    },
    now: () => NOW,
  };
  return { deps, claims, writes, calls };
}

const INPUT_MEMBER: Parameters<typeof changeUserRole>[1] = {
  callerUid: 'adm',
  callerRole: 'admin',
  targetUid: 'u1',
  newRole: 'member',
};

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
    const { deps, claims, writes } = fakeDeps(true, 'member');
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

// Ponte real de claims (recalcClaims sobre o fake do ministério). Registra a ordem das
// gravações e o papel que users/{uid} tinha no momento em que as claims foram gravadas.
function changeDeps(seed: Record<string, Record<string, unknown>>, exists = true) {
  const ministry = createFakeMinistryDeps(seed);
  const calls: string[] = [];
  const writes: Array<[string, Record<string, unknown>, boolean]> = [];
  const docRoles: Array<string | undefined> = [];
  const recordClaims = ministry.deps.setClaims;
  ministry.deps.setClaims = async (uid, claims) => {
    calls.push(`setClaims:${uid}:${claims.role}`);
    docRoles.push(ministry.docs.get(`users/${uid}`)?.role as string | undefined);
    await recordClaims(uid, claims);
  };
  const deps: UserDeps = {
    setClaims: async () => undefined,
    writeUser: async (uid, data, merge) => {
      calls.push(`writeUser:${uid}`);
      writes.push([uid, data, merge]);
    },
    userExists: async () => exists,
    getUserRole: async () => undefined,
    applyHajaLuzRole: async (uid, role, caller) => {
      calls.push(`applyHajaLuzRole:${uid}:${role}:${caller}`);
    },
    recalcClaims: (uid, next) => recalcClaims(ministry.deps, uid, next),
    now: () => NOW,
  };
  return { deps, calls, writes, docRoles, ministry };
}

const SEED_MEMBER = {
  'users/u1': { role: 'viewer', appAdmin: false },
  'ministries/hajaluz/members/u1': { uid: 'u1', role: 'member' },
};

describe('changeUserRole', () => {
  it('ordem: applyHajaLuzRole -> claims do papel novo (quatro campos) -> writeUser', async () => {
    const { deps, calls, writes, docRoles, ministry } = changeDeps(SEED_MEMBER);
    await changeUserRole(deps, INPUT_MEMBER);
    expect(calls).toEqual([
      'applyHajaLuzRole:u1:member:adm',
      'setClaims:u1:member',
      'writeUser:u1',
    ]);
    // users/u1 ainda tinha o papel antigo quando as claims saíram: o cliente só vê a troca depois.
    expect(docRoles).toEqual(['viewer']);
    expect(ministry.claimCalls).toEqual([
      ['u1', { role: 'member', appAdmin: false, hasMinistry: true, canUploadSong: false }],
    ]);
    expect(writes).toEqual([['u1', { role: 'member', roleUpdatedAt: NOW }, true]]);
  });

  it('papel admin: claims com canUploadSong', async () => {
    const { deps, ministry } = changeDeps({
      'users/u1': { role: 'member', appAdmin: false },
      'ministries/hajaluz/members/u1': { uid: 'u1', role: 'admin' },
    });
    await changeUserRole(deps, { ...INPUT_MEMBER, newRole: 'admin' });
    expect(ministry.claimCalls).toEqual([
      ['u1', { role: 'admin', appAdmin: false, hasMinistry: true, canUploadSong: true }],
    ]);
  });

  it('sem ministério Haja Luz (ponte no-op): claims do papel novo e papel gravado', async () => {
    const { deps, writes, calls, ministry } = changeDeps({
      'users/u1': { role: 'viewer', appAdmin: false },
    });
    deps.applyHajaLuzRole = async () => undefined; // ponte sem ministries/hajaluz não grava nada
    const result = await changeUserRole(deps, INPUT_MEMBER);
    expect(result).toEqual({ uid: 'u1', role: 'member' });
    expect(calls).toEqual(['setClaims:u1:member', 'writeUser:u1']);
    expect(ministry.claimCalls).toEqual([
      ['u1', { role: 'member', appAdmin: false, hasMinistry: false, canUploadSong: false }],
    ]);
    expect(writes).toEqual([['u1', { role: 'member', roleUpdatedAt: NOW }, true]]);
  });

  it('falha ao gravar claims: users/{uid} não é gravado; nova tentativa grava uma vez', async () => {
    const { deps, writes, ministry } = changeDeps(SEED_MEMBER);
    const recordClaims = ministry.deps.setClaims;
    ministry.deps.setClaims = async () => {
      throw new Error('boom');
    };
    await expect(changeUserRole(deps, INPUT_MEMBER)).rejects.toThrow('boom');
    expect(writes).toEqual([]);

    ministry.deps.setClaims = recordClaims;
    await changeUserRole(deps, INPUT_MEMBER);
    expect(writes).toEqual([['u1', { role: 'member', roleUpdatedAt: NOW }, true]]);
  });

  it('se applyHajaLuzRole lança, writeUser não é chamado', async () => {
    const { deps, writes } = fakeDeps(true, 'viewer');
    deps.applyHajaLuzRole = async () => {
      throw new Error('falhou');
    };
    await expect(changeUserRole(deps, INPUT_MEMBER)).rejects.toThrow('falhou');
    expect(writes).toEqual([]);
  });

  it('repassa o uid de quem altera à ponte e grava role e roleUpdatedAt', async () => {
    const { deps, writes } = fakeDeps(true, 'viewer');
    const seen: unknown[] = [];
    deps.applyHajaLuzRole = async (...args) => {
      seen.push(args);
    };
    const result = await changeUserRole(deps, INPUT_MEMBER);
    expect(result).toEqual({ uid: 'u1', role: 'member' });
    expect(seen).toEqual([['u1', 'member', 'adm']]);
    expect(writes).toEqual([['u1', { role: 'member', roleUpdatedAt: NOW }, true]]);
  });

  it('throws HttpsError with validation code', async () => {
    const { deps, calls, writes } = fakeDeps();
    await expect(
      changeUserRole(deps, { ...INPUT_MEMBER, callerRole: 'member' }),
    ).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it('rejects self change', async () => {
    const { deps, calls, writes } = fakeDeps();
    await expect(changeUserRole(deps, { ...INPUT_MEMBER, targetUid: 'adm' })).rejects.toMatchObject(
      {
        code: 'failed-precondition',
      },
    );
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  it('fails when target user does not exist', async () => {
    const { deps, calls, writes } = fakeDeps(false);
    await expect(changeUserRole(deps, INPUT_MEMBER)).rejects.toMatchObject({ code: 'not-found' });
    expect(calls).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });
});
