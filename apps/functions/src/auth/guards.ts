import { HttpsError } from 'firebase-functions/v2/https';

/** Leituras de documento que os guards usam. MinistryDeps já satisfaz este tipo. */
export type GuardDeps = {
  readUser(uid: string): Promise<{ appAdmin: boolean } | null>;
  listMembershipsOfUser(
    uid: string,
  ): Promise<Array<{ ministryId: string; role: 'member' | 'admin' }>>;
};

function signedIn(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
  return uid;
}

async function isAppAdmin(deps: GuardDeps, uid: string): Promise<boolean> {
  return (await deps.readUser(uid))?.appAdmin === true;
}

/** Só admin da app. Confere `users/{uid}.appAdmin`, nunca o token. */
export async function requireAppAdmin(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if (!(await isAppAdmin(deps, id))) {
    throw new HttpsError('permission-denied', 'Só o admin da app pode fazer isso.');
  }
}

/** Tem vínculo com pelo menos um ministério (hasMinistry). Admin da app sem vínculo fica de fora. */
export async function requireMinistryMember(
  deps: GuardDeps,
  uid: string | undefined,
): Promise<void> {
  const id = signedIn(uid);
  if ((await deps.listMembershipsOfUser(id)).length === 0) {
    throw new HttpsError('permission-denied', 'Só quem tem ministério pode fazer isso.');
  }
}

/** Pode subir cifra: admin de algum ministério ou admin da app (canUploadSong). */
export async function requireUploader(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if (await isAppAdmin(deps, id)) return;
  if ((await deps.listMembershipsOfUser(id)).some((m) => m.role === 'admin')) return;
  throw new HttpsError('permission-denied', 'Só admin pode subir cifra.');
}

/** Contribui com o catálogo sem ser admin: tem ministério ou é admin da app (Storage songs/ e tom gerado). */
export async function requireCatalogContributor(
  deps: GuardDeps,
  uid: string | undefined,
): Promise<void> {
  const id = signedIn(uid);
  if (await isAppAdmin(deps, id)) return;
  if ((await deps.listMembershipsOfUser(id)).length > 0) return;
  throw new HttpsError('permission-denied', 'Só quem tem ministério pode fazer isso.');
}
