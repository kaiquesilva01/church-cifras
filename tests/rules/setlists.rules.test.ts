import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-church-cifras',
    firestore: {
      rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

const seed = {
  date: '2026-11-22',
  label: 'Domingo',
  items: [],
  expiresAt: Timestamp.fromDate(new Date('2026-12-23T03:00:00Z')),
  createdBy: 'm1',
  createdAt: Timestamp.fromDate(new Date('2026-11-16T00:00:00Z')),
  updatedBy: 'm1',
  updatedAt: Timestamp.fromDate(new Date('2026-11-16T00:00:00Z')),
};

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'setlists/existing'), seed);
  });
});

afterAll(async () => {
  await env.cleanup();
});

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

const asRole = (uid: string, role: string): Db =>
  env.authenticatedContext(uid, { role }).firestore();
const memberDb = (): Db => asRole('m1', 'member');
// Quem escreve repertório é só admin; usa o uid 'm1' porque os dados de teste têm createdBy 'm1'.
const editorDb = (): Db => asRole('m1', 'admin');
const viewerDb = (): Db => asRole('v1', 'viewer');
const adminDb = (): Db => asRole('a1', 'admin');
const anonDb = (): Db => env.unauthenticatedContext().firestore();

const setlistData = (over: Record<string, unknown> = {}) => ({
  date: '2026-11-22',
  label: 'Domingo',
  items: [],
  expiresAt: Timestamp.fromDate(new Date('2026-12-23T03:00:00Z')),
  createdBy: 'm1',
  createdAt: serverTimestamp(),
  updatedBy: 'm1',
  updatedAt: serverTimestamp(),
  ...over,
});

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ songId: `s${i}`, key: 'G' }));

const updateData = (over: Record<string, unknown> = {}) => ({
  items: [{ songId: 's1', key: 'C' }],
  label: 'Noite',
  date: '2026-11-29',
  expiresAt: Timestamp.fromDate(new Date('2026-12-30T03:00:00Z')),
  updatedBy: 'm1',
  updatedAt: serverTimestamp(),
  ...over,
});

const existing = (db: Db) => doc(db, 'setlists/existing');

