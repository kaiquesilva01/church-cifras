import type { Role } from '../roles';
import type { Claims } from './claims';

export type MembershipRole = 'member' | 'admin';
export type MinistryRecord = { name: string; city: string };
export type MembershipRecord = {
  uid: string;
  role: MembershipRole;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};
export type RequestRecord = {
  uid: string;
  status: 'pending' | 'rejected';
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};
export type UserRecord = {
  role: Role | undefined;
  appAdmin: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
};
export type WriteOp = {
  op: 'create' | 'set' | 'merge' | 'delete';
  path: string;
  data?: Record<string, unknown>;
};

export interface MinistryReads {
  readUser(uid: string): Promise<UserRecord | null>;
  readMinistry(ministryId: string): Promise<MinistryRecord | null>;
  readMembership(ministryId: string, uid: string): Promise<MembershipRecord | null>;
  readRequest(ministryId: string, uid: string): Promise<RequestRecord | null>;
  listAdminUids(ministryId: string): Promise<string[]>;
}

export interface MinistryTx extends MinistryReads {
  write(op: WriteOp): void; // todas as leituras da transação vêm antes das escritas
  listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: MembershipRole }>>;
  listPendingRequestsOfUser(uid: string): Promise<Array<{ ministryId: string }>>;
}

export interface MinistryDeps extends MinistryReads {
  now(): Date;
  runTransaction<T>(fn: (tx: MinistryTx) => Promise<T>): Promise<T>;
  listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: MembershipRole }>>;
  listPendingRequestsOfUser(uid: string): Promise<Array<{ ministryId: string }>>;
  setClaims(uid: string, claims: Claims): Promise<void>;
}
