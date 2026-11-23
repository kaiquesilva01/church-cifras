import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-church-cifras',
    storage: {
      rules: readFileSync(resolve(import.meta.dirname, '../../storage.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const storage = ctx.storage();
    await uploadBytes(ref(storage, 'songs/s1/original.pdf'), new Uint8Array([1, 2, 3]));
    await uploadBytes(ref(storage, 'other/file.txt'), new Uint8Array([1, 2, 3]));
    await uploadBytes(ref(storage, 'pads/v1/DS04-C.m4a'), new Uint8Array([1, 2, 3]));
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  it('allows member read under songs/', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertSucceeds(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('allows admin read under songs/', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertSucceeds(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('denies viewer read under songs/', async () => {
    const storage = env.authenticatedContext('u1', { role: 'viewer' }).storage();
    await assertFails(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('denies read under songs/ without role claim', async () => {
    const storage = env.authenticatedContext('u1').storage();
    await assertFails(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('denies unauthenticated read under songs/', async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  const pdfFor = (uid: string) => ({
    contentType: 'application/pdf',
    customMetadata: { uploadedBy: uid },
  });
  const pdf = pdfFor('m1');
  const one = new Uint8Array([1]);

  it('allows member to upload pdf under songs', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertSucceeds(uploadBytes(ref(storage, 'songs/s1/Cs-abc_123.pdf'), one, pdf));
  });

  it('allows admin to upload pdf under songs', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertSucceeds(uploadBytes(ref(storage, 'songs/s1/Fsm-admin1.pdf'), one, pdfFor('a1')));
  });

  it('denies upload without or with someone else as uploadedBy', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertFails(
      uploadBytes(ref(storage, 'songs/s1/H-nometa.pdf'), one, { contentType: 'application/pdf' }),
    );
    await assertFails(uploadBytes(ref(storage, 'songs/s1/H-other.pdf'), one, pdfFor('someone')));
  });

  it('denies viewer upload', async () => {
    const storage = env.authenticatedContext('u1', { role: 'viewer' }).storage();
    await assertFails(uploadBytes(ref(storage, 'songs/s1/D-viewer.pdf'), one, pdfFor('u1')));
  });

  it('denies upload without role claim and unauthenticated', async () => {
    const noRole = env.authenticatedContext('u1').storage();
    await assertFails(uploadBytes(ref(noRole, 'songs/s1/D-norole.pdf'), one, pdfFor('u1')));
    const anon = env.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(anon, 'songs/s1/D-anon.pdf'), one, pdf));
  });

  it('denies non-pdf', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertFails(
      uploadBytes(ref(storage, 'songs/s1/E-text.pdf'), one, { ...pdf, contentType: 'text/plain' }),
    );
    await assertFails(uploadBytes(ref(storage, 'songs/s1/E-none.pdf'), one));
  });

  it('allows exactly 10 MB and denies above', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    const limit = new Uint8Array(10 * 1024 * 1024);
    await assertSucceeds(uploadBytes(ref(storage, 'songs/s1/G-limit.pdf'), limit, pdf));
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storage, 'songs/s1/G-big.pdf'), big, pdf));
  });

  it('denies overwriting an existing file', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'songs/s1/A-exists.pdf'), one, pdf);
    });
    await assertFails(uploadBytes(ref(storage, 'songs/s1/A-exists.pdf'), new Uint8Array([2]), pdf));
  });

  it('denies bad file names and nested paths', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertFails(uploadBytes(ref(storage, 'songs/s1/noslug.pdf'), one, pdf));
    await assertFails(uploadBytes(ref(storage, 'songs/s1/C-abc.exe'), one, pdf));
    await assertFails(uploadBytes(ref(storage, 'songs/s1/C-ab c.pdf'), one, pdf));
    await assertFails(uploadBytes(ref(storage, 'songs/s1/sub/C-abc.pdf'), one, pdf));
    await assertFails(uploadBytes(ref(storage, 'other/C-abc.pdf'), one, pdf));
  });

  it('denies deleting files', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertFails(deleteObject(ref(storage, 'songs/s1/original.pdf')));
  });

  it('allows member read pads/', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertSucceeds(getBytes(ref(storage, 'pads/v1/DS04-C.m4a')));
  });

  it('denies viewer read pads/', async () => {
    const storage = env.authenticatedContext('u1', { role: 'viewer' }).storage();
    await assertFails(getBytes(ref(storage, 'pads/v1/DS04-C.m4a')));
  });

  it('denies read pads/ without role claim', async () => {
    const storage = env.authenticatedContext('u1').storage();
    await assertFails(getBytes(ref(storage, 'pads/v1/DS04-C.m4a')));
  });

  it('denies unauthenticated read under pads/', async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, 'pads/v1/DS04-C.m4a')));
  });

  it('denies member read of the old flat pads/ path', async () => {
    const storage = env.authenticatedContext('m1', { role: 'member' }).storage();
    await assertFails(getBytes(ref(storage, 'pads/DS04-C.m4a')));
  });

  it('denies every role writing under pads/', async () => {
    for (const role of ['viewer', 'member', 'admin']) {
      const storage = env.authenticatedContext(`${role}-uid`, { role }).storage();
      await assertFails(
        uploadBytes(ref(storage, 'pads/v1/DS99-X.m4a'), one, { contentType: 'audio/mp4' }),
      );
    }
  });

  it('denies reads outside songs/', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertFails(getBytes(ref(storage, 'other/file.txt')));
  });
});
