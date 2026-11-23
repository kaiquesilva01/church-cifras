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
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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

afterAll(async () => {
  await env.cleanup();
});

type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

const setlistData = (over: Record<string, unknown> = {}) => ({
  date: '2026-11-22',
  label: 'Domingo',
  items: [],
  expiresAt: Timestamp.fromDate(new Date('2026-12-23T03:00:00Z')),
  createdBy: 'm1',
  createdAt: serverTimestamp(),
  updatedBy: 'm1',
  updatedAt: serverTimestamp(),
  ...over,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'ministries/hajaluz'), {
      name: 'Haja Luz',
      nameNormalized: 'haja luz',
      city: 'São Paulo',
    });
    await setDoc(doc(db, 'ministries/outro'), {
      name: 'Outro',
      nameNormalized: 'outro',
      city: 'Sumaré',
    });
    await setDoc(doc(db, 'ministries/hajaluz/members/m1'), { uid: 'm1', role: 'admin' });
    await setDoc(doc(db, 'ministries/hajaluz/members/m2'), { uid: 'm2', role: 'member' });
    await setDoc(doc(db, 'ministries/outro/members/o1'), { uid: 'o1', role: 'member' });
    await setDoc(doc(db, 'ministries/outro/members/o2'), { uid: 'o2', role: 'admin' });
    await setDoc(doc(db, 'ministries/hajaluz/requests/r1'), { uid: 'r1', status: 'pending' });
    await setDoc(doc(db, 'ministries/hajaluz/setlists/s1'), setlistData());
  });
});

type Ctx =
  | 'deslogado'
  | 'semVinculo'
  | 'removido'
  | 'membroHaja'
  | 'adminHaja'
  | 'membroOutro'
  | 'adminOutro'
  | 'adminApp'
  | 'pedinte';

const CTX: Record<Ctx, () => Db> = {
  deslogado: () => env.unauthenticatedContext().firestore(),
  semVinculo: () => env.authenticatedContext('x1', {}).firestore(),
  removido: () =>
    env
      .authenticatedContext('ex', { role: 'admin', hasMinistry: true, canUploadSong: true })
      .firestore(),
  membroHaja: () => env.authenticatedContext('m2', { hasMinistry: true }).firestore(),
  adminHaja: () =>
    env.authenticatedContext('m1', { hasMinistry: true, canUploadSong: true }).firestore(),
  membroOutro: () => env.authenticatedContext('o1', { hasMinistry: true }).firestore(),
  adminOutro: () =>
    env.authenticatedContext('o2', { hasMinistry: true, canUploadSong: true }).firestore(),
  adminApp: () => env.authenticatedContext('app', { appAdmin: true }).firestore(),
  pedinte: () => env.authenticatedContext('r1', {}).firestore(),
};
const UID: Record<Ctx, string> = {
  deslogado: 'anon',
  semVinculo: 'x1',
  removido: 'ex',
  membroHaja: 'm2',
  adminHaja: 'm1',
  membroOutro: 'o1',
  adminOutro: 'o2',
  adminApp: 'app',
  pedinte: 'r1',
};
const TODOS = Object.keys(CTX) as Ctx[];

// Quem pode ler (S na matriz); os demais contextos são negados.
const LEITURAS: Array<[string, Ctx[]]> = [
  ['ministries/hajaluz', TODOS.filter((c) => c !== 'deslogado')],
  ['ministries/hajaluz/members/m2', ['membroHaja', 'adminHaja', 'adminApp']],
  ['ministries/hajaluz/requests/r1', ['adminHaja', 'adminApp', 'pedinte']],
  ['ministries/hajaluz/setlists/s1', ['membroHaja', 'adminHaja']],
];

describe('ministerios: leitura', () => {
  for (const [path, permitidos] of LEITURAS) {
    for (const nome of TODOS) {
      it(`get ${path} (${nome}) ${permitidos.includes(nome) ? 'permite' : 'nega'}`, async () => {
        const op = getDoc(doc(CTX[nome](), path));
        if (permitidos.includes(nome)) await assertSucceeds(op);
        else await assertFails(op);
      });
    }
  }
});

describe('ministerios: consulta de grupo', () => {
  for (const nome of TODOS) {
    it(`members e requests (${nome}): só admin da app`, async () => {
      const db = CTX[nome]();
      const op = Promise.all([
        getDocs(collectionGroup(db, 'members')),
        getDocs(collectionGroup(db, 'requests')),
      ]);
      if (nome === 'adminApp') await assertSucceeds(op);
      else await assertFails(op);
    });
  }
});

describe('ministerios: repertórios fora do ministério', () => {
  // Admin da app vê vínculos e pedidos, nunca repertórios de ministério (sem regra de grupo).
  it('consulta de grupo de setlists (adminApp, sem vínculo): negada', async () => {
    await assertFails(getDocs(collectionGroup(CTX.adminApp(), 'setlists')));
  });
});

