import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'users/u1'), { role: 'viewer' });
    await setDoc(doc(db, 'users/u2'), { role: 'member' });
    await setDoc(doc(db, 'artists/ar1'), { name: 'Artista' });
    await setDoc(doc(db, 'songs/s1'), { title: 'Musica' });
    await setDoc(doc(db, 'songs/s1/arrangements/a1'), { key: 'G' });
    await setDoc(doc(db, 'secret/x'), { a: 1 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('firestore.rules', () => {
  it('allows user to read own users doc', async () => {
    const db = env.authenticatedContext('u1', { role: 'viewer' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/u1')));
  });

  it('denies user reading another users doc', async () => {
    const db = env.authenticatedContext('u1', { role: 'viewer' }).firestore();
    await assertFails(getDoc(doc(db, 'users/u2')));
  });

  it('allows admin to read any users doc', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/u2')));
  });

  it('denies user writing own users doc', async () => {
    const db = env.authenticatedContext('u1', { role: 'viewer' }).firestore();
    await assertFails(setDoc(doc(db, 'users/u1'), { role: 'admin' }));
    const db2 = env.authenticatedContext('u1', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db2, 'users/u1'), { role: 'admin' }));
  });

  it('denies admin writing users doc from client', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db, 'users/u2'), { role: 'admin' }));
  });

  it('allows signed-in read of songs, arrangements and artists', async () => {
    const db = env.authenticatedContext('u1').firestore();
    await assertSucceeds(getDoc(doc(db, 'songs/s1')));
    await assertSucceeds(getDoc(doc(db, 'songs/s1/arrangements/a1')));
    await assertSucceeds(getDoc(doc(db, 'artists/ar1')));
  });

  it('denies unauthenticated read of songs', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('denies client writes to songs', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db, 'songs/s2'), { title: 'x' }));
    await assertFails(setDoc(doc(db, 'songs/s1/arrangements/a2'), { key: 'A' }));
    await assertFails(setDoc(doc(db, 'artists/ar2'), { name: 'x' }));
  });

  it('denies access to unknown collections', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(db, 'secret/x')));
    await assertFails(setDoc(doc(db, 'secret/y'), { a: 1 }));
  });
});
