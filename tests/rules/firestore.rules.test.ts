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

const memberDb = (): Db =>
  env
    .authenticatedContext('m1', { role: 'member', hasMinistry: true, canUploadSong: true })
    .firestore();

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
    const db = env.authenticatedContext('a1', { appAdmin: true }).firestore();
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

  it('allows member read of songs, arrangements and artists', async () => {
    const db = env.authenticatedContext('m1', { role: 'member' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'songs/s1')));
    await assertSucceeds(getDoc(doc(db, 'songs/s1/arrangements/a1')));
    await assertSucceeds(getDoc(doc(db, 'artists/ar1')));
  });

  it('denies unauthenticated read of songs', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('allows admin to list users', async () => {
    const db = env.authenticatedContext('a1', { appAdmin: true }).firestore();
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

  const seedArrangement = (slug: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `songs/s1/arrangements/${slug}`), data);
    });

  const generatedData = (over: Record<string, unknown> = {}) =>
    arrData({
      key: 'F#m',
      storagePath: 'songs/s1/Fsm-a_b-1.pdf',
      source: 'generated',
      derivedFromKey: 'Am',
      writer: 'overlay',
      ...over,
    });

  it('allows generated derived from an existing handmade of the same mode', async () => {
    await seedArrangement('Am', { key: 'Am', source: 'handmade' });
    const db = env.authenticatedContext('m1', { role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'songs/s1/arrangements/Fsm'), generatedData()));
  });

  it('allows generated derived from a sharp handmade key', async () => {
    await seedArrangement('Cs', { key: 'C#', source: 'handmade' });
    const db = memberDb();
    await assertSucceeds(
      setDoc(
        doc(db, 'songs/s1/arrangements/D'),
        generatedData({ key: 'D', storagePath: 'songs/s1/D-a.pdf', derivedFromKey: 'C#' }),
      ),
    );
  });

  it('denies generated derived from a generated key', async () => {
    await seedArrangement('Am', { key: 'Am', source: 'generated' });
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/s1/arrangements/Fsm'), generatedData()));
  });

  it('denies generated derived from a missing key', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/s1/arrangements/Fsm'), generatedData()));
  });

  it('denies generated with a different mode', async () => {
    await seedArrangement('C', { key: 'C', source: 'handmade' });
    const db = memberDb();
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/Fsm'), generatedData({ derivedFromKey: 'C' })),
    );
    await seedArrangement('Am', { key: 'Am', source: 'handmade' });
    await assertFails(
      setDoc(
        doc(db, 'songs/s1/arrangements/F'),
        generatedData({ key: 'F', storagePath: 'songs/s1/F-a.pdf', derivedFromKey: 'Am' }),
      ),
    );
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

  it('denies song ids with regex or odd characters', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/.*'), songData()));
    await assertFails(setDoc(doc(db, 'songs/a|b'), songData()));
    await assertFails(setDoc(doc(db, 'songs/' + 'x'.repeat(101)), songData()));
  });

  it('denies arrangements under songs with regex ids', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'songs/.*'), { title: 'x' });
      await setDoc(doc(ctx.firestore(), 'songs/a|b'), { title: 'x' });
    });
    const db = memberDb();
    await assertFails(
      setDoc(doc(db, 'songs/.*/arrangements/Cs'), arrData({ storagePath: 'songs/s1/Cs-abc.pdf' })),
    );
    await assertFails(
      setDoc(doc(db, 'songs/.*/arrangements/Cs'), arrData({ storagePath: 'songs/.*/Cs-abc.pdf' })),
    );
    await assertFails(
      setDoc(doc(db, 'songs/a|b/arrangements/Cs'), arrData({ storagePath: 'songs/a/Cs-abc.pdf' })),
    );
  });

  it('denies artistId outside slug format and oversized storagePath', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ artistId: 'Aline Barros' })));
    await assertFails(setDoc(doc(db, 'songs/n1'), songData({ artistId: 'a.*' })));
    const longPath = 'songs/s1/Cs-' + 'a'.repeat(300) + '.pdf';
    await assertFails(
      setDoc(doc(db, 'songs/s1/arrangements/Cs'), arrData({ storagePath: longPath })),
    );
  });

  it('denies inconsistent source, writer and derivedFromKey', async () => {
    const db = memberDb();
    const path = 'songs/s1/arrangements/Cs';
    const storagePath = 'songs/s1/Cs-abc.pdf';
    await assertFails(setDoc(doc(db, path), arrData({ storagePath, writer: 'overlay' })));
    await assertFails(
      setDoc(
        doc(db, path),
        arrData({ storagePath, source: 'generated', derivedFromKey: 'C', writer: 'upload' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, path),
        arrData({ storagePath, source: 'generated', derivedFromKey: 'C#', writer: 'overlay' }),
      ),
    );
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

  describe('catálogo por claims (pacote)', () => {
    const lyricsData = (over: Record<string, unknown> = {}) => ({
      text: 'Letra de teste',
      createdBy: 'm',
      createdAt: serverTimestamp(),
      ...over,
    });
    const membro = () =>
      env
        .authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false })
        .firestore();

    beforeEach(async () => {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'songs/s1'), songData({ createdBy: 'm' }));
      });
    });

    it('sem claim novo e com role viewer, não lê o catálogo', async () => {
      const db = env.authenticatedContext('v', { role: 'viewer' }).firestore();
      await assertFails(getDoc(doc(db, 'songs/s1')));
    });

    it('hasMinistry verdadeiro lê o catálogo', async () => {
      await assertSucceeds(getDoc(doc(membro(), 'songs/s1')));
    });

    it('hasMinistry falso não lê, mesmo com role member (removido com token antigo)', async () => {
      const db = env
        .authenticatedContext('r', { role: 'member', hasMinistry: false, canUploadSong: false })
        .firestore();
      await assertFails(getDoc(doc(db, 'songs/s1')));
    });

    it('token antigo sem claim novo lê pelo role legado', async () => {
      const db = env.authenticatedContext('old', { role: 'member' }).firestore();
      await assertSucceeds(getDoc(doc(db, 'songs/s1')));
    });

    it('membro sem canUploadSong não cria música nova nem letra', async () => {
      await assertFails(setDoc(doc(membro(), 'songs/s2'), songData({ createdBy: 'm' })));
      await assertFails(setDoc(doc(membro(), 'songLyrics/s1'), lyricsData()));
    });

    it('admin de ministério (canUploadSong) cria música nova', async () => {
      const db = env
        .authenticatedContext('a', { role: 'member', hasMinistry: true, canUploadSong: true })
        .firestore();
      await assertSucceeds(setDoc(doc(db, 'songs/s2'), songData({ createdBy: 'a' })));
    });

    it('membro cria tom gerado a partir de tom feito à mão (slug = tom, sensível a caixa)', async () => {
      await seedArrangement('C', { key: 'C', source: 'handmade' });
      await assertSucceeds(
        setDoc(
          doc(membro(), 'songs/s1/arrangements/D'),
          arrData({
            key: 'D',
            storagePath: 'songs/s1/D-abc.pdf',
            source: 'generated',
            derivedFromKey: 'C',
            writer: 'overlay',
            createdBy: 'm',
          }),
        ),
      );
    });

    it('admin da app sem ministério também cria tom gerado', async () => {
      await seedArrangement('C', { key: 'C', source: 'handmade' });
      const db = env.authenticatedContext('chefe', { appAdmin: true }).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'songs/s1/arrangements/D'),
          arrData({
            key: 'D',
            storagePath: 'songs/s1/D-abc.pdf',
            source: 'generated',
            derivedFromKey: 'C',
            writer: 'overlay',
            createdBy: 'chefe',
          }),
        ),
      );
    });

    it('membro não cria tom feito à mão', async () => {
      await assertFails(
        setDoc(
          doc(membro(), 'songs/s1/arrangements/D'),
          arrData({ key: 'D', storagePath: 'songs/s1/D-abc.pdf', createdBy: 'm' }),
        ),
      );
    });

    it('admin da app lê e cria música sem ministério', async () => {
      const db = env.authenticatedContext('chefe', { appAdmin: true, role: 'viewer' }).firestore();
      await assertSucceeds(getDoc(doc(db, 'songs/s1')));
      await assertSucceeds(setDoc(doc(db, 'songs/s3'), songData({ createdBy: 'chefe' })));
    });
  });
});

