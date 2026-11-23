// Testes de integração dos adapters do firebase-admin (ministérios) contra o emulador do Firestore.
// Usa só dados sintéticos. Não usa o Auth: o recálculo de claims da migração é substituído por um stub.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type CollectionReference, type Firestore } from 'firebase-admin/firestore';
import { createMinistryDeps } from '../../apps/functions/src/ministries/adminDeps';
import { realMigrationDeps } from '../../apps/functions/src/ministries/migrateCli';
import {
  migrateMinistries,
  type MigrationDeps,
} from '../../apps/functions/src/ministries/migration';

const PROJECT_ID = 'demo-church-cifras';

let db: Firestore;

// Só o emulador: sem FIRESTORE_EMULATOR_HOST o Admin SDK usaria o projeto real via ADC.
function emulatorHost(): string {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) {
    throw new Error('FIRESTORE_EMULATOR_HOST não definido: rode com npm run test:rules.');
  }
  return host;
}

// Mesmo endpoint que env.clearFirestore() usa nos outros testes de rules.
async function clearEmulator(): Promise<void> {
  const url = `http://${emulatorHost()}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`falha ao limpar o emulador: HTTP ${res.status}`);
}

// Lista todos os documentos, inclusive subcoleções, como caminho -> dados.
async function snapshotAll(): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const walk = async (col: CollectionReference): Promise<void> => {
    for (const doc of (await col.get()).docs) {
      out.set(doc.ref.path, doc.data());
      for (const sub of await doc.ref.listCollections()) await walk(sub);
    }
  };
  for (const col of await db.listCollections()) await walk(col);
  return out;
}

async function seed(entries: Record<string, Record<string, unknown>>): Promise<void> {
  for (const [path, data] of Object.entries(entries)) {
    await db.doc(path).set(data);
  }
}

// Stub de recalcClaims: a migração chama o Auth, que não existe neste emulador.
function migrationDepsWithoutAuth(recalced: string[]): MigrationDeps {
  return {
    ...realMigrationDeps(db),
    recalcClaims: async (uid: string) => {
      recalced.push(uid);
    },
  };
}

beforeAll(async () => {
  emulatorHost();
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
});

beforeEach(async () => {
  await clearEmulator();
});

afterAll(async () => {
  await clearEmulator();
});

describe('createMinistryDeps.runTransaction', () => {
  it('rejeita create em documento existente com ALREADY_EXISTS e não grava o resto da transação', async () => {
    await seed({
      'ministries/hajaluz/members/u1': { uid: 'u1', role: 'admin' },
    });
    const deps = createMinistryDeps();

    const attempt = deps.runTransaction(async (tx) => {
      tx.write({
        op: 'set',
        path: 'ministries/hajaluz/members/u2',
        data: { uid: 'u2', role: 'member' },
      });
      tx.write({
        op: 'create',
        path: 'ministries/hajaluz/members/u1',
        data: { uid: 'u1', role: 'member' },
      });
    });

    await expect(attempt).rejects.toMatchObject({ code: 6 });
    expect(
      (await db.doc('ministries/hajaluz/members/u2').get()).exists,
      'o set da mesma transação não pode ter sido gravado',
    ).toBe(false);
    expect((await db.doc('ministries/hajaluz/members/u1').get()).get('role')).toBe('admin');
  });
});

describe('createMinistryDeps: consultas por usuário', () => {
  beforeEach(async () => {
    await seed({
      'ministries/hajaluz/members/u1': { uid: 'u1', role: 'admin' },
      'ministries/outra/members/u1': { uid: 'u1', role: 'member' },
      'ministries/hajaluz/members/u2': { uid: 'u2', role: 'member' },
      'ministries/hajaluz/requests/u1': { uid: 'u1', status: 'pending' },
      'ministries/outra/requests/u1': { uid: 'u1', status: 'pending' },
      'ministries/terceira/requests/u1': { uid: 'u1', status: 'rejected' },
      'ministries/hajaluz/requests/u2': { uid: 'u2', status: 'pending' },
    });
  });

  it('listMembershipsOfUser devolve os vínculos de duas comunidades só do uid pedido', async () => {
    const memberships = await createMinistryDeps().listMembershipsOfUser('u1');
    const sorted = [...memberships].sort((a, b) => a.ministryId.localeCompare(b.ministryId));
    expect(sorted).toEqual([
      { ministryId: 'hajaluz', role: 'admin' },
      { ministryId: 'outra', role: 'member' },
    ]);
  });

  it('listPendingRequestsOfUser devolve só os pedidos com status pending do uid', async () => {
    const pending = await createMinistryDeps().listPendingRequestsOfUser('u1');
    const ids = pending.map((p) => p.ministryId).sort();
    expect(ids).toEqual(['hajaluz', 'outra']);
  });
});

describe('createMinistryDeps.runTransaction: listAdminUids transacional', () => {
  it('listAdminUids dentro da transação devolve só os admins do ministério', async () => {
    await seed({
      'ministries/hajaluz/members/a1': { uid: 'a1', role: 'admin' },
      'ministries/hajaluz/members/a2': { uid: 'a2', role: 'admin' },
      'ministries/hajaluz/members/m1': { uid: 'm1', role: 'member' },
      'ministries/outra/members/a3': { uid: 'a3', role: 'admin' },
    });

    const admins = await createMinistryDeps().runTransaction(async (tx) =>
      tx.listAdminUids('hajaluz'),
    );

    expect([...admins].sort()).toEqual(['a1', 'a2']);
  });
});

describe('migração da Haja Luz com realMigrationDeps (emulador)', () => {
  const seedMigrationData = () =>
    seed({
      'users/u-member': {
        role: 'member',
        displayName: 'Membro Sintético',
        email: 'membro@example.test',
        photoURL: null,
      },
      'users/u-admin': {
        role: 'admin',
        displayName: 'Admin Sintético',
        email: 'admin@example.test',
        photoURL: null,
      },
      'users/u-viewer': {
        role: 'viewer',
        displayName: 'Visitante Sintético',
        email: 'visitante@example.test',
        photoURL: null,
      },
      'setlists/s1': { date: '2026-11-22', label: 'Domingo 1', items: [{ songId: 'x1' }] },
      'setlists/s2': { date: '2026-11-29', label: 'Domingo 2', items: [] },
      'setlistUsage/s1': { date: '2026-11-22', songIds: ['x1'] },
      'setlistUsage/s2': { date: '2026-11-29', songIds: [], ministryId: 'outro' },
    });

  it('dry-run não grava nada', async () => {
    await seedMigrationData();
    const before = await snapshotAll();
    const recalced: string[] = [];

    const report = await migrateMinistries(migrationDepsWithoutAuth(recalced), { dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(await snapshotAll()).toEqual(before);
    expect(recalced).toEqual([]);
    expect((await db.collection('ministries').get()).empty).toBe(true);
  });

  it('gravação real cria o ministério, vínculos, pedidos, repertórios e marca o uso', async () => {
    await seedMigrationData();
    const recalced: string[] = [];

    const report = await migrateMinistries(migrationDepsWithoutAuth(recalced), { dryRun: false });

    const ministry = await db.doc('ministries/hajaluz').get();
    expect(ministry.get('name')).toBe('Haja Luz');
    expect(ministry.get('city')).toBe('São Paulo');

    expect((await db.doc('ministries/hajaluz/members/u-member').get()).get('role')).toBe('member');
    expect((await db.doc('ministries/hajaluz/members/u-admin').get()).get('role')).toBe('admin');
    expect((await db.doc('ministries/hajaluz/members/u-viewer').get()).exists).toBe(false);

    const request = await db.doc('ministries/hajaluz/requests/u-viewer').get();
    expect(request.get('status')).toBe('pending');

    const copied1 = await db.doc('ministries/hajaluz/setlists/s1').get();
    const copied2 = await db.doc('ministries/hajaluz/setlists/s2').get();
    expect(copied1.get('label')).toBe('Domingo 1');
    expect(copied1.get('items')).toEqual([{ songId: 'x1' }]);
    expect(copied2.get('label')).toBe('Domingo 2');

    expect((await db.doc('setlistUsage/s1').get()).get('ministryId')).toBe('hajaluz');
    expect((await db.doc('setlistUsage/s2').get()).get('ministryId')).toBe('outro');

    expect(report.ministryCreated).toBe(true);
    expect(report.members.created).toBe(2);
    expect(report.requests.created).toBe(1);
    expect(report.setlists.copied).toBe(2);
    expect(report.usage.updated).toBe(1);
    expect([...recalced].sort()).toEqual(['u-admin', 'u-member', 'u-viewer']);
  });

  it('nova execução não cria nada e preserva edição feita no espelho', async () => {
    await seedMigrationData();
    await migrateMinistries(migrationDepsWithoutAuth([]), { dryRun: false });
    await db.doc('ministries/hajaluz/setlists/s1').update({ label: 'Editado no espelho' });
    const before = await snapshotAll();

    const report = await migrateMinistries(migrationDepsWithoutAuth([]), { dryRun: false });

    expect(await snapshotAll()).toEqual(before);
    expect((await db.doc('ministries/hajaluz/setlists/s1').get()).get('label')).toBe(
      'Editado no espelho',
    );
    expect(report.ministryCreated).toBe(false);
    expect(report.members.created).toBe(0);
    expect(report.members.kept).toBe(2);
    expect(report.requests.created).toBe(0);
    expect(report.setlists.copied).toBe(0);
    expect(report.setlists.kept).toBe(2);
    expect(report.usage.updated).toBe(0);
  });
});
