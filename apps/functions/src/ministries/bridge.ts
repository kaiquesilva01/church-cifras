import type { Role } from '../roles';
import type { MembershipRole, MinistryDeps } from './deps';
import { HAJALUZ_ID, paths } from './model';

// Todas as leituras antes das escritas: no SDK real não se lê depois de escrever na mesma transação.
export async function applyHajaLuzRole(
  deps: MinistryDeps,
  uid: string,
  role: Role,
  callerUid: string,
): Promise<void> {
  await deps.runTransaction(async (tx) => {
    // Antes da migração não há ministério: a Pessoas segue gravando só o papel legado (users.role).
    const ministry = await tx.readMinistry(HAJALUZ_ID);
    if (!ministry) return;
    const user = await tx.readUser(uid);
    const membership = await tx.readMembership(HAJALUZ_ID, uid);
    const request = await tx.readRequest(HAJALUZ_ID, uid);
    const now = deps.now();

    if (role === 'viewer') {
      if (membership) tx.write({ op: 'delete', path: paths.member(HAJALUZ_ID, uid) });
      return; // o pedido pendente fica
    }

    const memberRole: MembershipRole = role === 'admin' ? 'admin' : 'member';
    if (membership) {
      tx.write({
        op: 'merge',
        path: paths.member(HAJALUZ_ID, uid),
        data: { role: memberRole, updatedAt: now, updatedBy: callerUid },
      });
    } else {
      tx.write({
        op: 'create',
        path: paths.member(HAJALUZ_ID, uid),
        data: {
          uid,
          role: memberRole,
          displayName: user?.displayName ?? null,
          email: user?.email ?? null,
          photoURL: user?.photoURL ?? null,
          joinedAt: now,
          updatedAt: now,
          updatedBy: callerUid,
        },
      });
    }
    if (request) tx.write({ op: 'delete', path: paths.request(HAJALUZ_ID, uid) });
  });
}
