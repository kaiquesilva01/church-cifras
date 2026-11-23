import type { Role } from '../roles';
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

export const NOW = new Date('2026-11-23T12:00:00Z');

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function createFakeMinistryDeps(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map<string, Record<string, unknown>>(
    Object.entries(seed).map(([path, data]) => [path, { ...data }]),
  );
  const claimCalls: Array<[string, Claims]> = [];

  const toMembership = (d: Record<string, unknown>): MembershipRecord => ({
    uid: d.uid as string,
    role: d.role as MembershipRole,
    displayName: str(d.displayName),
    email: str(d.email),
    photoURL: str(d.photoURL),
  });
  const toRequest = (d: Record<string, unknown>): RequestRecord => ({
    uid: d.uid as string,
    status: d.status as RequestRecord['status'],
    displayName: str(d.displayName),
    email: str(d.email),
    photoURL: str(d.photoURL),
  });

  const reads: MinistryReads = {
    async readUser(uid): Promise<UserRecord | null> {
      const d = docs.get(paths.user(uid));
      if (!d) return null;
      return {
        role: d.role as Role | undefined,
        appAdmin: d.appAdmin === true,
        displayName: str(d.displayName),
        email: str(d.email),
        photoURL: str(d.photoURL),
      };
    },
    async readMinistry(id) {
      const d = docs.get(paths.ministry(id));
      return d ? { name: d.name as string, city: d.city as string } : null;
    },
    async readMembership(mid, uid) {
      const d = docs.get(paths.member(mid, uid));
      return d ? toMembership(d) : null;
    },
    async readRequest(mid, uid) {
      const d = docs.get(paths.request(mid, uid));
      return d ? toRequest(d) : null;
    },
    async listAdminUids(mid) {
      return [...docs.entries()]
        .filter(([path, d]) => path.startsWith(`ministries/${mid}/members/`) && d.role === 'admin')
        .map(([, d]) => d.uid as string);
    },
  };

  // Aplica a escrita na hora (o fake não tem commit). Os callers leem antes de escrever.
  function applyWrite(op: WriteOp): void {
    const current = docs.get(op.path);
    if (op.op === 'create') {
      if (current) throw new Error('ALREADY_EXISTS');
      docs.set(op.path, { ...op.data });
    } else if (op.op === 'set') {
      docs.set(op.path, { ...op.data });
    } else if (op.op === 'merge') {
      docs.set(op.path, { ...current, ...op.data });
    } else {
      docs.delete(op.path);
    }
  }

  const deps: MinistryDeps = {
    ...reads,
    now: () => NOW,
    async runTransaction<T>(fn: (tx: MinistryTx) => Promise<T>): Promise<T> {
      return fn({ ...reads, write: applyWrite });
    },
    async listMembershipsOfUser(uid) {
      return [...docs.entries()]
        .filter(([k, d]) => /^ministries\/[^/]+\/members\/[^/]+$/.test(k) && d.uid === uid)
        .map(([k, d]) => ({ ministryId: k.split('/')[1] ?? '', role: d.role as MembershipRole }));
    },
    async listPendingRequestsOfUser(uid) {
      return [...docs.entries()]
        .filter(
          ([k, d]) =>
            /^ministries\/[^/]+\/requests\/[^/]+$/.test(k) &&
            d.uid === uid &&
            d.status === 'pending',
        )
        .map(([k]) => ({ ministryId: k.split('/')[1] ?? '' }));
    },
    async setClaims(uid, claims) {
      claimCalls.push([uid, claims]);
    },
  };

  return { deps, docs, claimCalls };
}
