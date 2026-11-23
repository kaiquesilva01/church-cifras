import { HttpsError } from 'firebase-functions/v2/https';
import { recalcClaims } from './claims';
import type { MinistryDeps, MinistryTx } from './deps';
import { paths, parseMembershipRole, readMinistryId, readUid, requireCaller } from './model';
import { assertCanManageMinistry } from './permissions';

const NOT_FOUND = 'Membro não encontrado.';

async function ensureNotLastAdmin(
  tx: MinistryTx,
  ministryId: string,
  acao: 'rebaixar' | 'remover',
): Promise<void> {
  const admins = await tx.listAdminUids(ministryId);
  if (admins.length <= 1) {
    throw new HttpsError(
      'failed-precondition',
      `Não é possível ${acao} o último admin do ministério.`,
    );
  }
}

export async function setMemberRole(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  const uid = readUid(data, 'uid');
  const role = parseMembershipRole((data as { role?: unknown }).role);
  const kind = await assertCanManageMinistry(deps, caller, ministryId);
  await deps.runTransaction(async (tx) => {
    const membership = await tx.readMembership(ministryId, uid);
    if (!membership) throw new HttpsError('not-found', NOT_FOUND);
    if (membership.role === role) return;
    if (kind === 'ministry-admin' && membership.role === 'admin' && role === 'member') {
      await ensureNotLastAdmin(tx, ministryId, 'rebaixar');
    }
    tx.write({
      op: 'merge',
      path: paths.member(ministryId, uid),
      data: { role, updatedAt: deps.now(), updatedBy: caller },
    });
  });
  await recalcClaims(deps, uid);
  return { ok: true };
}

export async function removeMember(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  const uid = readUid(data, 'uid');
  const kind = await assertCanManageMinistry(deps, caller, ministryId);
  await deps.runTransaction(async (tx) => {
    const membership = await tx.readMembership(ministryId, uid);
    if (!membership) {
      // Repetição de uma remoção já feita: ok, desde que a pessoa exista (o recálculo corrige as claims).
      if (!(await tx.readUser(uid))) throw new HttpsError('not-found', NOT_FOUND);
      return;
    }
    if (kind === 'ministry-admin' && membership.role === 'admin') {
      await ensureNotLastAdmin(tx, ministryId, 'remover');
    }
    tx.write({ op: 'delete', path: paths.member(ministryId, uid) });
  });
  await recalcClaims(deps, uid);
  return { ok: true };
}
