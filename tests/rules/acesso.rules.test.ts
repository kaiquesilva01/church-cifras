import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/vis'), { role: 'viewer' });
    await setDoc(doc(db, 'songs/s1'), { title: 'Musica' });
    await setDoc(doc(db, 'songs/s1/arrangements/a1'), { key: 'G' });
    await setDoc(doc(db, 'songLyrics/s1'), { text: 'letra' });
    await setDoc(doc(db, 'artists/ar1'), { name: 'Artista' });
    await setDoc(doc(db, 'setlists/n1'), {
      date: '2026-11-22',
      label: 'Domingo',
      items: [],
      expiresAt: Timestamp.fromDate(new Date('2099-12-23T03:00:00Z')),
      createdBy: 'm1',
      createdAt: Timestamp.fromDate(new Date('2026-11-16T00:00:00Z')),
      updatedBy: 'm1',
      updatedAt: Timestamp.fromDate(new Date('2026-11-16T00:00:00Z')),
    });
  });
});

afterAll(async () => {
  await env.cleanup();
});

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

const ctx = {
  visitanteSemClaim: (): Db => env.authenticatedContext('vis').firestore(),
  visitanteViewer: (): Db => env.authenticatedContext('vis', { role: 'viewer' }).firestore(),
  membro: (): Db => env.authenticatedContext('m1', { role: 'member' }).firestore(),
  admin: (): Db => env.authenticatedContext('a1', { role: 'admin' }).firestore(),
  deslogado: (): Db => env.unauthenticatedContext().firestore(),
};

const leituras: [string, (db: Db) => Promise<unknown>][] = [
  ['songs/s1', (db) => getDoc(doc(db, 'songs/s1'))],
  ['songs/s1/arrangements/a1', (db) => getDoc(doc(db, 'songs/s1/arrangements/a1'))],
  ['songLyrics/s1', (db) => getDoc(doc(db, 'songLyrics/s1'))],
  ['artists/ar1', (db) => getDoc(doc(db, 'artists/ar1'))],
  ['setlists/n1', (db) => getDoc(doc(db, 'setlists/n1'))],
  ['lista de songs', (db) => getDocs(collection(db, 'songs'))],
  ['lista de artists', (db) => getDocs(collection(db, 'artists'))],
  [
    'lista de setlists vigentes',
    (db) =>
      getDocs(
        query(collection(db, 'setlists'), where('expiresAt', '>', Timestamp.fromDate(new Date()))),
      ),
  ],
];

describe('acesso por papel (#126)', () => {
  describe.each(leituras)('leitura de %s', (_nome, ler) => {
    it.each([
      ['visitante sem claim', ctx.visitanteSemClaim],
      ['visitante viewer', ctx.visitanteViewer],
      ['deslogado', ctx.deslogado],
    ])('negada para %s', async (_who, db) => {
      await assertFails(ler(db()));
    });

    it.each([
      ['membro', ctx.membro],
      ['admin', ctx.admin],
    ])('permitida para %s', async (_who, db) => {
      await assertSucceeds(ler(db()));
    });
  });

  it('visitante lê o próprio doc de users (AuthProvider depende disso)', async () => {
    await assertSucceeds(getDoc(doc(ctx.visitanteViewer(), 'users/vis')));
    await assertSucceeds(getDoc(doc(ctx.visitanteSemClaim(), 'users/vis')));
  });

  it('visitante não lê o doc de outra pessoa em users', async () => {
    await assertFails(getDoc(doc(ctx.visitanteViewer(), 'users/m1')));
  });
});
