import { describe, expect, it } from 'vitest';
import { parseAdminEmails, roleForNewUser, validateRoleChange } from './roles';

describe('parseAdminEmails', () => {
  it('parses admin emails trimming and lowercasing', () => {
    expect(parseAdminEmails(' A@x.com, ,b@Y.com ')).toEqual(['a@x.com', 'b@y.com']);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe('roleForNewUser', () => {
  it('matches admin emails case-insensitively', () => {
    expect(roleForNewUser(' Admin@Cifras.local ', true, ['admin@cifras.local'])).toBe('admin');
    expect(roleForNewUser('other@x.com', true, ['admin@cifras.local'])).toBe('viewer');
    expect(roleForNewUser(undefined, true, ['admin@cifras.local'])).toBe('viewer');
  });

  it('does not grant admin to unverified email', () => {
    expect(roleForNewUser('admin@cifras.local', false, ['admin@cifras.local'])).toBe('viewer');
  });
});

describe('validateRoleChange', () => {
  const base = { callerUid: 'u1', callerRole: 'admin', targetUid: 'u2', newRole: 'member' };

  it('rejects unauthenticated caller', () => {
    const r = validateRoleChange({ ...base, callerUid: undefined });
    expect(r).toMatchObject({ ok: false, code: 'unauthenticated' });
  });

  it('rejects non-admin caller', () => {
    const r = validateRoleChange({ ...base, callerRole: 'member' });
    expect(r).toMatchObject({ ok: false, code: 'permission-denied' });
  });

  it('rejects changing own role', () => {
    const r = validateRoleChange({ ...base, targetUid: 'u1' });
    expect(r).toMatchObject({ ok: false, code: 'failed-precondition' });
  });

  it('rejects unknown role and non-string target', () => {
    expect(validateRoleChange({ ...base, newRole: 'owner' })).toMatchObject({
      ok: false,
      code: 'invalid-argument',
    });
    expect(validateRoleChange({ ...base, targetUid: 42 })).toMatchObject({
      ok: false,
      code: 'invalid-argument',
    });
  });

  it('accepts admin changing another user', () => {
    expect(validateRoleChange(base)).toEqual({ ok: true, targetUid: 'u2', newRole: 'member' });
  });
});
