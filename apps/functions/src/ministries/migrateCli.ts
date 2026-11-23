// Uso (na raiz do repo, ver docs/deploy.md):
//   npm run ministries:migrate -- [--dry-run] [--app-admin <e-mail>]
// Credenciais: Application Default Credentials (no Cloud Shell, a conta da pessoa).
// Com FIRESTORE_EMULATOR_HOST definido, fala com o emulador do Firestore.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { resolveProjectId } from '../cli/projectId';
import { describeTarget } from '../lyrics/backfillTarget';
import { createMinistryDeps, toUser } from './adminDeps';
import { recalcClaims } from './claims';
import { parseMigrateArgs } from './migrateArgs';
import { migrateMinistries, type MigrationDeps, type MigrationReport } from './migration';
import { HAJALUZ_ID, paths } from './model';

const ALREADY_EXISTS = 6; // código gRPC; o Admin SDK pode devolver número ou nome

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === ALREADY_EXISTS || code === 'ALREADY_EXISTS';
}

// Create-only: false se o documento já existe. Nunca sobrescreve.
async function createOnce(
  ref: { create(data: Record<string, unknown>): Promise<unknown> },
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    await ref.create(data);
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
}

async function idsOf(db: Firestore, path: string): Promise<Set<string>> {
  return new Set((await db.collection(path).get()).docs.map((d) => d.id));
}

export function realMigrationDeps(db: Firestore): MigrationDeps {
  const ministryDeps = createMinistryDeps();
  return {
    now: () => new Date(),
    listUsers: async () =>
      (await db.collection('users').get()).docs.map((d) => {
        const user = toUser(d.data());
        return {
          uid: d.id,
          email: user?.email ?? null,
          displayName: user?.displayName ?? null,
          photoURL: user?.photoURL ?? null,
          role: d.get('role'),
        };
      }),
    ministryExists: async (id) => (await db.doc(paths.ministry(id)).get()).exists,
    createMinistry: (id, data) => createOnce(db.doc(paths.ministry(id)), data),
    memberUids: (mid) => idsOf(db, `ministries/${mid}/members`),
    requestUids: (mid) => idsOf(db, `ministries/${mid}/requests`),
    createMembership: (mid, uid, data) => createOnce(db.doc(paths.member(mid, uid)), data),
    createRequest: (mid, uid, data) => createOnce(db.doc(paths.request(mid, uid)), data),
    listRootSetlists: async () =>
      (await db.collection('setlists').get()).docs.map((d) => ({ id: d.id, data: d.data() })),
    targetSetlistIds: (mid) => idsOf(db, `ministries/${mid}/setlists`),
    createTargetSetlist: (mid, id, data) =>
      createOnce(db.doc(`ministries/${mid}/setlists/${id}`), data),
    // Lê tudo e filtra aqui: `== null` no Firestore não acha campo ausente.
    usageIdsWithoutMinistry: async () =>
      (await db.collection('setlistUsage').get()).docs
        .filter((d) => d.get('ministryId') === undefined || d.get('ministryId') === null)
        .map((d) => d.id),
    setUsageMinistry: async (setlistId, ministryId) => {
      const ref = db.doc(`setlistUsage/${setlistId}`);
      // Transação: só escreve se o campo continua ausente (nunca sobrescreve).
      await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return;
        const current = snap.get('ministryId');
        if (current !== undefined && current !== null) return;
        t.update(ref, { ministryId });
      });
    },
    resolveUidByEmail: async (email) => {
      try {
        // Firebase Auth guarda o e-mail em minúsculas; o migrate já normaliza.
        return (await getAuth().getUserByEmail(email)).uid;
      } catch (error) {
        if ((error as { code?: unknown }).code === 'auth/user-not-found') {
          throw new Error(
            '--app-admin: nenhum usuário do Auth tem esse e-mail. Nada foi gravado.',
            {
              cause: error,
            },
          );
        }
        throw error;
      }
    },
    setAppAdmin: async (uid) => {
      await db.doc(paths.user(uid)).set({ appAdmin: true }, { merge: true });
    },
    recalcClaims: async (uid) => {
      try {
        await recalcClaims(ministryDeps, uid);
      } catch (error) {
        // O relatório guarda só uids: a causa vai aqui, no momento da falha.
        const message = error instanceof Error ? error.message : String(error);
        console.error(`falha ao recalcular claims de ${uid}: ${message}`);
        throw error;
      }
    },
  };
}

function printReport(report: MigrationReport): void {
  const pending = report.dryRun ? ' (a gravar)' : '';
  console.log(report.dryRun ? '\n[dry-run] nada foi gravado.' : '\nConcluído.');
  console.log(
    `ministério Haja Luz (${HAJALUZ_ID}): ${report.ministryCreated ? `criado${pending}` : 'já existia'}`,
  );
  console.log(
    `membros: criados${pending} ${report.members.created}, mantidos ${report.members.kept}`,
  );
  console.log(
    `sem papel válido (${report.members.skippedNoRole.length}): ${report.members.skippedNoRole.join(', ') || '-'}`,
  );
  console.log(
    `pedidos: criados${pending} ${report.requests.created}, mantidos ${report.requests.kept}`,
  );
  console.log(
    `repertórios no ministério: copiados${pending} ${report.setlists.copied}, mantidos ${report.setlists.kept}`,
  );
  console.log(`uso sem ministério atualizado${pending}: ${report.usage.updated}`);
  console.log(`admin da app (uid): ${report.appAdmin ?? '-'}`);
  console.log(
    `claims: ok ${report.claims.ok}, falhas (${report.claims.failed.length}): ${report.claims.failed.join(', ') || '-'}`,
  );
}

async function main(): Promise<void> {
  const { dryRun, appAdminEmail } = parseMigrateArgs(process.argv.slice(2));
  // O projeto vem do ADC; sem gcloud configurado (ex.: emulador) use GOOGLE_CLOUD_PROJECT.
  const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
  initializeApp({ projectId });
  const db = getFirestore();
  const target = describeTarget({
    projectId: await resolveProjectId(db),
    dryRun,
    env: process.env,
  });
  for (const line of target.lines) console.log(line);
  console.log('');
  if (!target.canProceed) {
    process.exitCode = 1;
    return;
  }
  const report = await migrateMinistries(realMigrationDeps(db), { dryRun, appAdminEmail });
  printReport(report);
  if (report.claims.failed.length > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
