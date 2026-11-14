import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
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
});

afterAll(async () => {
  await env.cleanup();
});

describe('storage.rules', () => {
  it('denies unauthenticated read', async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, 'anything/file.txt')));
  });

  it('denies authenticated upload', async () => {
    const storage = env.authenticatedContext('user-1').storage();
    await assertFails(uploadBytes(ref(storage, 'anything/file.txt'), new Uint8Array([1, 2, 3])));
  });
});
