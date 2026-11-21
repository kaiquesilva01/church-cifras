import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'songs/s1'), { title: 'Música de controle' });
  });
});

afterAll(async () => {
  await env.cleanup();
});

type Who = 'anonimo' | 'viewer' | 'member' | 'admin';
const WHO: Who[] = ['anonimo', 'viewer', 'member', 'admin'];
const PATHS = ['pushDevices/d1', 'pushDevices/novo', 'avisosEnviados/a1', 'config/push'];
// Documentos que já existem na seed: só eles podem provar "não altera" de forma não trivial.
const EXISTING: [string, Record<string, unknown>][] = [
  ['pushDevices/d1', { origin: 'teste' }],
  ['avisosEnviados/a1', { sentAt: new Date() }],
  ['config/push', { enabled: false }],
];
const COLLECTIONS = ['pushDevices', 'avisosEnviados'];

const dbFor = (who: Who) =>
  (who === 'anonimo'
    ? env.unauthenticatedContext()
    : env.authenticatedContext(`${who}1`, { role: who })
  ).firestore();

// Controle positivo: prova que o contexto autenticado e o papel funcionam.
// Sem isso, um assertFails poderia passar por um contexto quebrado.
describe('controle positivo: contexto autenticado lê songs', () => {
  it.each(['viewer', 'member', 'admin'] as const)('permite leitura para %s', async (who) => {
    await assertSucceeds(getDoc(doc(dbFor(who), 'songs/s1')));
  });

  it('nega leitura para anônimo', async () => {
    await assertFails(getDoc(doc(dbFor('anonimo'), 'songs/s1')));
  });
});

describe.each(WHO)('colecoes de push fechadas para %s', (who) => {
  it.each(PATHS)('não lê %s', async (path) => {
    await assertFails(getDoc(doc(dbFor(who), path)));
  });

  it.each(COLLECTIONS)('não lista a coleção %s', async (col) => {
    await assertFails(getDocs(collection(dbFor(who), col)));
  });

  it.each(PATHS)('não cria %s', async (path) => {
    await assertFails(setDoc(doc(dbFor(who), path), { uid: 'm1', token: 'x', origin: 'producao' }));
  });

  it.each(EXISTING)('não altera %s', async (path, patch) => {
    await assertFails(updateDoc(doc(dbFor(who), path), patch));
  });

  it.each(PATHS)('não apaga %s', async (path) => {
    await assertFails(deleteDoc(doc(dbFor(who), path)));
  });
});
