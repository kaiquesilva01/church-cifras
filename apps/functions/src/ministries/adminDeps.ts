import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentData, type Transaction } from 'firebase-admin/firestore';
import { ROLES, type Role } from '../roles';
import type { Claims } from './claims';
import type {
  MembershipRecord,
  MembershipRole,
  MinistryDeps,
  MinistryReads,
  MinistryTx,
  RequestRecord,
  UserRecord,
  WriteOp,
} from './deps';
import { paths } from './model';

type Get = (path: string) => Promise<DocumentData | undefined>;

const roleOf = (value: unknown): Role | undefined => ROLES.find((r) => r === value);

export function toUser(d: DocumentData | undefined): UserRecord | null {
  if (!d) return null;
  return {
    role: roleOf(d.role),
    appAdmin: d.appAdmin === true,
    displayName: d.displayName ?? null,
    email: d.email ?? null,
    photoURL: d.photoURL ?? null,
  };
}

export function toMembership(d: DocumentData | undefined, uid: string): MembershipRecord | null {
  if (!d) return null;
  return {
    uid,
    role: d.role as MembershipRole,
    displayName: d.displayName ?? null,
    email: d.email ?? null,
    photoURL: d.photoURL ?? null,
  };
}

export function toRequest(d: DocumentData | undefined, uid: string): RequestRecord | null {
  if (!d) return null;
  return {
    uid,
    status: d.status as RequestRecord['status'],
    displayName: d.displayName ?? null,
    email: d.email ?? null,
    photoURL: d.photoURL ?? null,
  };
}

// Mesmas leituras para a transação e para a leitura solta; só muda o `get`.
function readersWith(
  get: Get,
  adminUids: (ministryId: string) => Promise<string[]>,
): MinistryReads {
  return {
    async readUser(uid) {
      return toUser(await get(paths.user(uid)));
    },
    async readMinistry(id) {
      const d = await get(paths.ministry(id));
      return d ? { name: d.name, city: d.city } : null;
    },
    async readMembership(mid, uid) {
      return toMembership(await get(paths.member(mid, uid)), uid);
    },
    async readRequest(mid, uid) {
      return toRequest(await get(paths.request(mid, uid)), uid);
    },
    listAdminUids: adminUids,
  };
}

// O write só é enfileirado: o Admin SDK grava tudo no commit, no fim do callback da transação.
// Por isso os callers leem tudo antes de escrever (no SDK real, ler depois de escrever falha).
function applyWrite(t: Transaction, op: WriteOp): void {
  const ref = getFirestore().doc(op.path);
  if (op.op === 'create') t.create(ref, op.data ?? {});
  else if (op.op === 'set') t.set(ref, op.data ?? {});
  else if (op.op === 'merge') t.set(ref, op.data ?? {}, { merge: true });
  else t.delete(ref);
}

export function createMinistryDeps(): MinistryDeps {
  const db = () => getFirestore();
  const outside = readersWith(
    async (path) => (await db().doc(path).get()).data(),
    async (mid) =>
      (
        await db().collection(`ministries/${mid}/members`).where('role', '==', 'admin').get()
      ).docs.map((d) => d.id),
  );

  return {
    ...outside,
    now: () => new Date(),
    async runTransaction<T>(fn: (tx: MinistryTx) => Promise<T>): Promise<T> {
      return db().runTransaction((t) => {
        const tx: MinistryTx = {
          ...readersWith(
            async (path) => (await t.get(db().doc(path))).data(),
            async (mid) =>
              (
                await t.get(
                  db().collection(`ministries/${mid}/members`).where('role', '==', 'admin'),
                )
              ).docs.map((d) => d.id),
          ),
          write: (op) => applyWrite(t, op),
        };
        return fn(tx);
      });
    },
    async listMembershipsOfUser(uid) {
      const snap = await db().collectionGroup('members').where('uid', '==', uid).get();
      return snap.docs.map((d) => ({
        ministryId: d.ref.parent.parent?.id ?? '',
        role: d.get('role') as MembershipRole,
      }));
    },
    async listPendingRequestsOfUser(uid) {
      const snap = await db()
        .collectionGroup('requests')
        .where('uid', '==', uid)
        .where('status', '==', 'pending')
        .get();
      return snap.docs.map((d) => ({ ministryId: d.ref.parent.parent?.id ?? '' }));
    },
    async setClaims(uid: string, claims: Claims) {
      await getAuth().setCustomUserClaims(uid, claims);
    },
  };
}
