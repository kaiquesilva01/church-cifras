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
      ['viewer', viewerDb],
      ['member', memberDb],
      ['admin', adminDb],
    ])('allows %s', async (_name, get) => {
      await assertSucceeds(getDoc(existing(get())));
    });

    it('denies anonymous', async () => {
      await assertFails(getDoc(existing(anonDb())));
    });
  });

  describe('create', () => {
    it('allows member', async () => {
      await assertSucceeds(setDoc(doc(memberDb(), 'setlists/n1'), setlistData()));
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
      await assertSucceeds(setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ items: [] })));
    });
    it('allows 40 items', async () => {
      await assertSucceeds(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ items: items(40) })),
      );
    });
    it('denies 41 items', async () => {
      await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ items: items(41) })));
    });
    it('denies empty label', async () => {
      await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ label: '' })));
    });
    it('allows 60-char label', async () => {
      await assertSucceeds(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ label: 'a'.repeat(60) })),
      );
    });
    it('denies 61-char label', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ label: 'a'.repeat(61) })),
      );
    });
    it('denies malformed date', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ date: '22/11/2026' })),
      );
    });
    it('denies extra key', async () => {
      await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ extra: 1 })));
    });
    it('denies missing key', async () => {
      const rest: Record<string, unknown> = setlistData();
      delete rest.label;
      await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), rest));
    });
    it('denies string expiresAt', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ expiresAt: '2026-12-23' })),
      );
    });
    it('denies createdBy of another uid', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ createdBy: 'other' })),
      );
    });
    it('denies updatedBy of another uid', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ updatedBy: 'other' })),
      );
    });
    it('denies client-supplied createdAt', async () => {
      await assertFails(
        setDoc(doc(memberDb(), 'setlists/n1'), setlistData({ createdAt: Timestamp.now() })),
      );
    });
    it('denies 101-char id', async () => {
      await assertFails(setDoc(doc(memberDb(), `setlists/${'x'.repeat(101)}`), setlistData()));
    });
  });

  describe('update', () => {
    it('allows member changing items, label, date and expiresAt', async () => {
      await assertSucceeds(updateDoc(existing(memberDb()), updateData()));
    });
    it('denies viewer', async () => {
      await assertFails(updateDoc(existing(viewerDb()), updateData({ updatedBy: 'v1' })));
    });
    it('denies changing createdBy', async () => {
      await assertFails(updateDoc(existing(memberDb()), updateData({ createdBy: 'other' })));
    });
    it('denies changing createdAt', async () => {
      await assertFails(
        updateDoc(existing(memberDb()), updateData({ createdAt: serverTimestamp() })),
      );
    });
    it('denies updatedBy of another uid', async () => {
      await assertFails(updateDoc(existing(memberDb()), updateData({ updatedBy: 'other' })));
    });
    it('denies client-supplied updatedAt', async () => {
      await assertFails(updateDoc(existing(memberDb()), updateData({ updatedAt: Timestamp.now() })));
    });
    it('denies 41 items', async () => {
      await assertFails(updateDoc(existing(memberDb()), updateData({ items: items(41) })));
    });
  });

  describe('delete', () => {
    it('allows member', async () => {
      await assertSucceeds(deleteDoc(existing(memberDb())));
    });
    it('allows admin', async () => {
      await assertSucceeds(deleteDoc(existing(adminDb())));
    });
    it('denies viewer', async () => {
      await assertFails(deleteDoc(existing(viewerDb())));
    });
  });
});
