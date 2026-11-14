export type Role = 'viewer' | 'member' | 'admin';

export const ROLES: readonly Role[] = ['viewer', 'member', 'admin'];

export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

export function roleForNewUser(email: string | undefined, adminEmails: string[]): Role {
  if (!email) return 'viewer';
  return adminEmails.includes(email.trim().toLowerCase()) ? 'admin' : 'viewer';
}

type RoleChangeInput = {
  callerUid: string | undefined;
  callerRole: unknown;
  targetUid: unknown;
  newRole: unknown;
};

export type RoleChangeErrorCode =
  | 'unauthenticated'
  | 'permission-denied'
  | 'invalid-argument'
  | 'failed-precondition';

export type RoleChangeResult =
  | { ok: true; targetUid: string; newRole: Role }
  | { ok: false; code: RoleChangeErrorCode; message: string };

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function validateRoleChange(input: RoleChangeInput): RoleChangeResult {
  const { callerUid, callerRole, targetUid, newRole } = input;
  if (!callerUid) {
    return { ok: false, code: 'unauthenticated', message: 'Login required.' };
  }
  if (callerRole !== 'admin') {
    return { ok: false, code: 'permission-denied', message: 'Only admins can change roles.' };
  }
  if (typeof targetUid !== 'string' || targetUid.length === 0) {
    return { ok: false, code: 'invalid-argument', message: 'Invalid target user.' };
  }
  if (!isRole(newRole)) {
    return { ok: false, code: 'invalid-argument', message: 'Invalid role.' };
  }
  if (targetUid === callerUid) {
    return { ok: false, code: 'failed-precondition', message: 'You cannot change your own role.' };
  }
  return { ok: true, targetUid, newRole };
}
