import { describe, expect, it } from 'vitest';
import { migrateMinistries, type MigrationDeps, type MigrationUser } from './migration';

const NOW = new Date('2026-11-23T12:00:00.000Z');
const HAJA_DOC = {
  name: 'Haja Luz',
  nameNormalized: 'haja luz',
  city: 'São Paulo',
  createdBy: 'migration',
  createdAt: NOW,
  updatedAt: NOW,
};

type FakeState = {
  users: MigrationUser[];
  ministries: Map<string, Record<string, unknown>>;
  members: Map<string, Record<string, unknown>>; // chave `${mid}/${uid}`
  requests: Map<string, Record<string, unknown>>; // chave `${mid}/${uid}`
  roots: Map<string, Record<string, unknown>>; // setlists raiz
  targets: Map<string, Record<string, unknown>>; // chave `${mid}/${id}`
  usage: Map<string, string | undefined>; // setlistId -> ministryId
  emails: Map<string, string>; // e-mail fictício -> uid
  appAdmins: string[];
  claimsRecalced: string[];
  failClaimsFor: Set<string>;
  writes: string[];
};

function emptyState(): FakeState {
  return {
    users: [],
    ministries: new Map(),
    members: new Map(),
    requests: new Map(),
    roots: new Map(),
    targets: new Map(),
    usage: new Map(),
    emails: new Map(),
    appAdmins: [],
    claimsRecalced: [],
    failClaimsFor: new Set(),
    writes: [],
  };
}

const user = (uid: string, role: unknown): MigrationUser => ({
  uid,
  email: `${uid}@example.test`,
  displayName: uid.toUpperCase(),
  photoURL: null,
  role,
});

const keysOf = (map: Map<string, unknown>, prefix: string) =>
  [...map.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => k.slice(prefix.length + 1));

function fakeDeps(s: FakeState): MigrationDeps {
  return {
    now: () => NOW,
    listUsers: async () => s.users,
    ministryExists: async (id) => s.ministries.has(id),
    createMinistry: async (id, data) => {
      s.writes.push(`createMinistry:${id}`);
      if (s.ministries.has(id)) return false;
      s.ministries.set(id, data);
      return true;
    },
    memberUids: async (mid) => new Set(keysOf(s.members, mid)),
    requestUids: async (mid) => new Set(keysOf(s.requests, mid)),
    createMembership: async (mid, uid, data) => {
      s.writes.push(`createMembership:${mid}/${uid}`);
      const k = `${mid}/${uid}`;
      if (s.members.has(k)) return false;
      s.members.set(k, data);
      return true;
    },
    createRequest: async (mid, uid, data) => {
      s.writes.push(`createRequest:${mid}/${uid}`);
      const k = `${mid}/${uid}`;
      if (s.requests.has(k)) return false;
      s.requests.set(k, data);
      return true;
    },
    listRootSetlists: async () => [...s.roots].map(([id, data]) => ({ id, data })),
    targetSetlistIds: async (mid) => new Set(keysOf(s.targets, mid)),
    createTargetSetlist: async (mid, id, data) => {
      s.writes.push(`createTargetSetlist:${mid}/${id}`);
      const k = `${mid}/${id}`;
      if (s.targets.has(k)) return false;
      s.targets.set(k, data);
      return true;
    },
    deleteTargetSetlist: async (mid, id) => {
      s.writes.push(`deleteTargetSetlist:${mid}/${id}`);
      s.targets.delete(`${mid}/${id}`);
    },
    usageIdsWithoutMinistry: async () => [...s.usage].filter(([, mid]) => !mid).map(([id]) => id),
    setUsageMinistry: async (id, mid) => {
      s.writes.push(`setUsageMinistry:${id}`);
      s.usage.set(id, mid);
    },
    resolveUidByEmail: async (email) => {
      const uid = s.emails.get(email);
      if (!uid) throw new Error('usuário não encontrado');
      return uid;
    },
    setAppAdmin: async (uid) => {
      s.writes.push(`setAppAdmin:${uid}`);
      s.appAdmins.push(uid);
    },
    recalcClaims: async (uid) => {
      s.writes.push(`recalcClaims:${uid}`);
      if (s.failClaimsFor.has(uid)) throw new Error('falha ao gravar claims');
      s.claimsRecalced.push(uid);
    },
  };
}

const REAL = { dryRun: false };

