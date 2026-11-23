import type { MembershipRole } from './deps';
import { HAJALUZ_CITY, HAJALUZ_ID, HAJALUZ_NAME } from './model';

// Migração idempotente da Haja Luz (spec §4.6, passo 1). Lógica pura: as escritas e leituras
// do Firestore/Auth chegam por `MigrationDeps`; o CLI (tarefa 11) faz a ligação real.

export type MigrationUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: unknown;
};

export interface MigrationDeps {
  now(): Date;
  listUsers(): Promise<MigrationUser[]>;
  ministryExists(id: string): Promise<boolean>;
  createMinistry(id: string, data: Record<string, unknown>): Promise<boolean>; // false se já existe
  memberUids(ministryId: string): Promise<Set<string>>;
  requestUids(ministryId: string): Promise<Set<string>>;
  createMembership(
    ministryId: string,
    uid: string,
    data: Record<string, unknown>,
  ): Promise<boolean>;
  createRequest(ministryId: string, uid: string, data: Record<string, unknown>): Promise<boolean>;
  listRootSetlists(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  targetSetlistIds(ministryId: string): Promise<Set<string>>;
  createTargetSetlist(
    ministryId: string,
    id: string,
    data: Record<string, unknown>,
  ): Promise<boolean>;
  deleteTargetSetlist(ministryId: string, id: string): Promise<void>;
  usageIdsWithoutMinistry(): Promise<string[]>;
  setUsageMinistry(setlistId: string, ministryId: string): Promise<void>;
  resolveUidByEmail(email: string): Promise<string>; // lança se não existir
  setAppAdmin(uid: string): Promise<void>;
  recalcClaims(uid: string): Promise<void>; // lança em falha
}

export type MigrationReport = {
  dryRun: boolean;
  ministryCreated: boolean;
  members: { created: number; kept: number; skippedNoRole: string[] };
  requests: { created: number; kept: number };
  setlists: { copied: number; kept: number; removedOrphans: number };
  usage: { updated: number };
  appAdmin: string | null; // uid
  claims: { ok: number; failed: string[] };
};

const MIGRATION_BY = 'migration';

export async function migrateMinistries(
  deps: MigrationDeps,
  options: { dryRun: boolean; appAdminEmail?: string },
): Promise<MigrationReport> {
  const { dryRun } = options;
  const now = deps.now();

  // (1) Resolve o admin da app antes de qualquer escrita: falha aborta sem escrever.
  const appAdmin = options.appAdminEmail
    ? await deps.resolveUidByEmail(options.appAdminEmail)
    : null;
  const users = await deps.listUsers();

  // (2) Ministério Haja Luz, se ainda não existe.
  const ministryCreated = !(await deps.ministryExists(HAJALUZ_ID))
    ? dryRun || (await deps.createMinistry(HAJALUZ_ID, ministryDoc(now)))
    : false;

  // (3) Membros e pedidos: quem já existe fica como está.
  const memberUids = await deps.memberUids(HAJALUZ_ID);
  const requestUids = await deps.requestUids(HAJALUZ_ID);
  const members = { created: 0, kept: 0, skippedNoRole: [] as string[] };
  const requests = { created: 0, kept: 0 };

  for (const user of users) {
    if (isMembershipRole(user.role)) {
      if (memberUids.has(user.uid)) {
        members.kept++;
      } else if (
        dryRun ||
        (await deps.createMembership(HAJALUZ_ID, user.uid, membershipDoc(user, user.role, now)))
      ) {
        members.created++;
      } else {
        members.kept++;
      }
    } else if (user.role === 'viewer') {
      if (memberUids.has(user.uid)) continue;
      if (requestUids.has(user.uid)) {
        requests.kept++;
      } else if (
        dryRun ||
        (await deps.createRequest(HAJALUZ_ID, user.uid, requestDoc(user, now)))
      ) {
        requests.created++;
      } else {
        requests.kept++;
      }
    } else {
      members.skippedNoRole.push(user.uid);
    }
  }

  // (4) Setlists: copia as que faltam (sem sobrescrever) e apaga destinos sem raiz.
  const roots = await deps.listRootSetlists();
  const targetIds = await deps.targetSetlistIds(HAJALUZ_ID);
  const rootIds = new Set(roots.map((root) => root.id));
  const setlists = { copied: 0, kept: 0, removedOrphans: 0 };

  for (const root of roots) {
    if (targetIds.has(root.id)) {
      setlists.kept++;
    } else if (dryRun || (await deps.createTargetSetlist(HAJALUZ_ID, root.id, root.data))) {
      setlists.copied++;
    } else {
      setlists.kept++;
    }
  }
  for (const id of targetIds) {
    if (rootIds.has(id)) continue;
    if (!dryRun) await deps.deleteTargetSetlist(HAJALUZ_ID, id);
    setlists.removedOrphans++;
  }

  // (5) Uso de repertório sem ministryId recebe a Haja Luz.
  const usageIds = await deps.usageIdsWithoutMinistry();
  if (!dryRun) {
    for (const id of usageIds) await deps.setUsageMinistry(id, HAJALUZ_ID);
  }
  const usage = { updated: usageIds.length };

  // (6) Admin da app: só o uid resolvido recebe a marca.
  if (appAdmin && !dryRun) await deps.setAppAdmin(appAdmin);

  // (7) Recalcula claims de todos; a falha de um não interrompe os demais.
  // No dry-run, `ok` conta os usuários que seriam recalculados.
  const claims = { ok: 0, failed: [] as string[] };
  for (const user of users) {
    if (dryRun) {
      claims.ok++;
      continue;
    }
    try {
      await deps.recalcClaims(user.uid);
      claims.ok++;
    } catch {
      claims.failed.push(user.uid);
    }
  }

  return {
    dryRun,
    ministryCreated,
    members,
    requests,
    setlists,
    usage,
    appAdmin,
    claims,
  };
}

function isMembershipRole(role: unknown): role is MembershipRole {
  return role === 'member' || role === 'admin';
}

function ministryDoc(now: Date): Record<string, unknown> {
  return {
    name: HAJALUZ_NAME,
    nameNormalized: 'haja luz',
    city: HAJALUZ_CITY,
    createdBy: MIGRATION_BY,
    createdAt: now,
    updatedAt: now,
  };
}

function membershipDoc(
  user: MigrationUser,
  role: MembershipRole,
  now: Date,
): Record<string, unknown> {
  return {
    uid: user.uid,
    role,
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    joinedAt: now,
    updatedAt: now,
    updatedBy: MIGRATION_BY,
  };
}

function requestDoc(user: MigrationUser, now: Date): Record<string, unknown> {
  return {
    uid: user.uid,
    status: 'pending',
    displayName: user.displayName ?? null,
    email: user.email ?? null,
    photoURL: user.photoURL ?? null,
    createdAt: now,
    decidedBy: null,
    decidedAt: null,
  };
}
