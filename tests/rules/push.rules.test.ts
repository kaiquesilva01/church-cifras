import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'pushDevices/d1'), { uid: 'm1', token: 'tok', origin: 'producao' });
    await setDoc(doc(db, 'avisosEnviados/a1'), { sentAt: new Date() });
    await setDoc(doc(db, 'config/push'), { enabled: true });
  });
});

afterAll(async () => {
  await env.cleanup();
});

type Who = 'anonimo' | 'viewer' | 'member' | 'admin';
const WHO: Who[] = ['anonimo', 'viewer', 'member', 'admin'];
const PATHS = ['pushDevices/d1', 'pushDevices/novo', 'avisosEnviados/a1', 'config/push'];

const dbFor = (who: Who) =>
  (who === 'anonimo'
    ? env.unauthenticatedContext()
    : env.authenticatedContext(`${who}1`, { role: who })
  ).firestore();

describe.each(WHO)('colecoes de push fechadas para %s', (who) => {
  it.each(PATHS)('não lê %s', async (path) => {
    await assertFails(getDoc(doc(dbFor(who), path)));
  });

  it.each(PATHS)('não cria %s', async (path) => {
    await assertFails(setDoc(doc(dbFor(who), path), { uid: 'm1', token: 'x', origin: 'producao' }));
  });

  it('não altera pushDevices/d1', async () => {
    await assertFails(updateDoc(doc(dbFor(who), 'pushDevices/d1'), { origin: 'teste' }));
  });

  it.each(PATHS)('não apaga %s', async (path) => {
    await assertFails(deleteDoc(doc(dbFor(who), path)));
  });
});
