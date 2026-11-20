import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'setlistUsage/existing'), {
      date: '2026-11-20',
      songIds: ['s1'],
      countedAt: Timestamp.fromDate(new Date('2026-11-22T07:00:00Z')),
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

const asRole = (uid: string, role: string): Db =>
  env.authenticatedContext(uid, { role }).firestore();
const adminDb = (): Db => asRole('a1', 'admin');
const memberDb = (): Db => asRole('m1', 'member');
const viewerDb = (): Db => asRole('v1', 'viewer');
const anonDb = (): Db => env.unauthenticatedContext().firestore();

const contexts: Array<[string, () => Db]> = [
  ['admin', adminDb],
  ['member', memberDb],
  ['viewer', viewerDb],
  ['anonymous', anonDb],
];

const usageDoc = (db: Db) => doc(db, 'setlistUsage/existing');

// setlistUsage só é lido e gravado pelo Admin SDK: nenhum cliente pode acessá-lo.
describe('setlistUsage rules', () => {
  describe.each(contexts)('%s', (_name, db) => {
    it('denies read', async () => {
      await assertFails(getDoc(usageDoc(db())));
    });

    it('denies write', async () => {
      await assertFails(
        setDoc(usageDoc(db()), {
          date: '2026-11-21',
          songIds: [],
          countedAt: serverTimestamp(),
        }),
      );
    });

    it('denies delete', async () => {
      await assertFails(deleteDoc(usageDoc(db())));
    });
  });
});
