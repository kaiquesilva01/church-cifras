import { HttpsError } from 'firebase-functions/v2/https';
import { recalcClaims } from './claims';
import type { MinistryDeps } from './deps';
import {
  normalizeForSearch,
  paths,
  readMinistryId,
  readUid,
  requireCaller,
  slugify,
  validateMinistryFields,
} from './model';
import { assertAppAdmin } from './permissions';

export async function createMinistry(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ministryId: string }> {
  const caller = requireCaller(callerUid);
  await assertAppAdmin(deps, caller);
  const fields = validateMinistryFields(data);
  const id = slugify(fields.name);
  if (!id) throw new HttpsError('invalid-argument', 'O nome precisa ter letras ou números.');
  const now = deps.now();
  await deps.runTransaction(async (tx) => {
    if (await tx.readMinistry(id)) {
      throw new HttpsError('failed-precondition', 'Já existe um ministério com esse nome.');
    }
    tx.write({
      op: 'create',
      path: paths.ministry(id),
      data: {
        name: fields.name,
        nameNormalized: normalizeForSearch(fields.name),
        city: fields.city,
        createdBy: caller,
        createdAt: now,
        updatedAt: now,
      },
    });
  });
  return { ministryId: id };
}

export async function updateMinistry(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  await assertAppAdmin(deps, caller);
  const ministryId = readMinistryId(data);
  const fields = validateMinistryFields(data);
  await deps.runTransaction(async (tx) => {
    if (!(await tx.readMinistry(ministryId)))
      throw new HttpsError('not-found', 'Ministério não encontrado.');
    tx.write({
      op: 'merge',
      path: paths.ministry(ministryId),
      data: {
        name: fields.name,
        nameNormalized: normalizeForSearch(fields.name),
        city: fields.city,
        updatedAt: deps.now(),
      },
    });
  });
  return { ok: true };
}

export async function setAppAdmin(
  deps: MinistryDeps,
  callerUid: string | undefined,
  data: unknown,
): Promise<{ ok: true }> {
  const caller = requireCaller(callerUid);
  await assertAppAdmin(deps, caller);
  const uid = readUid(data, 'uid');
  const value = (data as { appAdmin?: unknown }).appAdmin;
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Informe se a pessoa é admin da app (sim ou não).');
  }
  if (uid === caller) {
    throw new HttpsError(
      'failed-precondition',
      'Você não pode alterar o próprio acesso de admin da app.',
    );
  }
  await deps.runTransaction(async (tx) => {
    if (!(await tx.readUser(uid))) throw new HttpsError('not-found', 'Usuário não encontrado.');
    tx.write({ op: 'merge', path: paths.user(uid), data: { appAdmin: value } });
  });
  await recalcClaims(deps, uid);
  return { ok: true };
}