describe('migrateMinistries', () => {
  it('cria o ministério Haja Luz (real) e, no dry-run, não chama createMinistry', async () => {
    const real = emptyState();
    const realReport = await migrateMinistries(fakeDeps(real), REAL);
    expect(realReport.ministryCreated).toBe(true);
    expect(real.ministries.get('hajaluz')).toEqual(HAJA_DOC);

    const dry = emptyState();
    const dryReport = await migrateMinistries(fakeDeps(dry), { dryRun: true });
    expect(dryReport.ministryCreated).toBe(true);
    expect(dry.ministries.size).toBe(0);
    expect(dry.writes).toEqual([]);

    const existing = emptyState();
    existing.ministries.set('hajaluz', { name: 'Haja Luz' });
    const again = await migrateMinistries(fakeDeps(existing), REAL);
    expect(again.ministryCreated).toBe(false);
    expect(existing.writes.some((w) => w.startsWith('createMinistry'))).toBe(false);
  });

  it('mapeia member para membro, admin para admin, viewer para pedido pendente, sem role para skippedNoRole', async () => {
    const s = emptyState();
    s.users = [
      user('ana', 'member'),
      user('beto', 'admin'),
      user('caio', 'viewer'),
      user('dani', undefined),
      user('edu', 'superuser'),
    ];
    const report = await migrateMinistries(fakeDeps(s), REAL);

    expect(s.members.get('hajaluz/ana')).toEqual({
      uid: 'ana',
      role: 'member',
      displayName: 'ANA',
      email: 'ana@example.test',
      photoURL: null,
      joinedAt: NOW,
      updatedAt: NOW,
      updatedBy: 'migration',
    });
    expect(s.members.get('hajaluz/beto')?.role).toBe('admin');
    expect(s.members.has('hajaluz/caio')).toBe(false);
    expect(s.requests.get('hajaluz/caio')).toEqual({
      uid: 'caio',
      status: 'pending',
      displayName: 'CAIO',
      email: 'caio@example.test',
      photoURL: null,
      createdAt: NOW,
      decidedBy: null,
      decidedAt: null,
    });
    expect(report.members).toEqual({ created: 2, kept: 0, skippedNoRole: ['dani', 'edu'] });
    expect(report.requests).toEqual({ created: 1, kept: 0 });
    expect(s.members.has('hajaluz/dani')).toBe(false);
    expect(s.members.has('hajaluz/edu')).toBe(false);
  });

  it('não sobrescreve vínculo existente (kept)', async () => {
    const s = emptyState();
    s.ministries.set('hajaluz', HAJA_DOC);
    const original = { uid: 'ana', role: 'admin', updatedBy: 'alguem' };
    s.members.set('hajaluz/ana', original);
    s.requests.set('hajaluz/caio', { uid: 'caio', status: 'pending' });
    s.users = [user('ana', 'member'), user('caio', 'viewer')];

    const report = await migrateMinistries(fakeDeps(s), REAL);

    expect(s.members.get('hajaluz/ana')).toBe(original);
    expect(s.requests.get('hajaluz/caio')).toEqual({ uid: 'caio', status: 'pending' });
    expect(report.members).toEqual({ created: 0, kept: 1, skippedNoRole: [] });
    expect(report.requests).toEqual({ created: 0, kept: 1 });
    expect(s.writes.some((w) => w.startsWith('createMembership:hajaluz/ana'))).toBe(false);
    expect(s.writes.some((w) => w.startsWith('createRequest:hajaluz/caio'))).toBe(false);
  });

  it('copia setlists que faltam e preserva o destino existente (kept)', async () => {
    const s = emptyState();
    s.roots.set('s1', { title: 'Raiz 1', version: 1 });
    s.roots.set('s2', { title: 'Raiz 2', version: 1 });
    s.targets.set('hajaluz/s1', { title: 'Editada no espelho', version: 9 });

    const report = await migrateMinistries(fakeDeps(s), REAL);

    expect(s.targets.get('hajaluz/s1')).toEqual({ title: 'Editada no espelho', version: 9 });
    expect(s.targets.get('hajaluz/s2')).toEqual({ title: 'Raiz 2', version: 1 });
    expect(report.setlists).toEqual({ copied: 1, kept: 1 });
  });

  it('não apaga destino sem raiz, nem na execução real nem no dry-run', async () => {
    for (const dryRun of [false, true]) {
      const s = emptyState();
      s.roots.set('s1', { title: 'Raiz 1' });
      s.targets.set('hajaluz/s1', { title: 'Raiz 1' });
      s.targets.set('hajaluz/sem-raiz', { title: 'Só no espelho' });

      const report = await migrateMinistries(fakeDeps(s), { dryRun });

      expect(s.targets.get('hajaluz/sem-raiz')).toEqual({ title: 'Só no espelho' });
      expect(s.writes.some((w) => w.startsWith('deleteTargetSetlist'))).toBe(false);
      expect(report.setlists).toEqual({ copied: 0, kept: 1 });
    }
  });

  it('preenche ministryId só em setlistUsage sem ministryId', async () => {
    const s = emptyState();
    s.usage.set('u1', undefined);
    s.usage.set('u2', 'outro-ministerio');

    const report = await migrateMinistries(fakeDeps(s), REAL);

    expect(s.usage.get('u1')).toBe('hajaluz');
    expect(s.usage.get('u2')).toBe('outro-ministerio');
    expect(report.usage).toEqual({ updated: 1 });
    expect(s.writes).not.toContain('setUsageMinistry:u2');
  });

  it('e-mail do admin da app não encontrado: lança antes de qualquer escrita', async () => {
    const s = emptyState();
    s.users = [user('ana', 'member')];
    s.roots.set('s1', { title: 'Raiz' });

    await expect(
      migrateMinistries(fakeDeps(s), { dryRun: false, appAdminEmail: 'inexistente@example.test' }),
    ).rejects.toThrow();
    expect(s.writes).toEqual([]);
    expect(s.ministries.size).toBe(0);
  });

  it('--app-admin é case-insensitive: Dono@Example.test resolve o usuário dono@example.test', async () => {
    const s = emptyState();
    s.emails.set('dono@example.test', 'dono');
    s.users = [user('dono', 'member')];

    const report = await migrateMinistries(fakeDeps(s), {
      dryRun: false,
      appAdminEmail: '  Dono@Example.test ',
    });

    expect(report.appAdmin).toBe('dono');
    expect(s.appAdmins).toEqual(['dono']);
  });

  it('setAppAdmin roda antes de recalcClaims do admin da app', async () => {
    const s = emptyState();
    s.emails.set('dono@example.test', 'dono');
    s.users = [user('dono', 'member')];

    await migrateMinistries(fakeDeps(s), {
      dryRun: false,
      appAdminEmail: 'dono@example.test',
    });

    const marca = s.writes.indexOf('setAppAdmin:dono');
    const recalc = s.writes.indexOf('recalcClaims:dono');
    expect(marca).toBeGreaterThanOrEqual(0);
    expect(recalc).toBeGreaterThan(marca);
  });

  it('--app-admin marca só esse uid como appAdmin', async () => {
    const s = emptyState();
    s.emails.set('dono@example.test', 'dono');
    s.users = [user('dono', 'member'), user('outra', 'admin')];

    const report = await migrateMinistries(fakeDeps(s), {
      dryRun: false,
      appAdminEmail: 'dono@example.test',
    });

    expect(s.appAdmins).toEqual(['dono']);
    expect(report.appAdmin).toBe('dono');
    expect(s.writes.filter((w) => w.startsWith('setAppAdmin'))).toEqual(['setAppAdmin:dono']);
  });

  it('dry-run: nenhuma escrita, relatório completo', async () => {
    const s = emptyState();
    s.emails.set('dono@example.test', 'dono');
    s.users = [user('dono', 'member'), user('caio', 'viewer'), user('edu', 'x')];
    s.roots.set('s1', { title: 'Raiz' });
    s.targets.set('hajaluz/morta', { title: 'Órfã' });
    s.usage.set('u1', undefined);

    const report = await migrateMinistries(fakeDeps(s), {
      dryRun: true,
      appAdminEmail: 'dono@example.test',
    });

    expect(s.writes).toEqual([]);
    expect(s.ministries.size).toBe(0);
    expect(s.members.size).toBe(0);
    expect(s.requests.size).toBe(0);
    expect(s.targets.has('hajaluz/morta')).toBe(true);
    expect(s.usage.get('u1')).toBeUndefined();
    expect(s.appAdmins).toEqual([]);
    expect(s.claimsRecalced).toEqual([]);
    expect(report).toEqual({
      dryRun: true,
      ministryCreated: true,
      members: { created: 1, kept: 0, skippedNoRole: ['edu'] },
      requests: { created: 1, kept: 0 },
      setlists: { copied: 1, kept: 0 },
      usage: { updated: 1 },
      appAdmin: 'dono',
      claims: { ok: 3, failed: [] },
    });
  });

  it('falha de claims em um usuário é relatada e não interrompe', async () => {
    const s = emptyState();
    s.users = [user('ana', 'member'), user('beto', 'viewer'), user('caio', 'admin')];
    s.failClaimsFor.add('beto');

    const report = await migrateMinistries(fakeDeps(s), REAL);

    expect(report.claims).toEqual({ ok: 2, failed: ['beto'] });
    expect(s.claimsRecalced).toEqual(['ana', 'caio']);
  });

  it('segunda execução não cria nada (idempotente)', async () => {
    const s = emptyState();
    s.emails.set('dono@example.test', 'dono');
    s.users = [user('dono', 'member'), user('ana', 'admin'), user('caio', 'viewer')];
    s.roots.set('s1', { title: 'Raiz' });
    s.usage.set('u1', undefined);
    const options = { dryRun: false, appAdminEmail: 'dono@example.test' };

    await migrateMinistries(fakeDeps(s), options);
    const membersAfterFirst = new Map(s.members);
    const requestsAfterFirst = new Map(s.requests);
    const targetsAfterFirst = new Map(s.targets);
    const usageAfterFirst = new Map(s.usage);
    s.writes = [];

    const second = await migrateMinistries(fakeDeps(s), options);

    expect(second.ministryCreated).toBe(false);
    expect(second.members).toEqual({ created: 0, kept: 2, skippedNoRole: [] });
    expect(second.requests).toEqual({ created: 0, kept: 1 });
    expect(second.setlists).toEqual({ copied: 0, kept: 1 });
    expect(second.usage).toEqual({ updated: 0 });
    expect(s.members).toEqual(membersAfterFirst);
    expect(s.requests).toEqual(requestsAfterFirst);
    expect(s.targets).toEqual(targetsAfterFirst);
    expect(s.usage).toEqual(usageAfterFirst);
    expect(s.writes.filter((w) => w.startsWith('create') || w.startsWith('delete'))).toEqual([]);
  });
});
