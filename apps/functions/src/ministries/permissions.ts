import { HttpsError } from 'firebase-functions/v2/https';
import type { MinistryReads } from './deps';

export type ManagerKind = 'app-admin' | 'ministry-admin';

const DENIED = 'Só o admin do ministério ou da app pode fazer isso.';

export async function assertCanManageMinistry(
  deps: MinistryReads,
  callerUid: string,
  ministryId: string,
): Promise<ManagerKind> {
  const caller = await deps.readUser(callerUid);
  if (!caller) throw new HttpsError('permission-denied', DENIED);
  if (caller.appAdmin === true) return 'app-admin';
  const membership = await deps.readMembership(ministryId, callerUid);
  if (membership?.role === 'admin') return 'ministry-admin';
  throw new HttpsError('permission-denied', DENIED);
}

export async function assertAppAdmin(deps: MinistryReads, callerUid: string): Promise<void> {
  const caller = await deps.readUser(callerUid);
  if (caller?.appAdmin !== true) {
    throw new HttpsError('permission-denied', 'Só o admin da app pode fazer isso.');
  }
}
