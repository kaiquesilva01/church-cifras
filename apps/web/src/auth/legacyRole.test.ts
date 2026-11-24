import { describe, expect, it } from 'vitest';
import { legacyRole } from './legacyRole';

const admin = { id: 'hajaluz', name: 'Haja Luz', city: 'São Paulo', role: 'admin' as const };
const member = { id: 'hajaluz', name: 'Haja Luz', city: 'São Paulo', role: 'member' as const };

describe('legacyRole', () => {
  it('app admin is admin', () => {
    expect(legacyRole({ appAdmin: true, canUploadSong: true, ministry: null })).toBe('admin');
  });

  it('ministry admin with the canUploadSong claim is admin', () => {
    expect(legacyRole({ appAdmin: false, canUploadSong: true, ministry: admin })).toBe('admin');
  });

  it('ministry admin without the claim yet is not admin', () => {
    expect(legacyRole({ appAdmin: false, canUploadSong: false, ministry: admin })).toBe('member');
  });

  it('member with a ministry is member; without one is viewer', () => {
    expect(legacyRole({ appAdmin: false, canUploadSong: false, ministry: member })).toBe('member');
    expect(legacyRole({ appAdmin: false, canUploadSong: false, ministry: null })).toBe('viewer');
  });
});