describe('setlists rules', () => {
  describe('read', () => {
    it.each([
      ['member', memberDb],
      ['admin', adminDb],
    ])('allows %s', async (_name, get) => {
      await assertSucceeds(getDoc(existing(get())));
    });

    it('denies viewer', async () => {
      await assertFails(getDoc(existing(viewerDb())));
    });

    it('denies anonymous', async () => {
      await assertFails(getDoc(existing(anonDb())));
    });
  });

  describe('create', () => {
    it('allows admin writing as the creator', async () => {
      await assertSucceeds(setDoc(doc(editorDb(), 'setlists/n1'), setlistData()));
    });
    it('denies member', async () => {
      await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), setlistData()));
    });
    it('allows admin', async () => {
      await assertSucceeds(
        setDoc(doc(adminDb(), 'setlists/n1'), setlistData({ createdBy: 'a1', updatedBy: 'a1' })),
      );
    });
    it('denies viewer', async () => {
      await assertFails(
        setDoc(doc(viewerDb(), 'setlists/n1'), setlistData({ createdBy: 'v1', updatedBy: 'v1' })),
      );
    });
    it('denies anonymous', async () => {
      await assertFails(setDoc(doc(anonDb(), 'setlists/n1'), setlistData()));
    });
    it('allows empty items', async () => {
      await assertSucceeds(setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ items: [] })));
    });
    it('allows 40 items', async () => {
      await assertSucceeds(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ items: items(40) })),
      );
    });
    it('denies 41 items', async () => {
      await assertFails(setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ items: items(41) })));
    });
    it('denies empty label', async () => {
      await assertFails(setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ label: '' })));
    });
    it('allows 60-char label', async () => {
      await assertSucceeds(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ label: 'a'.repeat(60) })),
      );
    });
    it('denies 61-char label', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ label: 'a'.repeat(61) })),
      );
    });
    it('denies malformed date', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ date: '22/11/2026' })),
      );
    });
    it('denies extra key', async () => {
      await assertFails(setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ extra: 1 })));
    });
    it('denies missing key', async () => {
      const rest: Record<string, unknown> = setlistData();
      delete rest.label;
      await assertFails(setDoc(doc(editorDb(), 'setlists/n1'), rest));
    });
    it('denies string expiresAt', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ expiresAt: '2026-12-23' })),
      );
    });
    it('denies createdBy of another uid', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ createdBy: 'other' })),
      );
    });
    it('denies updatedBy of another uid', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ updatedBy: 'other' })),
      );
    });
    it('denies client-supplied createdAt', async () => {
      await assertFails(
        setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ createdAt: Timestamp.now() })),
      );
    });
    it('denies 101-char id', async () => {
      await assertFails(setDoc(doc(editorDb(), `setlists/${'x'.repeat(101)}`), setlistData()));
    });
  });

  describe('update', () => {
    it('allows admin changing items, label, date and expiresAt', async () => {
      await assertSucceeds(updateDoc(existing(editorDb()), updateData()));
    });
    it('denies member', async () => {
      await assertFails(updateDoc(existing(memberDb()), updateData()));
    });
    it('denies viewer', async () => {
      await assertFails(updateDoc(existing(viewerDb()), updateData({ updatedBy: 'v1' })));
    });
    it('denies changing createdBy', async () => {
      await assertFails(updateDoc(existing(editorDb()), updateData({ createdBy: 'other' })));
    });
    it('denies changing createdAt', async () => {
      await assertFails(
        updateDoc(existing(editorDb()), updateData({ createdAt: serverTimestamp() })),
      );
    });
    it('denies updatedBy of another uid', async () => {
      await assertFails(updateDoc(existing(editorDb()), updateData({ updatedBy: 'other' })));
    });
    it('denies client-supplied updatedAt', async () => {
      await assertFails(
        updateDoc(existing(editorDb()), updateData({ updatedAt: Timestamp.now() })),
      );
    });
    it('denies 41 items', async () => {
      await assertFails(updateDoc(existing(editorDb()), updateData({ items: items(41) })));
    });
  });

  describe('delete', () => {
    it('denies member', async () => {
      await assertFails(deleteDoc(existing(memberDb())));
    });
    it('allows admin', async () => {
      await assertSucceeds(deleteDoc(existing(adminDb())));
    });
    it('denies viewer', async () => {
      await assertFails(deleteDoc(existing(viewerDb())));
    });
  });
});

