import { buildClaims, type Claims } from './ministries/claims';
import { roleForNewUser, type Role } from './roles';

export type UserDeps = {
  setClaims(uid: string, claims: Claims): Promise<void>;
  writeUser(uid: string, data: Record<string, unknown>, merge: boolean): Promise<void>;
  getUserRole(uid: string): Promise<Role | undefined>;
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