describe('songLyrics rules', () => {
  const lyricsData = (over: Record<string, unknown> = {}) => ({
    text: 'Grande é o Senhor',
    createdBy: 'm1',
    createdAt: serverTimestamp(),
    ...over,
  });

  const seedLyrics = (songId: string, data: Record<string, unknown>) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `songLyrics/${songId}`), data);
    });

  const songAndLyrics = (db: Db, lyrics: Record<string, unknown> = lyricsData()) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'songs/s9'), songData());
    batch.set(doc(db, 'songLyrics/s9'), lyrics);
    return batch.commit();
  };

  it('member creates songLyrics together with the song', async () => {
    await assertSucceeds(songAndLyrics(memberDb()));
  });

  it('text of exactly 20000 characters is accepted', async () => {
    await assertSucceeds(songAndLyrics(memberDb(), lyricsData({ text: 'x'.repeat(20000) })));
  });

  const seedSong = (songId: string) =>
    env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `songs/${songId}`), { title: 'Sonda-me' });
    });

  it('denies viewer creating songLyrics for an existing song', async () => {
    await seedSong('s9');
    const db = env.authenticatedContext('m1', { role: 'viewer' }).firestore();
    await assertFails(setDoc(doc(db, 'songLyrics/s9'), lyricsData()));
  });

  it('member creates songLyrics for an already-existing song', async () => {
    await seedSong('s9');
    await assertSucceeds(setDoc(doc(memberDb(), 'songLyrics/s9'), lyricsData()));
  });

  it('denies songLyrics without the song in the same write', async () => {
    const db = memberDb();
    await assertFails(setDoc(doc(db, 'songLyrics/s9'), lyricsData()));
  });

  it('denies songLyrics with extra field, empty text, oversized text or wrong types', async () => {
    const db = memberDb();
    await assertFails(songAndLyrics(db, lyricsData({ extra: 1 })));
    await assertFails(songAndLyrics(db, lyricsData({ text: '' })));
    await assertFails(songAndLyrics(db, lyricsData({ text: 'x'.repeat(20001) })));
    await assertFails(songAndLyrics(db, lyricsData({ text: 5 })));
  });

  it('denies songLyrics with createdBy of another user or client timestamp', async () => {
    const db = memberDb();
    await assertFails(songAndLyrics(db, lyricsData({ createdBy: 'other' })));
    await assertFails(songAndLyrics(db, lyricsData({ createdAt: new Date() })));
  });

  it('denies songLyrics update and delete', async () => {
    await seedLyrics('s1', { text: 'a', createdBy: 'm1', createdAt: new Date() });
    const db = memberDb();
    await assertFails(updateDoc(doc(db, 'songLyrics/s1'), { text: 'b' }));
    await assertFails(deleteDoc(doc(db, 'songLyrics/s1')));
  });

  it('member reads songLyrics', async () => {
    await seedLyrics('s1', { text: 'a', createdBy: 'm1', createdAt: new Date() });
    const db = env.authenticatedContext('m1', { role: 'member' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'songLyrics/s1')));
  });

  it('anonymous cannot read songLyrics', async () => {
    await seedLyrics('s1', { text: 'a', createdBy: 'm1', createdAt: new Date() });
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'songLyrics/s1')));
  });
});
