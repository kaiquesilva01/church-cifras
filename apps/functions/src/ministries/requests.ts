import { HttpsError } from 'firebase-functions/v2/https';
import { recalcClaims } from './claims';
import type { MinistryDeps, MinistryTx } from './deps';
import { paths, readMinistryId, readUid, requireCaller } from './model';
import { assertCanManageMinistry } from './permissions';

export async function requestAccess(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ministryId: string; status: 'pending' }> {
  const uid = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  const user = await deps.readUser(uid);
  if (!user) throw new HttpsError('not-found', 'Usuário não encontrado.');
  if (!(await deps.readMinistry(ministryId)))
    throw new HttpsError('not-found', 'Ministério não encontrado.');
  const now = deps.now();
  await deps.runTransaction(async (tx) => {
    // Todas as leituras antes da primeira escrita (regra do Admin SDK; o fake reprova o contrário).
    if ((await tx.listMembershipsOfUser(uid)).length > 0) {
      throw new HttpsError('failed-precondition', 'Você já faz parte de um ministério.');
    }
    const pending = await tx.listPendingRequestsOfUser(uid);
    if (pending.some((p) => p.ministryId !== ministryId)) {
      throw new HttpsError(
        'failed-precondition',
        'Você já tem um pedido pendente em outro ministério.',
      );
    }
    const existing = await tx.readRequest(ministryId, uid);
    if (existing?.status === 'pending') return; // já pendente aqui: não grava de novo
    tx.write({
      op: 'set',
      path: paths.request(ministryId, uid),
      data: {
        uid,
        status: 'pending',
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdAt: now,
        decidedBy: null,
        decidedAt: null,
      },
    });
  });
  return { ministryId, status: 'pending' };
}

export async function cancelRequest(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const uid = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  await deps.runTransaction(async (tx) => {
    const request = await tx.readRequest(ministryId, uid);
    if (request?.status === 'pending')
      tx.write({ op: 'delete', path: paths.request(ministryId, uid) });
  });
  return { ok: true };
}

export async function approveRequest(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  const uid = readUid(data, 'uid');
  await assertCanManageMinistry(deps, caller, ministryId);
  await deps.runTransaction(async (tx: MinistryTx) => {
    const request = await tx.readRequest(ministryId, uid);
    const membership = await tx.readMembership(ministryId, uid);
    // Aprovação repetida (ex.: a recálculo de claims falhou depois do commit): já é membro, só recalcula.
    if (!request && membership) return;
    if (!request) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (request.status !== 'pending')
      throw new HttpsError('failed-precondition', 'Este pedido não está pendente.');
    const now = deps.now();
    tx.write({ op: 'delete', path: paths.request(ministryId, uid) });
    if (!membership) {
      tx.write({
        op: 'create',
        path: paths.member(ministryId, uid),
        data: {
          uid,
          role: 'member',
          displayName: request.displayName,
          email: request.email,
          photoURL: request.photoURL,
          joinedAt: now,
          updatedAt: now,
          updatedBy: caller,
        },
      });
    }
  });
  await recalcClaims(deps, uid);
  return { ok: true };
}

export async function rejectRequest(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  const ministryId = readMinistryId(data);
  const uid = readUid(data, 'uid');
  await assertCanManageMinistry(deps, caller, ministryId);
  await deps.runTransaction(async (tx) => {
    const request = await tx.readRequest(ministryId, uid);
    if (!request) throw new HttpsError('not-found', 'Pedido não encontrado.');
    if (request.status !== 'pending')
      throw new HttpsError('failed-precondition', 'Este pedido não está pendente.');
    tx.write({
      op: 'merge',
      path: paths.request(ministryId, uid),
      data: { status: 'rejected', decidedBy: caller, decidedAt: deps.now() },
    });
  });
  return { ok: true };
}
