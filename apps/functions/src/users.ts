import { HttpsError } from 'firebase-functions/v2/https';
import { roleForNewUser, validateRoleChange, type Role } from './roles';

export type UserDeps = {
  setClaims(uid: string, claims: { role: Role }): Promise<void>;
  writeUser(uid: string, data: Record<string, unknown>, merge: boolean): Promise<void>;
  userExists(uid: string): Promise<boolean>;
  now(): Date;
};

export async function createUserProfile(
  deps: UserDeps,
  user: { uid: string; email?: string; displayName?: string; photoURL?: string },
  adminEmails: string[],
): Promise<Role> {
  const role = roleForNewUser(user.email, adminEmails);
  await deps.writeUser(
    user.uid,
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      role,
      createdAt: deps.now(),
    },
    false,
  );
  await deps.setClaims(user.uid, { role });
  return role;
}

export async function changeUserRole(
  deps: UserDeps,
  input: Parameters<typeof validateRoleChange>[0],
): Promise<{ uid: string; role: Role }> {
  const result = validateRoleChange(input);
  if (!result.ok) throw new HttpsError(result.code, result.message);
  if (!(await deps.userExists(result.targetUid))) {
    throw new HttpsError('not-found', 'User not found.');
  }
  await deps.setClaims(result.targetUid, { role: result.newRole });
  await deps.writeUser(
    result.targetUid,
    { role: result.newRole, roleUpdatedAt: deps.now() },
    true,
  );
  return { uid: result.targetUid, role: result.newRole };
}