describe('ministerios: escrita', () => {
  for (const nome of TODOS) {
    it(`cria setlist do ministério (${nome}): ${nome === 'adminHaja' ? 'permite' : 'nega'}`, async () => {
      const op = setDoc(
        doc(CTX[nome](), 'ministries/hajaluz/setlists/n1'),
        setlistData({ createdBy: UID[nome], updatedBy: UID[nome] }),
      );
      if (nome === 'adminHaja') await assertSucceeds(op);
      else await assertFails(op);
    });

    it(`não atualiza ministries/hajaluz pelo cliente (${nome})`, async () => {
      await assertFails(updateDoc(doc(CTX[nome](), 'ministries/hajaluz'), { name: 'X' }));
    });

    it(`não cria members pelo cliente (${nome})`, async () => {
      await assertFails(
        setDoc(doc(CTX[nome](), 'ministries/hajaluz/members/x'), { uid: 'x', role: 'member' }),
      );
    });
  }

  it('setlist do ministério com rehearsalAt fora da janela de date: negado para admin', async () => {
    await assertFails(
      setDoc(
        doc(CTX.adminHaja(), 'ministries/hajaluz/setlists/n2'),
        setlistData({ rehearsalAt: Timestamp.fromDate(new Date('2027-01-15T19:00:00Z')) }),
      ),
    );
  });

  it('setlist do ministério com createdBy de outro uid: negado para admin', async () => {
    await assertFails(
      setDoc(
        doc(CTX.adminHaja(), 'ministries/hajaluz/setlists/n3'),
        setlistData({ createdBy: 'outro' }),
      ),
    );
  });
});

describe('ministerios: listagem do ministério', () => {
  const PERMITIDOS = ['adminHaja', 'adminApp'] as Ctx[];
  for (const colecao of ['members', 'requests']) {
    for (const nome of TODOS) {
      it(`lista ${colecao} do ministério (${nome}) ${PERMITIDOS.includes(nome) ? 'permite' : 'nega'}`, async () => {
        const op = getDocs(collection(CTX[nome](), `ministries/hajaluz/${colecao}`));
        if (PERMITIDOS.includes(nome)) await assertSucceeds(op);
        else await assertFails(op);
      });
    }
  }
});

describe('ministerios: edição e exclusão do setlist', () => {
  const S1 = 'ministries/hajaluz/setlists/s1';
  // withSecurityRulesDisabled não devolve o resultado do callback: guarda numa variável.
  const s1Atual = async () => {
    let dados = undefined as { createdBy: string; createdAt: Timestamp } | undefined;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), S1));
      dados = snap.data() as { createdBy: string; createdAt: Timestamp };
    });
    if (!dados) throw new Error('setlist s1 não semeado');
    return dados;
  };

  it('edita setlist do ministério (adminHaja): permite, reenviando createdBy e createdAt', async () => {
    const atual = await s1Atual();
    await assertSucceeds(
      setDoc(
        doc(CTX.adminHaja(), S1),
        setlistData({
          label: 'Noite',
          createdBy: atual.createdBy,
          createdAt: atual.createdAt,
          updatedBy: 'm1',
        }),
      ),
    );
  });

  for (const nome of TODOS.filter((c) => c !== 'adminHaja')) {
    it(`não edita setlist do ministério (${nome})`, async () => {
      const atual = await s1Atual();
      await assertFails(
        setDoc(
          doc(CTX[nome](), S1),
          setlistData({
            label: 'Noite',
            createdBy: atual.createdBy,
            createdAt: atual.createdAt,
            updatedBy: UID[nome],
          }),
        ),
      );
    });
  }

  it('edição do adminHaja não troca createdBy: negado', async () => {
    const atual = await s1Atual();
    await assertFails(
      setDoc(
        doc(CTX.adminHaja(), S1),
        setlistData({ createdBy: 'outro', createdAt: atual.createdAt, updatedBy: 'm1' }),
      ),
    );
  });

  it('edição do adminHaja não troca createdAt: negado', async () => {
    const atual = await s1Atual();
    await assertFails(
      setDoc(
        doc(CTX.adminHaja(), S1),
        setlistData({ createdBy: atual.createdBy, createdAt: serverTimestamp(), updatedBy: 'm1' }),
      ),
    );
  });

  it('exclui setlist do ministério (adminHaja): permite', async () => {
    await assertSucceeds(deleteDoc(doc(CTX.adminHaja(), S1)));
  });

  for (const nome of TODOS.filter((c) => c !== 'adminHaja')) {
    it(`não exclui setlist do ministério (${nome})`, async () => {
      await assertFails(deleteDoc(doc(CTX[nome](), S1)));
    });
  }
});
