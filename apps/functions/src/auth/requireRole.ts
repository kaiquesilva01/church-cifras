import { HttpsError } from 'firebase-functions/v2/https';
import { ROLES, type Role } from '../roles';

export type RoleDeps = { getUserRole(uid: string): Promise<unknown> };

// Lê o papel em users/{uid} (fonte da verdade), sem depender do token (que pode durar 1 h).
export async function requireRole(
  deps: RoleDeps,
  uid: string | undefined,
  allowed: Role[],
): Promise<Role> {
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
  const raw = await deps.getUserRole(uid);
  const role = ROLES.find((r) => r === raw);
  if (!role || !allowed.includes(role)) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  return role;
}
