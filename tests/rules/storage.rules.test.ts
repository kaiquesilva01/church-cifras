import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
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
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  it('allows signed-in read under songs/', async () => {
    const storage = env.authenticatedContext('u1', { role: 'viewer' }).storage();
    await assertSucceeds(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('denies unauthenticated read under songs/', async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, 'songs/s1/original.pdf')));
  });

  it('denies uploads', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertFails(uploadBytes(ref(storage, 'songs/s1/new.pdf'), new Uint8Array([1])));
  });

  it('denies reads outside songs/', async () => {
    const storage = env.authenticatedContext('a1', { role: 'admin' }).storage();
    await assertFails(getBytes(ref(storage, 'other/file.txt')));
  });
});
