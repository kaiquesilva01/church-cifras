import { describe, expect, it } from 'vitest';
import { buildClaims, recalcClaims } from './claims';
import { createFakeMinistryDeps } from './fakeDeps';

describe('buildClaims', () => {
  it.each([
    [
      { role: 'viewer', appAdmin: false, memberRoles: ['member'] },
      { role: 'viewer', appAdmin: false, hasMinistry: true, canUploadSong: false },
    ],
    [
      { role: 'member', appAdmin: false, memberRoles: ['admin'] },
      { role: 'member', appAdmin: false, hasMinistry: true, canUploadSong: true },
    ],
    [
      { role: 'viewer', appAdmin: true, memberRoles: [] },
      { role: 'viewer', appAdmin: true, hasMinistry: false, canUploadSong: true },
    ],
    [
      { role: 'viewer', appAdmin: false, memberRoles: [] },
      { role: 'viewer', appAdmin: false, hasMinistry: false, canUploadSong: false },
    ],
  ])('buildClaims %#', (input, expected) =>
    expect(buildClaims(input as Parameters<typeof buildClaims>[0])).toEqual(expected),
  );
});

describe('recalcClaims', () => {
  it('grava os quatro campos', async () => {
    const { deps, claimCalls } = createFakeMinistryDeps({
      'users/u1': { role: 'member', appAdmin: false },
      'ministries/hajaluz/members/u1': { uid: 'u1', role: 'member' },
    });
    await recalcClaims(deps, 'u1');
    expect(claimCalls).toEqual([
      ['u1', { role: 'member', appAdmin: false, hasMinistry: true, canUploadSong: false }],
    ]);
  });

  it('usuário inexistente: não grava claims', async () => {
    const { deps, claimCalls } = createFakeMinistryDeps({});
    await recalcClaims(deps, 'ghost');
    expect(claimCalls).toEqual([]);
  });

  it('sem role no usuário: role viewer no claim', async () => {
    const { deps, claimCalls } = createFakeMinistryDeps({ 'users/u2': { appAdmin: false } });
    await recalcClaims(deps, 'u2');
    expect(claimCalls).toEqual([
      ['u2', { role: 'viewer', appAdmin: false, hasMinistry: false, canUploadSong: false }],
    ]);
  });
});
