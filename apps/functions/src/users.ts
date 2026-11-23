import { HttpsError } from 'firebase-functions/v2/https';
import { buildClaims, type Claims } from './ministries/claims';
import { roleForNewUser, validateRoleChange, type Role } from './roles';

export type UserDeps = {
  setClaims(uid: string, claims: Claims): Promise<void>;
  writeUser(uid: string, data: Record<string, unknown>, merge: boolean): Promise<void>;
  userExists(uid: string): Promise<boolean>;
  getUserRole(uid: string): Promise<Role | undefined>;
  applyHajaLuzRole(uid: string, role: Role, callerUid: string): Promise<void>;
  recalcClaims(uid: string, next: { role: Role }): Promise<void>;
  now(): Date;
};

const CLAIM_ATTEMPTS = 3;

async function setClaimsWithRetry(deps: UserDeps, uid: string, claims: Claims): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    try {
      await deps.setClaims(uid, claims);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function createUserProfile(
  deps: UserDeps,
  user: {
    uid: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    photoURL?: string;
  },
  adminEmails: string[],
): Promise<Role> {
  // Evento duplicado não pode rebaixar quem já foi promovido.
  const existing = await deps.getUserRole(user.uid);
  if (existing) return existing;
  const role = roleForNewUser(user.email, user.emailVerified === true, adminEmails);
  const appAdmin = role === 'admin'; // só vem de ADMIN_EMAILS
  await setClaimsWithRetry(deps, user.uid, buildClaims({ role, appAdmin, memberRoles: [] }));
  await deps.writeUser(
    user.uid,
    {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      role,
      appAdmin,
      createdAt: deps.now(),
    },
    false,
  );
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
  await deps.applyHajaLuzRole(result.targetUid, result.newRole, input.callerUid ?? '');
  // Claims antes do documento: o cliente atualiza o token uma vez, quando users/{uid}.role muda.
  // Se as claims falharem, users/{uid} fica como estava; repetir a chamada é seguro.
  await deps.recalcClaims(result.targetUid, { role: result.newRole });
  await deps.writeUser(result.targetUid, { role: result.newRole, roleUpdatedAt: deps.now() }, true);
  return { uid: result.targetUid, role: result.newRole };
}