describe('setlists rules: rehearsalAt e origin', () => {
  // Culto em 2026-11-22 (domingo). Janela do ensaio: de 2026-11-15 00:00 até 2026-11-23 00:00 (Brasília = UTC-3).
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  it.each([
    ['sem os campos novos (repertório antigo)', {}],
    ['ensaio na quinta, 19:30 de Brasília', { rehearsalAt: at('2026-11-19T22:30:00Z') }],
    [
      'início da janela (7 dias antes, 00:00 de Brasília)',
      { rehearsalAt: at('2026-11-15T03:00:00Z') },
    ],
    ['último segundo do dia do culto', { rehearsalAt: at('2026-11-23T02:59:59Z') }],
    ['origem produção', { origin: 'producao' }],
    ['origem teste', { origin: 'teste' }],
  ])('allows admin with %s', async (_name, over) => {
    await assertSucceeds(setDoc(doc(editorDb(), 'setlists/n1'), setlistData(over)));
  });

  it.each([
    ['um segundo antes da janela', { rehearsalAt: at('2026-11-15T02:59:59Z') }],
    ['00:00 do dia seguinte ao culto (exclusivo)', { rehearsalAt: at('2026-11-23T03:00:00Z') }],
    ['texto em vez de timestamp', { rehearsalAt: '2026-11-19T22:30:00Z' }],
    ['rehearsalAt nulo', { rehearsalAt: null }],
    ['origem fora da lista', { origin: 'outro' }],
    ['origem nula', { origin: null }],
  ])('denies admin with %s', async (_name, over) => {
    await assertFails(setDoc(doc(editorDb(), 'setlists/n1'), setlistData(over)));
  });

  it('denies viewer even with valid new fields', async () => {
    await assertFails(
      setDoc(
        doc(viewerDb(), 'setlists/n1'),
        setlistData({
          createdBy: 'v1',
          updatedBy: 'v1',
          rehearsalAt: at('2026-11-19T22:30:00Z'),
          origin: 'teste',
        }),
      ),
    );
  });

  it('allows update adding rehearsalAt and origin (culto de updateData é 2026-11-29)', async () => {
    await assertSucceeds(
      updateDoc(
        existing(editorDb()),
        updateData({ rehearsalAt: at('2026-11-26T22:30:00Z'), origin: 'producao' }),
      ),
    );
  });

  it('allows update of a legacy setlist without the new fields', async () => {
    await assertSucceeds(updateDoc(existing(editorDb()), updateData()));
  });

  it.each([
    ['origem fora da lista', { origin: 'outro' }],
    ['origem nula', { origin: null }],
  ])('denies update with %s', async (_name, over) => {
    await assertFails(updateDoc(existing(editorDb()), updateData(over)));
  });

  it('denies update with rehearsalAt outside the window of the new date', async () => {
    await assertFails(
      updateDoc(existing(editorDb()), updateData({ rehearsalAt: at('2026-11-22T02:59:59Z') })),
    );
  });

  it('allows clearing rehearsalAt with deleteField() in an update', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'setlists/comEnsaio'),
        setlistData({
          rehearsalAt: at('2026-11-19T22:30:00Z'),
          createdAt: at('2026-11-16T00:00:00Z'),
        }),
      );
    });
    await assertSucceeds(
      updateDoc(doc(editorDb(), 'setlists/comEnsaio'), updateData({ rehearsalAt: deleteField() })),
    );
  });

  it('allows clearing rehearsalAt by omitting it in a full overwrite', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), 'setlists/comEnsaio'),
        setlistData({
          rehearsalAt: at('2026-11-19T22:30:00Z'),
          createdAt: at('2026-11-16T00:00:00Z'),
        }),
      );
    });
    await assertSucceeds(
      setDoc(
        doc(editorDb(), 'setlists/comEnsaio'),
        setlistData({ createdAt: at('2026-11-16T00:00:00Z') }),
      ),
    );
  });
});

describe('setlists rules: janela do ensaio em bordas de mês e de ano', () => {
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  it.each([
    [
      'date 2026-03-07: início da janela (2026-02-28 00:00 de Brasília)',
      '2026-03-07',
      '2026-02-28T03:00:00Z',
    ],
    ['date 2026-01-02: início da janela no ano anterior', '2026-01-02', '2025-12-26T03:00:00Z'],
    ['date 2026-12-31: último segundo do dia do culto', '2026-12-31', '2027-01-01T02:59:59Z'],
  ])('allows admin with %s', async (_name, date, rehearsal) => {
    await assertSucceeds(
      setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ date, rehearsalAt: at(rehearsal) })),
    );
  });

  it.each([
    ['date 2026-03-07: um segundo antes do início', '2026-03-07', '2026-02-28T02:59:59Z'],
    [
      'date 2026-01-02: um segundo antes do início no ano anterior',
      '2026-01-02',
      '2025-12-26T02:59:59Z',
    ],
    [
      'date 2026-12-31: 00:00 de 2027-01-01 de Brasília (exclusivo)',
      '2026-12-31',
      '2027-01-01T03:00:00Z',
    ],
  ])('denies admin with %s', async (_name, date, rehearsal) => {
    await assertFails(
      setDoc(doc(editorDb(), 'setlists/n1'), setlistData({ date, rehearsalAt: at(rehearsal) })),
    );
  });
});
