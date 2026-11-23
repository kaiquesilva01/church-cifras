import type { Role } from '../roles';
import type { MembershipRole, MinistryDeps } from './deps';

export type Claims = {
  role: Role;
  appAdmin: boolean;
  hasMinistry: boolean;
  canUploadSong: boolean;
};

export function buildClaims(input: {
  role: Role;
  appAdmin: boolean;
  memberRoles: MembershipRole[];
}): Claims {
  return {
    role: input.role,
    appAdmin: input.appAdmin,
    hasMinistry: input.memberRoles.length > 0,
    canUploadSong: input.appAdmin || input.memberRoles.includes('admin'),
  };
}

// Recalcula os quatro campos a partir do documento. Sem usuário: não grava nada.
export async function recalcClaims(
  deps: Pick<MinistryDeps, 'readUser' | 'listMembershipsOfUser' | 'setClaims'>,
  uid: string,
): Promise<void> {
  const user = await deps.readUser(uid);
  if (!user) return;
  const memberships = await deps.listMembershipsOfUser(uid);
  await deps.setClaims(
    uid,
    buildClaims({
      role: user.role ?? 'viewer',
      appAdmin: user.appAdmin,
      memberRoles: memberships.map((m) => m.role),
    }),
  );
}
