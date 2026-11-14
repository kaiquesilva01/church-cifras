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
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
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

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

const memberDb = (): Db => env.authenticatedContext('m1', { role: 'member' }).firestore();

const songData = (over: Record<string, unknown> = {}) => ({
  title: 'Sonda-me',
  titleNormalized: 'sonda-me',
  artistId: 'aline-barros',
  artistName: 'Aline Barros',
  keys: [],
  handmadeKeys: [],
  createdBy: 'm1',
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...over,
});

const arrData = (over: Record<string, unknown> = {}) => ({
  key: 'C#',
  storagePath: 'songs/n1/Cs-abc123.pdf',
  source: 'handmade',
  derivedFromKey: null,
  writer: 'upload',
  chordCount: 10,
  collisions: 0,
  createdBy: 'm1',
  createdAt: serverTimestamp(),
  ...over,
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

  it('allows admin to list users', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertSucceeds(getDocs(query(collection(db, 'users'), orderBy('displayName'))));
  });

  it('denies viewer listing users', async () => {
    const db = env.authenticatedContext('u1', { role: 'viewer' }).firestore();
    await assertFails(getDocs(query(collection(db, 'users'), orderBy('displayName'))));
  });

  it('denies unauthenticated reads of users, artists and arrangements', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/u1')));
    await assertFails(getDoc(doc(db, 'artists/ar1')));
    await assertFails(getDoc(doc(db, 'songs/s1/arrangements/a1')));
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('denies client writes of malformed songs and artists', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db, 'songs/s2'), { title: 'x' }));
    await assertFails(setDoc(doc(db, 'songs/s1/arrangements/a2'), { key: 'A' }));
    await assertFails(setDoc(doc(db, 'artists/ar2'), { name: 'x' }));
  });

  it('allows member to create song with arrangement in one batch', async () => {
    const db = memberDb();
    const batch = writeBatch(db);
    batch.set(doc(db, 'songs/n1'), songData());
    batch.set(doc(db, 'songs/n1/arrangements/Cs'), arrData());
    await assertSucceeds(batch.commit());
  });

  it('allows admin to create song and generated arrangement', async () => {
    const db = env.authenticatedContext('m1', { role: 'admin' }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'songs/n1'), songData());
    batch.set(
      doc(db, 'songs/n1/arrangements/Fsm'),
      arrData({
        key: 'F#m',
        storagePath: 'songs/n1/Fsm-a_b-1.pdf',
        source: 'generated',
        derivedFromKey: 'Am',
        writer: 'overlay',
      }),
    );
    await assertSucceeds(batch.commit());
  });

  it('allows member to add a key to an existing song', async () => {
    const db = memberDb();
    await assertSucceeds(
      setDoc(
        doc(db, 'songs/s1/arrangements/Bb'),
        arrData({ key: 'Bb', storagePath: 'songs/s1/Bb-xyz.pdf' }),
      ),
    );
  });

  it('denies viewer creating song', async () => {
    const db = env.authenticatedContext('m1', { role: 'viewer' }).firestore();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData()));
  });

  it('denies token without role claim creating song', async () => {
    const db = env.authenticatedContext('m1').firestore();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData()));
  });

  it('denies viewer creating arrangement', async () => {
    const db = env.authenticatedContext('m1', { role: 'viewer' }).firestore();
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/Cs'), arrData({ storagePath: 'songs/s1/Cs-abc.pdf' })),
    );
  });

  it('denies song with non-empty keys', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ keys: ['C'] })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ handmadeKeys: ['C'] })));
  });

  it('denies song with createdBy of another user', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ createdBy: 'other' })));
  });

  it('denies song with client-supplied timestamps, extra or invalid fields', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ createdAt: new Date() })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ extra: 1 })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ title: '' })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ title: 'x'.repeat(121) })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ artistId: '' })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ artistName: 5 })));
  });

  it('denies song updates and deletes', async () => {
    const db = memberDb();
    await assertFails(updateDoc(doc(db, 'songs/s1'), { title: 'y' }));
    await assertFails(deleteDoc(doc(db, 'songs/s1')));
  });

  it('denies arrangement with mismatched slug', async () => {
    const db = memberDb();
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/D'), arrData({ storagePath: 'songs/s1/D-abc.pdf' })),
    );
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/C#'), arrData({ storagePath: 'songs/s1/C#-abc.pdf' })),
    );
  });

  it('denies arrangement with key outside the canonical list', async () => {
    const db = memberDb();
    await assertFails(
      setDoc(
        doc(db, 'songs/s1/arrangements/H'),
        arrData({ key: 'H', storagePath: 'songs/s1/H-abc.pdf' }),
      ),
    );
  });

  it('denies arrangement path outside song folder', async () => {
    const db = memberDb();
    const path = 'songs/s1/arrangements/Cs';
    await assertFails(setDoc(doc(db, path), arrData({ storagePath: 'songs/s2/Cs-abc.pdf' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath: 'other/Cs-abc.pdf' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath: 'songs/s1/D-abc.pdf' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath: 'songs/s1/Cs-abc.txt' })));
  });

  it('denies arrangement for a song that does not exist', async () => {
    const db = memberDb();
    await assertFails(
      setDoc(
        doc(db, 'songs/ghost/arrangements/Cs'),
        arrData({ storagePath: 'songs/ghost/Cs-a.pdf' }),
      ),
    );
  });

  it('denies creating an arrangement that already exists', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'songs/s1/arrangements/Cs'), { key: 'C#' });
    });
    const db = memberDb();
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/Cs'), arrData({ storagePath: 'songs/s1/Cs-abc.pdf' })),
    );
  });

  it('denies arrangement updates and deletes', async () => {
    const db = memberDb();
    await assertFails(updateDoc(doc(db, 'songs/s1/arrangements/a1'), { chordCount: 3 }));
    await assertFails(deleteDoc(doc(db, 'songs/s1/arrangements/a1')));
  });

  it('denies generated arrangement without derivedFromKey', async () => {
    const db = memberDb();
    const path = 'songs/s1/arrangements/Cs';
    const storagePath = 'songs/s1/Cs-abc.pdf';
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, source: 'generated' })));
    await assertFails(
      setDoc(doc(db, path), arrData({ storagePath, source: 'generated', derivedFromKey: 'Z' })),
    );
  });

  it('denies handmade arrangement with derivedFromKey', async () => {
    const db = memberDb();
    await assertFails(
      setDoc(
        doc(db, 'songs/s1/arrangements/Cs'),
        arrData({ storagePath: 'songs/s1/Cs-abc.pdf', derivedFromKey: 'C' }),
      ),
    );
  });

  it('denies arrangement with invalid source, writer, counts or extra fields', async () => {
    const db = memberDb();
    const path = 'songs/s1/arrangements/Cs';
    const storagePath = 'songs/s1/Cs-abc.pdf';
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, source: 'other' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, writer: 'rewrite' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, chordCount: 0 })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, chordCount: 1.5 })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, collisions: -1 })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, createdBy: 'other' })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, createdAt: new Date() })));
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, extra: 1 })));
  });

  it('denies access to unknown collections', async () => {
    const db = env.authenticatedContext('a1', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(db, 'secret/x')));
    await assertFails(setDoc(doc(db, 'secret/y'), { a: 1 }));
  });
});
