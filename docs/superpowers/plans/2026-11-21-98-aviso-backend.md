# Avisos: backend dos aparelhos e campos do repertório (#98) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Entregar a base dos avisos push, sem tela e sem envio automático: registro e remoção de aparelhos, aviso de teste para o próprio aparelho, auxiliar de envio reutilizável (#101 e #102), campos `rehearsalAt` e `origin` aceitos pelas Rules do repertório, e os docs reabertos.

**Architecture:** Três partes independentes em arquivos disjuntos. (1) Docs: reabre o não-objetivo em `docs/sistema.md` e no spec de repertórios §3. (2) Rules: `setlists` aceita dois campos opcionais; `pushDevices`, `avisosEnviados` e `config/*` seguem fechados ao cliente pelo deny-all. (3) Functions: módulo `apps/functions/src/push/` com lógica pura, injetada por `PushDeps` (mesmo padrão de `stats/`), testada com um fake em memória; um adaptador fino com `firebase-admin` e as três callables em `index.ts`.

**Tech Stack:** TypeScript 6.0.3 em `strict` + `noUncheckedIndexedAccess`; firebase-admin 14.5.1 (`firebase-admin/messaging`, `sendEachForMulticast`); firebase-functions 7.4.0 (`onCall`, `HttpsError` de `firebase-functions/v2/https`); vitest 5.1.0; `@firebase/rules-unit-testing` 6.0.0 com o emulador do Firestore; tsup 9.0.0 para o build.

**Spec:** Não há spec próprio do push. Esta entrega implementa as decisões da [Análise Agêntica da #85](https://github.com/kaiquesilva01/church-cifras/issues/85) (decisões de 21/11) e o critério de aceite da #98, e reabre o não-objetivo de [repertórios §3](../specs/2026-11-16-repertorios-design.md). Os critérios de aceite estão no corpo da issue #98.

## Global Constraints

- Região das callables: `southamerica-east1`, em `onCall({ region: REGION })`, como no resto de `index.ts`.
- Papel sempre lido de `users/{uid}` por `requireRole` (não do token).
- Token de aparelho é credencial: nunca em log, resposta ou mensagem de erro. Logs só com contagens e `shortHash` (8 primeiros caracteres do SHA-256).
- Origem válida: exatamente `producao` ou `teste`. Aparelho sem origem gravada conta como `producao`.
- Link absoluto por origem: produção `https://louvor-hajaluz.web.app`, teste `https://louvor-hajaluz-teste.web.app`.
- Lote de envio: no máximo 500 tokens por `sendEachForMulticast`.
- Poda de token só com `messaging/registration-token-not-registered` ou `messaging/invalid-registration-token`. Outros erros contam como falha e mantêm o aparelho.
- `config/push` com `enabled === false` bloqueia só quando `respectSwitch` é verdadeiro. Sem o doc, o envio liga.
- Rules: nenhum `allow` novo para `pushDevices`, `avisosEnviados` e `config/*`; o deny-all cobre.
- Mensagens de `HttpsError` em inglês, como no código existente. Textos de aviso em pt-BR.
- Não tocar: `apps/web`, `firebase.json`, `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `cors.json`, `storage.rules`.
- `docs/sistema.md` com no máximo 350 linhas (teste `.claude/agents/sistema.test.mjs`).
- Conventional Commits em inglês; prosa de docs e UI em pt-BR. O `.prettierignore` exclui `docs/` e `*.md`; formatar só o código alterado (`*.ts`, `*.mjs`, `*.json`) com `npx prettier --write <arquivos>`.

## Review Focus

Entradas e condições que a spec implica e que a pessoa usaria, mais prováveis primeiro. Cada uma tem o teste que a prova, na tarefa dona do código.

1. Rebaixado a `viewer` (ou removido) com aparelho registrado: o próximo envio ignora o aparelho e o apaga; o logout dele apaga o próprio registro. Teste: Tarefa 4 `sends to member and admin only, and deletes devices of users who are no longer member or admin`; Tarefa 5 `unregister deletes own device`.
2. Mesmo aparelho usado por outra pessoa (troca de conta no celular): o registro passa ao novo `uid` e não duplica. Teste: Tarefa 5 `token previously owned by another uid moves to the new uid`.
3. Mais de 500 aparelhos ativos: todos recebem, em lotes de 500, sem perder o excedente. Teste: Tarefa 4 `splits tokens into batches of 500`.
4. Token expirado no meio de um lote: só ele sai; erro temporário não apaga aparelho bom. Teste: Tarefa 4 `prunes only not-registered and invalid-token, keeps device on other errors`.
5. Repertório antigo (sem `rehearsalAt` nem `origin`) segue editável; ensaio no limite da janela passa e um segundo depois falha. Teste: Tarefa 2 `allows update of a legacy setlist` e os casos de limite em `rehearsalAt`.

## Grupos de execução

- **Grupo A (paralelo, arquivos disjuntos):** Tarefa 1 (docs) e Tarefa 2 (Rules). A Tarefa 1 toca só `docs/`; a Tarefa 2 toca só `firestore.rules` e `tests/rules/`.
- **Grupo B (sequencial, mesmo diretório `apps/functions/src/push/`):** Tarefa 3 → Tarefa 4 → Tarefa 5 → Tarefa 6. Cada uma depende dos tipos da anterior. Só a Tarefa 6 toca `apps/functions/src/index.ts`.
- **Tarefa 7** (verificação) roda depois de A e B.

---

### Task 1: Docs reabrem o push (spec de repertórios §3 e `docs/sistema.md`)

**Files:**
- Modify: `docs/superpowers/specs/2026-11-16-repertorios-design.md` (§3, lista de não-objetivos)
- Modify: `docs/sistema.md` (Dados, Functions e jobs, Não-objetivos decididos, Limites aceitos, Pendências abertas)

**Interfaces:**
- Consumes: nada.
- Produces: nomes das Functions que os docs descrevem (`registerDevice`, `unregisterDevice`, `sendTestPush`) e os campos `rehearsalAt` e `origin`, idênticos aos das Tarefas 2, 5 e 6.

Não há teste novo para docs. A guarda é o teste existente `.claude/agents/sistema.test.mjs` (máximo de 350 linhas, títulos em ordem, link para o spec de repertórios e a frase "Notificação push, escala de músicos/líder, comentários"), que precisa continuar verde. A conferência de conteúdo é inspeção.

- [ ] **Step 1: Linha de base do harness**

Run: `npm run test:harness`
Expected: todos os testes passam (inclusive `docs/sistema.md has at most 350 lines` e `non-goals link to the repertórios spec section 3`).

- [ ] **Step 2: Reabrir o push no spec de repertórios §3**

Em `docs/superpowers/specs/2026-11-16-repertorios-design.md`, substitua a linha:

Old:
```
- Notificação push, escala de músicos/líder, comentários [decisão nossa].
```
New:
```
- Escala de músicos/líder e comentários [decisão nossa].
```

Logo depois da última linha da lista de não-objetivos (antes de `**Anti-objetivos`), acrescente um parágrafo, separado por linha em branco:

```
**Reaberto em 21/11/2026 pela issue [#85](https://github.com/kaiquesilva01/church-cifras/issues/85):** notificação push para avisos de repertório novo e de ensaio. É opt-in por aparelho, só para membro e admin, e não há tela nem envio automático nesta fase (a base está na #98). Escala de músicos/líder e comentários seguem fora.
```

- [ ] **Step 3: Atualizar `docs/sistema.md`**

3a. Dados (Firestore), na tabela, troque a linha de `setlists/{setlistId}` por esta (o restante da linha segue igual):

Old:
```
| `setlists/{setlistId}` | `date` (`YYYY-MM-DD`), `label`, `items[]` (`id`, `songId`, `key`), `expiresAt`, `createdBy/At`, `updatedBy/At` | membro/admin: create, update e delete |
```
New:
```
| `setlists/{setlistId}` | `date` (`YYYY-MM-DD`), `label`, `items[]` (`id`, `songId`, `key`), `expiresAt`, `createdBy/At`, `updatedBy/At`, `rehearsalAt` (opcional: hora do ensaio, de 7 dias antes do culto até o fim do dia dele), `origin` (opcional: `producao`/`teste`) | membro/admin: create, update e delete |
```

3b. Dados (Firestore), logo depois da linha de `setlistUsage/{setlistId}`, acrescente duas linhas:
```
| `pushDevices/{sha256(token)}` | `uid`, `token`, `origin` (`producao`/`teste`), `createdAt`, `lastSeenAt` | nenhuma; cliente não lê (só Functions) |
| `config/push` | `enabled` (interruptor dos avisos; sem o doc, liga) | nenhuma; só Admin SDK e console |
```

3c. Dados (Firestore), na lista de bullets, depois da linha que começa com `- \`songs\`, \`arrangements\` e \`songLyrics\` são imutáveis`, acrescente:
```
- `pushDevices`, `avisosEnviados` e `config/*` são fechados ao cliente (deny-all); só Functions leem e gravam.
```

3d. Functions e jobs: antes da linha de `health`, acrescente três linhas:
```
| `registerDevice` | callable | membro, admin | Grava o aparelho para os avisos (`pushDevices/{sha256(token)}`); o mesmo token mantém um registro |
| `unregisterDevice` | callable | qualquer logado | Apaga o aparelho do próprio chamador (logout); idempotente |
| `sendTestPush` | callable | membro, admin | Envia "Aviso de teste" só aos aparelhos do chamador; ignora o interruptor |
```
E, logo depois da tabela (antes de "Regras de contagem de uso:"), acrescente:
```
Avisos (push): o auxiliar `sendToDevices` (`apps/functions/src/push/send.ts`) envia por lotes de 500, usa o link da origem de cada aparelho, ignora e apaga aparelho de quem não é mais membro ou admin, poda só tokens inválidos e respeita `config/push` quando pedido. Ainda não há gatilho: os avisos chegam nas entregas #101 e #102.
```

3e. Não-objetivos decididos: troque a linha

Old:
```
| Notificação push, escala de músicos/líder, comentários | [repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3 |
```
New:
```
| Escala de músicos/líder, comentários | [repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3 |
```
E, logo depois da tabela de não-objetivos (antes de "Anti-objetivos que valem em qualquer entrega"), acrescente:
```
Notificação push estava nesta lista como "Notificação push, escala de músicos/líder, comentários" ([repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3). Foi reaberta pela [#85](https://github.com/kaiquesilva01/church-cifras/issues/85), em 21/11/2026: a base dos avisos está nas Functions (`registerDevice`, `unregisterDevice`, `sendTestPush`); tela e envio automático ainda não existem. Escala de músicos/líder e comentários continuam fora.
```

3f. Limites aceitos: acrescente antes da linha que começa com `- Verificação em aparelho real (Android e iPhone)`:
```
- `origin` e `rehearsalAt` são conferidos só na forma: a Rules não confere se a origem é a do site que gravou (protege contra engano, não contra abuso). O token de aparelho fica no Firestore, fechado ao cliente.
```

3g. Pendências abertas: acrescente antes da linha que começa com `- Passos manuais únicos de \`deploy.md\``:
```
- Avisos (push, #85): o backend dos aparelhos está na #98, sem tela nem envio automático. Antes da #99: passos manuais 1 e 2 da #85 (número do projeto e chave VAPID). Antes da #101: passos 4 e 5.
```

- [ ] **Step 4: Formatar e conferir o tamanho**

Markdown não passa pelo Prettier (`.prettierignore` exclui `docs/` e `*.md`); não rode `prettier` nesses arquivos. Confira o diff com `git diff docs/` e veja se as tabelas ficaram com colunas consistentes.
Run: `wc -l docs/sistema.md`
Expected: menos de 350 linhas (hoje 251 mais cerca de 20).

- [ ] **Step 5: Harness verde**

Run: `npm run test:harness`
Expected: mesmo resultado do Step 1, todos verdes.

- [ ] **Step 6: Commit**

```bash
git add docs/sistema.md docs/superpowers/specs/2026-11-16-repertorios-design.md
git commit -m "docs(sistema): reabre push para os avisos (#85) e registra as Functions de aparelhos"
```

---

### Task 2: Rules aceitam `rehearsalAt` e `origin`; push segue fechado ao cliente

**Files:**
- Modify: `tests/rules/setlists.rules.test.ts` (acrescentar um bloco ao final)
- Create: `tests/rules/push.rules.test.ts`
- Modify: `firestore.rules` (`validSetlist` e uma função nova `validRehearsal`)

**Interfaces:**
- Consumes: nada.
- Produces: `setlists/{id}` aceita, opcionalmente, `rehearsalAt` (timestamp) e `origin` (`'producao' | 'teste'`). Os valores são os que o cliente grava na #100 e as Functions leem na #101/#102.

Contrato para a #100: o cliente **omite** o campo para limpar a hora do ensaio. `rehearsalAt: null` é recusado.

Janela: culto em `date` (dia civil de Brasília, UTC-3 sem horário de verão). Aceito: `rehearsalAt >= 00:00 de (date - 7 dias)` e `rehearsalAt < 00:00 de (date + 1 dia)`. Em UTC: `base + 3h - 168h` (inclusivo) e `base + 27h` (exclusivo), com `base = timestamp.date(Y, M, D)`.

**Ponto de checagem:** a janela precisa converter `date` (string) em inteiros. Confirme no emulador que `int()` existe nas Rules. Se não existir, **pare e devolva ao tech-lead**; não invente um substituto (a escolha muda a regra da spec).

- [ ] **Step 1: Escrever os testes positivos e negativos de `setlists`**

Acrescente ao final de `tests/rules/setlists.rules.test.ts`:

```ts
describe('setlists rules: rehearsalAt e origin', () => {
  // Culto em 2026-11-22 (domingo). Janela do ensaio: de 2026-11-15 00:00 até 2026-11-23 00:00 (Brasília = UTC-3).
  const at = (iso: string) => Timestamp.fromDate(new Date(iso));

  it.each([
    ['sem os campos novos (repertório antigo)', {}],
    ['ensaio na quinta, 19:30 de Brasília', { rehearsalAt: at('2026-11-19T22:30:00Z') }],
    ['início da janela (7 dias antes, 00:00 de Brasília)', { rehearsalAt: at('2026-11-15T03:00:00Z') }],
    ['último segundo do dia do culto', { rehearsalAt: at('2026-11-23T02:59:59Z') }],
    ['origem produção', { origin: 'producao' }],
    ['origem teste', { origin: 'teste' }],
  ])('allows member with %s', async (_name, over) => {
    await assertSucceeds(setDoc(doc(memberDb(), 'setlists/n1'), setlistData(over)));
  });

  it.each([
    ['um segundo antes da janela', { rehearsalAt: at('2026-11-15T02:59:59Z') }],
    ['00:00 do dia seguinte ao culto (exclusivo)', { rehearsalAt: at('2026-11-23T03:00:00Z') }],
    ['texto em vez de timestamp', { rehearsalAt: '2026-11-19T22:30:00Z' }],
    ['rehearsalAt nulo', { rehearsalAt: null }],
    ['origem fora da lista', { origin: 'outro' }],
    ['origem nula', { origin: null }],
  ])('denies member with %s', async (_name, over) => {
    await assertFails(setDoc(doc(memberDb(), 'setlists/n1'), setlistData(over)));
  });

  it('denies viewer even with valid new fields', async () => {
    await assertFails(
      setDoc(
        doc(viewerDb(), 'setlists/n1'),
        setlistData({ createdBy: 'v1', updatedBy: 'v1', rehearsalAt: at('2026-11-19T22:30:00Z'), origin: 'teste' }),
      ),
    );
  });

  it('allows update adding rehearsalAt and origin (culto de updateData é 2026-11-29)', async () => {
    await assertSucceeds(
      updateDoc(existing(memberDb()), updateData({ rehearsalAt: at('2026-11-26T22:30:00Z'), origin: 'producao' })),
    );
  });

  it('allows update of a legacy setlist without the new fields', async () => {
    await assertSucceeds(updateDoc(existing(memberDb()), updateData()));
  });

  it('denies update with rehearsalAt outside the window of the new date', async () => {
    await assertFails(
      updateDoc(existing(memberDb()), updateData({ rehearsalAt: at('2026-11-22T02:59:59Z') })),
    );
  });
});
```

- [ ] **Step 2: Escrever os testes de `pushDevices`, `avisosEnviados` e `config/push`**

Crie `tests/rules/push.rules.test.ts`:

```ts
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
```

- [ ] **Step 3: Rodar as Rules e ver o estado inicial**

Run (Windows sem Java): `docker compose run --rm --no-deps emulators npm run test:rules`
Run (host com Node 22 e Java 21): `npm run test:rules`
Expected: os casos positivos de `rehearsalAt` e `origin` (`allows member with ...`, `allows update adding ...`) FALHAM, porque `hasOnly` ainda recusa os campos. Os casos negativos e os de `push.rules.test.ts` PASSAM (já são negados). Se os positivos passarem, pare: a regra já aceita os campos e o teste não prova nada.

- [ ] **Step 4: Alterar `firestore.rules`**

4a. Em `validSetlist`, troque a lista `hasOnly` por:

Old:
```
        && data.keys().hasOnly([
          'date', 'label', 'items', 'expiresAt',
          'createdBy', 'createdAt', 'updatedBy', 'updatedAt'
        ])
```
New:
```
        && data.keys().hasOnly([
          'date', 'label', 'items', 'expiresAt',
          'createdBy', 'createdAt', 'updatedBy', 'updatedAt',
          'rehearsalAt', 'origin'
        ])
```
(`hasAll` não muda: os campos novos são opcionais.)

4b. Ainda em `validSetlist`, troque o fim da função e acrescente `validRehearsal` logo depois dela:

Old:
```
        && data.updatedBy == request.auth.uid
        && data.updatedAt == request.time;
    }

    match /users/{uid} {
```
New:
```
        && data.updatedBy == request.auth.uid
        && data.updatedAt == request.time
        && (!data.keys().hasAny(['rehearsalAt']) || validRehearsal(data))
        && (!data.keys().hasAny(['origin']) || data.origin in ['producao', 'teste']);
    }

    // Ensaio: de 00:00 de (date - 7 dias) até 00:00 do dia seguinte ao culto (exclusivo), em Brasília (UTC-3, sem horário de verão).
    // Em UTC, 00:00 de Brasília = 03:00 do mesmo dia.
    function validRehearsal(data) {
      let day = data.date.split('-');
      let base = timestamp.date(int(day[0]), int(day[1]), int(day[2]));
      return data.rehearsalAt is timestamp
        && data.rehearsalAt >= base + duration.value(3, 'h') - duration.value(168, 'h')
        && data.rehearsalAt < base + duration.value(27, 'h');
    }

    match /users/{uid} {
```

- [ ] **Step 5: Rodar as Rules até ficarem verdes**

Run: `docker compose run --rm --no-deps emulators npm run test:rules` (ou `npm run test:rules`)
Expected: todos os testes de `setlists`, `setlistUsage`, `storage` e `firestore` passam, incluindo os casos de limite (`2026-11-15T03:00:00Z` aceito, `02:59:59Z` recusado, `2026-11-23T02:59:59Z` aceito, `03:00:00Z` recusado) e `push.rules.test.ts` inteiro.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules/setlists.rules.test.ts tests/rules/push.rules.test.ts
git commit -m "feat(rules): aceita rehearsalAt e origin no repertório e mantém push fechado ao cliente"
```

---

### Task 3: Tipos, identificadores e fake de teste do módulo `push/`

**Files:**
- Create: `apps/functions/src/push/types.ts`
- Create: `apps/functions/src/push/token.ts`
- Create: `apps/functions/src/push/token.test.ts`
- Create: `apps/functions/src/push/fakeDeps.ts`

**Interfaces:**
- Consumes: `RoleDeps` de `apps/functions/src/auth/requireRole.ts`; `Role` de `apps/functions/src/roles.ts`.
- Produces (usados pelas Tarefas 4 a 6):
  - `token.ts`: `ORIGINS`, `type Origin`, `SITE_BASE: Record<Origin, string>`, `parseOrigin(value: unknown): Origin | null`, `deviceOrigin(value: unknown): Origin` (ausente ou desconhecida = `'producao'`), `deviceId(token: string): string` (SHA-256 hex), `shortHash(token: string): string` (8 caracteres).
  - `types.ts`: `PushMessage`, `SendResult`, `DeviceRecord`, `PushDeps` (ver bloco abaixo).
  - `fakeDeps.ts`: `fakeDeps(opts?)` e `device(token, uid, origin?)` para os testes.

`PushDeps` (em `types.ts`):
```ts
export type PushDeps = RoleDeps & {
  getDeviceOwner(id: string): Promise<string | null>;
  writeDevice(id: string, data: Record<string, unknown>): Promise<void>; // merge
  deleteDevices(ids: string[]): Promise<void>;
  listDevices(): Promise<DeviceRecord[]>;
  getUserRoles(uids: string[]): Promise<Map<string, Role>>;
  sendBatch(tokens: string[], message: PushMessage): Promise<SendResult[]>; // até 500, um resultado por token, na mesma ordem
  readPushConfig(): Promise<{ enabled?: unknown } | null>;
  now(): Date;
};
```

- [ ] **Step 1: Escrever o teste de `token.ts`**

Crie `apps/functions/src/push/token.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deviceId, deviceOrigin, parseOrigin, SITE_BASE, shortHash } from './token';

describe('parseOrigin', () => {
  it('accepts producao and teste', () => {
    expect(parseOrigin('producao')).toBe('producao');
    expect(parseOrigin('teste')).toBe('teste');
  });

  it.each(['Producao', 'outro', '', null, undefined, 1])('rejects %s', (value) => {
    expect(parseOrigin(value)).toBeNull();
  });
});

describe('deviceOrigin', () => {
  it('treats a missing or unknown origin as producao', () => {
    expect(deviceOrigin(undefined)).toBe('producao');
    expect(deviceOrigin('lixo')).toBe('producao');
    expect(deviceOrigin('teste')).toBe('teste');
  });
});

describe('deviceId and shortHash', () => {
  it('uses the SHA-256 hex of the token as document id', () => {
    expect(deviceId('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('keeps 8 characters for logs', () => {
    expect(shortHash('abc')).toBe('ba7816bf');
  });
});

describe('SITE_BASE', () => {
  it('maps each origin to its site', () => {
    expect(SITE_BASE.producao).toBe('https://louvor-hajaluz.web.app');
    expect(SITE_BASE.teste).toBe('https://louvor-hajaluz-teste.web.app');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- src/push/token.test.ts`
Expected: FAIL com `Cannot find module './token'` (ou equivalente).

- [ ] **Step 3: Criar `types.ts`**

Crie `apps/functions/src/push/types.ts` com o bloco `PushDeps` da seção Interfaces, mais:

```ts
import type { RoleDeps } from '../auth/requireRole';
import type { Role } from '../roles';

/** Mensagem com link absoluto (o domínio depende da origem do grupo de aparelhos). */
export type PushMessage = { title: string; body: string; link: string; tag: string };

export type SendResult = { ok: true } | { ok: false; code: string };

export type DeviceRecord = { id: string; uid: string; token: string; origin: unknown };
```
(Acrescente o `export type PushDeps = RoleDeps & { ... }` completo com os comentários de `writeDevice` e `sendBatch` da seção Interfaces.)

- [ ] **Step 4: Implementar `token.ts`**

Crie `apps/functions/src/push/token.ts`:

```ts
import { createHash } from 'node:crypto';

export const ORIGINS = ['producao', 'teste'] as const;
export type Origin = (typeof ORIGINS)[number];

export const SITE_BASE: Record<Origin, string> = {
  producao: 'https://louvor-hajaluz.web.app',
  teste: 'https://louvor-hajaluz-teste.web.app',
};

export function parseOrigin(value: unknown): Origin | null {
  return ORIGINS.find((origin) => origin === value) ?? null;
}

// Aparelho sem origem gravada (ou com valor desconhecido) é de produção.
export function deviceOrigin(value: unknown): Origin {
  return parseOrigin(value) ?? 'producao';
}

/** Id do documento em `pushDevices`: SHA-256 em hex do token. */
export function deviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Identificador curto do aparelho para logs (nunca o token). */
export function shortHash(token: string): string {
  return deviceId(token).slice(0, 8);
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- src/push/token.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 6: Criar o fake em memória `fakeDeps.ts`**

Crie `apps/functions/src/push/fakeDeps.ts` (helper de teste; não é importado pelo `index.ts`, então não entra no build):

```ts
import type { Role } from '../roles';
import { deviceId } from './token';
import type { DeviceRecord, PushDeps, PushMessage, SendResult } from './types';

export type FakeOptions = {
  roles?: Record<string, Role>;
  devices?: DeviceRecord[];
  config?: { enabled?: unknown } | null;
  /** token -> código de erro que o envio devolve para ele */
  failures?: Record<string, string>;
};

export const FAKE_NOW = new Date('2026-11-21T12:00:00Z');

/** Aparelho pronto para `devices`, com o id derivado do token. */
export const device = (token: string, uid: string, origin?: string): DeviceRecord => ({
  id: deviceId(token),
  uid,
  token,
  origin,
});

export function fakeDeps(opts: FakeOptions = {}) {
  const devices = new Map<string, Record<string, unknown>>(
    (opts.devices ?? []).map((d) => [d.id, { uid: d.uid, token: d.token, origin: d.origin }]),
  );
  const roles = new Map<string, Role>(Object.entries(opts.roles ?? {}));
  const clock = { now: FAKE_NOW };
  const batches: Array<{ tokens: string[]; message: PushMessage }> = [];

  const deps: PushDeps = {
    getUserRole: async (uid) => roles.get(uid),
    getDeviceOwner: async (id) => {
      const owner = devices.get(id)?.uid;
      return typeof owner === 'string' ? owner : null;
    },
    writeDevice: async (id, data) => {
      devices.set(id, { ...devices.get(id), ...data });
    },
    deleteDevices: async (ids) => {
      for (const id of ids) devices.delete(id);
    },
    listDevices: async () =>
      [...devices].map(([id, d]) => ({
        id,
        uid: String(d.uid),
        token: String(d.token),
        origin: d.origin,
      })),
    getUserRoles: async (uids) =>
      new Map(uids.filter((uid) => roles.has(uid)).map((uid) => [uid, roles.get(uid) as Role])),
    sendBatch: async (tokens, message) => {
      batches.push({ tokens, message });
      return tokens.map((token): SendResult => {
        const code = opts.failures?.[token];
        return code ? { ok: false, code } : { ok: true };
      });
    },
    readPushConfig: async () => opts.config ?? null,
    now: () => clock.now,
  };

  return { deps, devices, batches, clock };
}
```

- [ ] **Step 7: Conferir tipos**

Run: `npm run typecheck -w @cifras/functions`
Expected: sem erros. (Os testes das Tarefas 4 e 5 exercitam o fake; aqui a prova é o typecheck.)

- [ ] **Step 8: Commit**

```bash
git add apps/functions/src/push/types.ts apps/functions/src/push/token.ts apps/functions/src/push/token.test.ts apps/functions/src/push/fakeDeps.ts
git commit -m "feat(functions): tipos, id de aparelho e fake de teste do módulo push"
```

---

### Task 4: Auxiliar de envio `sendToDevices`

**Files:**
- Create: `apps/functions/src/push/send.test.ts`
- Create: `apps/functions/src/push/send.ts`

**Interfaces:**
- Consumes: `PushDeps`, `PushMessage`, `DeviceRecord` de `types.ts`; `ORIGINS`, `SITE_BASE`, `deviceOrigin`, `shortHash`, `type Origin` de `token.ts`; `device`, `fakeDeps`, `FAKE_NOW` de `fakeDeps.ts` (nos testes).
- Produces:
  ```ts
  export const BATCH_SIZE = 500;
  export type SendInput = {
    title: string; body: string;
    link: string;            // caminho do site, começando por "/"; o domínio vem da origem do aparelho
    tag: string;
    origin?: Origin;         // sem valor: todas as origens
    onlyUid?: string;        // só os aparelhos deste uid
    excludeUid?: string;     // deixa de fora os aparelhos deste uid
    respectSwitch: boolean;  // true: config/push.enabled === false bloqueia
  };
  export type SendOutcome = { sent: number; failed: number; pruned: number; unauthorizedRemoved: number; blocked: boolean };
  export async function sendToDevices(deps: PushDeps, input: SendInput): Promise<SendOutcome>;
  ```

Regras de implementação, na ordem: valida `link` (começa com `/` e não com `//`, senão `Error('push link must be a site path')`); se `respectSwitch` e `config.enabled === false`, devolve `blocked: true` sem enviar nem apagar; lista os aparelhos e filtra por `excludeUid`, `onlyUid` e `origin` (`deviceOrigin`); busca os papéis de todos os `uid` distintos; aparelho cujo papel não é `member` nem `admin` entra em `stale` e é apagado; os demais são agrupados por origem (na ordem de `ORIGINS`), enviados em lotes de `BATCH_SIZE` com `link = SITE_BASE[origin] + input.link`; resultado `ok` soma em `sent`; código de poda vai para `toPrune` (com `device.id`); outro erro soma em `failed`; ao fim, apaga `toPrune` e loga só contagens e `shortHash`.

- [ ] **Step 1: Escrever os testes**

Crie `apps/functions/src/push/send.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceId } from './token';
import { device, fakeDeps } from './fakeDeps';
import { sendToDevices, type SendInput } from './send';

const BASE: SendInput = {
  title: 'Novo repertório',
  body: 'Domingo',
  link: '/repertorios/r1',
  tag: 'rep-r1',
  respectSwitch: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendToDevices: quem recebe', () => {
  it('sends to member and admin devices, one multicast per origin, with the link of each origin', async () => {
    const { deps, batches } = fakeDeps({
      roles: { m1: 'member', a1: 'admin' },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'teste')],
    });

    const out = await sendToDevices(deps, BASE);

    expect(out).toEqual({ sent: 2, failed: 0, pruned: 0, unauthorizedRemoved: 0, blocked: false });
    expect(batches).toEqual([
      {
        tokens: ['t1'],
        message: { title: 'Novo repertório', body: 'Domingo', tag: 'rep-r1', link: 'https://louvor-hajaluz.web.app/repertorios/r1' },
      },
      {
        tokens: ['t2'],
        message: { title: 'Novo repertório', body: 'Domingo', tag: 'rep-r1', link: 'https://louvor-hajaluz-teste.web.app/repertorios/r1' },
      },
    ]);
  });

  it('treats a device without origin as producao', async () => {
    const { deps, batches } = fakeDeps({ roles: { m1: 'member' }, devices: [device('t1', 'm1')] });

    await sendToDevices(deps, BASE);

    expect(batches[0]?.message.link).toBe('https://louvor-hajaluz.web.app/repertorios/r1');
  });

  it('origin filter sends only to devices of that origin', async () => {
    const { deps, batches } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
    });

    const out = await sendToDevices(deps, { ...BASE, origin: 'teste' });

    expect(out.sent).toBe(1);
    expect(batches.flatMap((b) => b.tokens)).toEqual(['t2']);
  });

  it('excludeUid leaves out the devices of that user', async () => {
    const { deps, batches } = fakeDeps({
      roles: { m1: 'member', a1: 'admin' },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    await sendToDevices(deps, { ...BASE, excludeUid: 'm1' });

    expect(batches.flatMap((b) => b.tokens)).toEqual(['t2']);
  });

  it('deletes devices of users who are no longer member or admin, and does not send to them', async () => {
    const { deps, devices, batches } = fakeDeps({
      roles: { m1: 'member', v1: 'viewer' },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'v1', 'producao')],
    });

    const out = await sendToDevices(deps, BASE);

    expect(out).toMatchObject({ sent: 1, unauthorizedRemoved: 1 });
    expect(batches.flatMap((b) => b.tokens)).toEqual(['t1']);
    expect([...devices.keys()]).toEqual([deviceId('t1')]);
  });
});

describe('sendToDevices: lotes e poda', () => {
  it('splits tokens into batches of 500', async () => {
    const many = Array.from({ length: 1001 }, (_, i) => device(`t${i}`, 'm1', 'producao'));
    const { deps, batches } = fakeDeps({ roles: { m1: 'member' }, devices: many });

    const out = await sendToDevices(deps, BASE);

    expect(batches.map((b) => b.tokens.length)).toEqual([500, 500, 1]);
    expect(out.sent).toBe(1001);
  });

  it('prunes only not-registered and invalid-token errors, keeps the device on other errors', async () => {
    const { deps, devices } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('t1', 'm1'), device('t2', 'm1'), device('t3', 'm1')],
      failures: {
        t1: 'messaging/registration-token-not-registered',
        t2: 'messaging/invalid-registration-token',
        t3: 'messaging/internal-error',
      },
    });

    const out = await sendToDevices(deps, BASE);

    expect(out).toMatchObject({ sent: 0, failed: 1, pruned: 2 });
    expect([...devices.keys()]).toEqual([deviceId('t3')]);
  });
});

describe('sendToDevices: interruptor', () => {
  it('blocks everything when config/push is disabled and respectSwitch is true', async () => {
    const { deps, batches, devices } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });

    const out = await sendToDevices(deps, BASE);

    expect(out).toEqual({ sent: 0, failed: 0, pruned: 0, unauthorizedRemoved: 0, blocked: true });
    expect(batches).toEqual([]);
    expect(devices.size).toBe(1);
  });

  it('sends when there is no config/push doc (switch on by default)', async () => {
    const { deps } = fakeDeps({ roles: { m1: 'member' }, devices: [device('t1', 'm1')], config: null });

    expect(await sendToDevices(deps, BASE)).toMatchObject({ sent: 1, blocked: false });
  });

  it('ignores the disabled switch when respectSwitch is false', async () => {
    const { deps } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('t1', 'm1')],
      config: { enabled: false },
    });

    expect(await sendToDevices(deps, { ...BASE, respectSwitch: false })).toMatchObject({ sent: 1, blocked: false });
  });
});

describe('sendToDevices: entrada e logs', () => {
  it.each(['repertorios/r1', '//evil.example/x'])('rejects link %s', async (link) => {
    const { deps } = fakeDeps({ roles: { m1: 'member' }, devices: [device('t1', 'm1')] });

    await expect(sendToDevices(deps, { ...BASE, link })).rejects.toThrow('push link must be a site path');
  });

  it('logs carry counts and short hashes, never the token', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { deps } = fakeDeps({
      roles: { m1: 'member' },
      devices: [device('segredo-token', 'm1')],
      failures: { 'segredo-token': 'messaging/registration-token-not-registered' },
    });

    await sendToDevices(deps, BASE);

    expect(info).toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('segredo-token');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- src/push/send.test.ts`
Expected: FAIL com `Cannot find module './send'`.

- [ ] **Step 3: Implementar `send.ts`**

Crie `apps/functions/src/push/send.ts`, seguindo as regras de implementação da seção Interfaces (exports e assinaturas exatos). Pontos que não são óbvios:
- `matches(d, input)` é uma função auxiliar do próprio arquivo: `excludeUid`, depois `onlyUid`, depois `origin` com `deviceOrigin`.
- Papel do aparelho: `const role = roles.get(d.uid)`; é remetente se `role === 'member' || role === 'admin'`.
- Como o `tsconfig` tem `noUncheckedIndexedAccess`, use `const device = batch[i]; if (!device) return;` dentro do `forEach`.
- Log: `console.info('push: send', { sent, failed, pruned, unauthorizedRemoved })` e, para cada poda, `console.info(\`push: pruned ${shortHash(device.token)} (${result.code})\`)`. Nada de token.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- src/push/send.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/send.ts apps/functions/src/push/send.test.ts
git commit -m "feat(functions): auxiliar sendToDevices com lotes, poda e interruptor"
```

---

### Task 5: Callables de lógica: `registerDevice`, `unregisterDevice`, `sendTestPush`

**Files:**
- Create: `apps/functions/src/push/devices.test.ts`
- Create: `apps/functions/src/push/devices.ts`

**Interfaces:**
- Consumes: `PushDeps` de `types.ts`; `deviceId`, `parseOrigin` de `token.ts`; `sendToDevices` de `send.ts`; `requireRole` de `../auth/requireRole`; `HttpsError` de `firebase-functions/v2/https`; `device`, `fakeDeps` de `fakeDeps.ts` (nos testes).
- Produces:
  ```ts
  export async function registerDevice(deps: PushDeps, uid: string | undefined, data: { token?: unknown; origin?: unknown }): Promise<{ ok: true }>;
  export async function unregisterDevice(deps: PushDeps, uid: string | undefined, data: { token?: unknown }): Promise<{ ok: true }>;
  export async function sendTestPush(deps: PushDeps, uid: string | undefined): Promise<{ sent: number; failed: number }>;
  ```

Regras: `registerDevice` chama `requireRole(deps, uid, ['member', 'admin'])`, valida token (string não vazia, senão `invalid-argument` "Invalid token.") e origem (`parseOrigin`, senão `invalid-argument` "Invalid origin."), calcula `deviceId(token)`, lê o dono com `getDeviceOwner`, e grava com `writeDevice(id, { uid, token, origin, lastSeenAt: now, ...(owner === null ? { createdAt: now } : {}) })`. Depois do `requireRole`, use `uid as string` (o `requireRole` já garante). `unregisterDevice` exige `uid` (senão `unauthenticated`, "Login required."), **sem** checar papel, e apaga só se o dono for o `uid`. `sendTestPush` chama `requireRole(deps, uid, ['member', 'admin'])` e `sendToDevices` com `title: 'Aviso de teste'`, `body: 'Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.'`, `link: '/'`, `tag: 'aviso-teste'`, `onlyUid: uid`, `respectSwitch: false`, devolvendo só `{ sent, failed }`.

- [ ] **Step 1: Escrever os testes**

Crie `apps/functions/src/push/devices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { device, fakeDeps } from './fakeDeps';
import { registerDevice, sendTestPush, unregisterDevice } from './devices';
import { deviceId } from './token';

describe('registerDevice', () => {
  it('denies viewer and anonymous', async () => {
    const { deps } = fakeDeps({ roles: { v1: 'viewer' } });
    await expect(registerDevice(deps, 'v1', { token: 't', origin: 'producao' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(registerDevice(deps, undefined, { token: 't', origin: 'producao' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it.each([
    ['origin Producao', { token: 't', origin: 'Producao' }],
    ['origin ausente', { token: 't' }],
    ['token vazio', { token: '', origin: 'producao' }],
    ['token não é texto', { token: 1, origin: 'producao' }],
  ])('rejects %s with invalid-argument', async (_name, data) => {
    const { deps } = fakeDeps({ roles: { m1: 'member' } });
    await expect(registerDevice(deps, 'm1', data)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('stores the device under sha256(token) with uid, token, origin, createdAt and lastSeenAt', async () => {
    const { deps, devices } = fakeDeps({ roles: { m1: 'member' } });

    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'teste' });

    expect(devices.get(deviceId('tok-A'))).toMatchObject({ uid: 'm1', token: 'tok-A', origin: 'teste' });
    expect(devices.get(deviceId('tok-A'))?.createdAt).toEqual(new Date('2026-11-21T12:00:00Z'));
    expect(devices.get(deviceId('tok-A'))?.lastSeenAt).toEqual(new Date('2026-11-21T12:00:00Z'));
  });

  it('same token twice keeps one record, keeps createdAt and updates lastSeenAt', async () => {
    const { deps, devices, clock } = fakeDeps({ roles: { m1: 'member' } });
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });
    const createdAt = devices.get(deviceId('tok-A'))?.createdAt;

    clock.now = new Date('2026-11-21T13:00:00Z');
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });

    expect(devices.size).toBe(1);
    expect(devices.get(deviceId('tok-A'))?.createdAt).toEqual(createdAt);
    expect(devices.get(deviceId('tok-A'))?.lastSeenAt).toEqual(new Date('2026-11-21T13:00:00Z'));
  });

  it('token previously owned by another uid moves to the new uid', async () => {
    const { deps, devices } = fakeDeps({ roles: { m1: 'member', a1: 'admin' } });
    await registerDevice(deps, 'm1', { token: 'tok-A', origin: 'producao' });

    await registerDevice(deps, 'a1', { token: 'tok-A', origin: 'producao' });

    expect(devices.size).toBe(1);
    expect(devices.get(deviceId('tok-A'))?.uid).toBe('a1');
  });
});

describe('unregisterDevice', () => {
  it('deletes the caller own device, any role', async () => {
    const { deps, devices } = fakeDeps({ roles: { v1: 'viewer' }, devices: [device('tok-V', 'v1', 'producao')] });

    await expect(unregisterDevice(deps, 'v1', { token: 'tok-V' })).resolves.toEqual({ ok: true });

    expect(devices.size).toBe(0);
  });

  it('does not delete a device of another uid', async () => {
    const { deps, devices } = fakeDeps({ devices: [device('tok-X', 'm2', 'producao')] });

    await unregisterDevice(deps, 'm1', { token: 'tok-X' });

    expect(devices.size).toBe(1);
  });

  it('is idempotent when the device does not exist', async () => {
    const { deps } = fakeDeps();

    await expect(unregisterDevice(deps, 'm1', { token: 'nunca-existiu' })).resolves.toEqual({ ok: true });
  });

  it('requires login', async () => {
    const { deps } = fakeDeps();

    await expect(unregisterDevice(deps, undefined, { token: 'x' })).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('sendTestPush', () => {
  it('denies viewer', async () => {
    const { deps } = fakeDeps({ roles: { v1: 'viewer' }, devices: [device('t1', 'v1')] });

    await expect(sendTestPush(deps, 'v1')).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('sends only to the caller devices, ignores the disabled switch, returns counts', async () => {
    const { deps, batches } = fakeDeps({
      roles: { m1: 'member', m2: 'member' },
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste'), device('t3', 'm2', 'producao')],
      config: { enabled: false },
    });

    const result = await sendTestPush(deps, 'm1');

    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(batches.flatMap((b) => b.tokens).sort()).toEqual(['t1', 't2']);
    expect(batches.map((b) => b.message.title)).toEqual(['Aviso de teste', 'Aviso de teste']);
  });

  it('returns only counts, never tokens', async () => {
    const { deps } = fakeDeps({ roles: { m1: 'member' }, devices: [device('segredo-1', 'm1')] });

    const result = await sendTestPush(deps, 'm1');

    expect(JSON.stringify(result)).not.toContain('segredo-1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- src/push/devices.test.ts`
Expected: FAIL com `Cannot find module './devices'`.

- [ ] **Step 3: Implementar `devices.ts`**

Crie `apps/functions/src/push/devices.ts` com as três funções exatas da seção Interfaces e as regras acima. Mensagens de erro: `'Invalid token.'`, `'Invalid origin.'`, `'Login required.'`. Não há `now` nas funções: use `deps.now()`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- src/push/devices.test.ts`
Expected: PASS, todos os casos.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/devices.ts apps/functions/src/push/devices.test.ts
git commit -m "feat(functions): registerDevice, unregisterDevice e sendTestPush com testes"
```

---

### Task 6: Adaptador do Firebase e callables no `index.ts`

**Files:**
- Create: `apps/functions/src/push/adminDeps.ts`
- Modify: `apps/functions/src/index.ts` (imports e três exports, no fim do arquivo)

**Interfaces:**
- Consumes: `PushDeps` de `types.ts`; `ROLES`, `type Role` de `../roles`; `registerDevice`, `unregisterDevice`, `sendTestPush` de `devices.ts`; `deps` (já existente em `index.ts`, do tipo `UserDeps`).
- Produces: `createPushDeps(): PushDeps`; callables `registerDevice`, `unregisterDevice`, `sendTestPush` exportadas por `index.ts`.

Sem teste unitário: o adaptador só fala com o Firestore e o FCM, e o fake já cobre a lógica. A prova é typecheck, build e o teste no aparelho da #99. Se `webpush.notification` recusar `tag` no tipo instalado, confira `WebpushNotification` em `node_modules/firebase-admin/lib/messaging/messaging-api.d.ts`, sem mudar a lógica.

- [ ] **Step 1: Criar `adminDeps.ts`**

Crie `apps/functions/src/push/adminDeps.ts`:

```ts
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { ROLES, type Role } from '../roles';
import type { DeviceRecord, PushDeps, PushMessage, SendResult } from './types';

// Limite de referências por getAll (igual a statsDeps) e de operações por batch do Firestore.
const GET_ALL_BLOCK = 300;
const DELETE_BLOCK = 500;

/** Implementação real de PushDeps com firebase-admin. Sem lógica: só traduz chamadas. */
export function createPushDeps(): PushDeps {
  return {
    getUserRole: async (uid) => (await getFirestore().doc(`users/${uid}`).get()).data()?.role,
    getDeviceOwner: async (id) => {
      const owner = (await getFirestore().doc(`pushDevices/${id}`).get()).data()?.uid;
      return typeof owner === 'string' ? owner : null;
    },
    writeDevice: async (id, data) => {
      await getFirestore().doc(`pushDevices/${id}`).set(data, { merge: true });
    },
    deleteDevices: async (ids) => {
      const db = getFirestore();
      for (let start = 0; start < ids.length; start += DELETE_BLOCK) {
        const batch = db.batch();
        for (const id of ids.slice(start, start + DELETE_BLOCK)) {
          batch.delete(db.doc(`pushDevices/${id}`));
        }
        await batch.commit();
      }
    },
    listDevices: async (): Promise<DeviceRecord[]> =>
      (await getFirestore().collection('pushDevices').get()).docs.map((d) => ({
        id: d.id,
        uid: String(d.data().uid ?? ''),
        token: String(d.data().token ?? ''),
        origin: d.data().origin,
      })),
    getUserRoles: async (uids) => {
      const db = getFirestore();
      const roles = new Map<string, Role>();
      for (let start = 0; start < uids.length; start += GET_ALL_BLOCK) {
        const block = uids.slice(start, start + GET_ALL_BLOCK);
        const snaps = await db.getAll(...block.map((uid) => db.doc(`users/${uid}`)));
        for (const snap of snaps) {
          const role = ROLES.find((r) => r === snap.data()?.role);
          if (role) roles.set(snap.id, role);
        }
      }
      return roles;
    },
    sendBatch: async (tokens, message: PushMessage): Promise<SendResult[]> => {
      const response = await getMessaging().sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        webpush: {
          notification: { tag: message.tag },
          fcmOptions: { link: message.link },
        },
      });
      return response.responses.map((r): SendResult =>
        r.success ? { ok: true } : { ok: false, code: r.error?.code ?? 'unknown' },
      );
    },
    readPushConfig: async () => (await getFirestore().doc('config/push').get()).data() ?? null,
    now: () => new Date(),
  };
}
```

- [ ] **Step 2: Acrescentar as callables em `index.ts`**

Em `apps/functions/src/index.ts`, acrescente aos imports (junto dos demais de `./stats/` e `./songs/`):

```ts
import { createPushDeps } from './push/adminDeps';
import {
  registerDevice as registerDeviceLogic,
  sendTestPush as sendTestPushLogic,
  unregisterDevice as unregisterDeviceLogic,
} from './push/devices';
```

E no fim do arquivo, depois de `setUserRole`:

```ts
const pushDeps = createPushDeps();

export const registerDevice = onCall({ region: REGION }, (request) =>
  registerDeviceLogic(
    { ...pushDeps, ...deps },
    request.auth?.uid,
    (request.data ?? {}) as Record<string, unknown>,
  ),
);

export const unregisterDevice = onCall({ region: REGION }, (request) =>
  unregisterDeviceLogic(
    { ...pushDeps, ...deps },
    request.auth?.uid,
    (request.data ?? {}) as Record<string, unknown>,
  ),
);

export const sendTestPush = onCall({ region: REGION }, (request) =>
  sendTestPushLogic({ ...pushDeps, ...deps }, request.auth?.uid),
);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @cifras/functions`
Expected: sem erros. Se `{ ...pushDeps, ...deps }` reclamar do tipo de `getUserRole`, o `RoleDeps` aceita `Promise<unknown>`, então o problema é outro: leia a mensagem e não force com `as`.

- [ ] **Step 4: Build e testes das Functions**

Run: `npm run build -w @cifras/functions`
Expected: tsup gera `apps/functions/lib/index.js` sem erro, e o bundle tem `registerDevice`, `unregisterDevice` e `sendTestPush` nos exports.
Run: `npm test -w @cifras/functions`
Expected: todos os arquivos `src/**/*.test.ts` passam (os antigos e os de `push/`).

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/adminDeps.ts apps/functions/src/index.ts
git commit -m "feat(functions): exporta registerDevice, unregisterDevice e sendTestPush"
```

---

### Task 7: Verificação final da entrega

**Files:** nenhum (só comandos). Esta tarefa roda depois dos grupos A e B.

- [ ] **Step 1: Suíte completa**

Run: `npm test`
Expected: todos os workspaces verdes.

- [ ] **Step 2: Lint, typecheck e formato**

Run: `npm run lint`
Expected: sem erros.
Run: `npm run typecheck`
Expected: sem erros.
Run: `npm run format:check`
Expected: `All matched files use Prettier code style!`. Se falhar só em arquivos desta entrega, rode `npx prettier --write <arquivos>` nesses arquivos e repita.

- [ ] **Step 3: Build e harness**

Run: `npm run build -w @cifras/functions`
Expected: build sem erro.
Run: `npm run test:harness`
Expected: verde (inclusive `docs/sistema.md has at most 350 lines`).

- [ ] **Step 4: Rules**

Run (Windows sem Java): `docker compose run --rm --no-deps emulators npm run test:rules`
Run (host com Java 21): `npm run test:rules`
Expected: verde, com os casos positivos e negativos de `setlists` e o bloco de `push.rules.test.ts`.

- [ ] **Step 5: Escopo do diff**

Run: `git status --short` e `git diff --stat origin/develop`
Expected: só estes arquivos, e nenhum de `apps/web`, `.claude/`, `.github/`, `firebase.json`, `AGENTS.md`, `CLAUDE.md`, PDF, `.env` ou `.superpowers/`:
- `docs/sistema.md`, `docs/superpowers/specs/2026-11-16-repertorios-design.md`, `docs/superpowers/plans/2026-11-21-98-aviso-backend.md`
- `firestore.rules`, `tests/rules/setlists.rules.test.ts`, `tests/rules/push.rules.test.ts`
- `apps/functions/src/index.ts`, `apps/functions/src/push/*`

- [ ] **Step 6: Critérios de aceite da #98**

Conferir um a um com a evidência acima:
1. [I] docs: spec §3 e `sistema.md` mostram o push reaberto com link para a #85; escala e comentários seguem fora.
2. [U] `registerDevice` (Tarefa 5, 4 testes de registro).
3. [U] `origin` aceita só `producao`/`teste` (Tarefa 5 e Tarefa 3).
4. [U] `unregisterDevice` (Tarefa 5).
5. [U] `sendTestPush` com interruptor desligado (Tarefa 5).
6. [U] auxiliar: lotes de 500, poda, papel, interruptor (Tarefa 4).
7. [U] logs e respostas sem token (Tarefa 4 e Tarefa 5).
8. [R] cliente sem acesso a `pushDevices`, `avisosEnviados`, `config/push` (Tarefa 2).
9. [R] `setlists` com `rehearsalAt` e `origin` opcionais (Tarefa 2).

---

## Dúvidas em aberto (para o orquestrador)

1. **`int()` nas Rules.** A janela de `rehearsalAt` depende de converter `date` (string) em inteiros. Se o emulador não tiver `int()`, a Tarefa 2 para e volta ao tech-lead. Não há substituto escolhido aqui.
2. **`sendTestPush` atinge as duas origens.** O aviso de teste vai a todos os aparelhos do chamador, produção e teste, cada um com o link da própria origem. A alternativa é um parâmetro `origin` no callable. Mantive o padrão sem parâmetro.
3. **Frase da harness.** `.claude/agents/sistema.test.mjs` exige o texto literal "Notificação push, escala de músicos/líder, comentários" em `sistema.md`. O plano mantém a frase na nota histórica. Texto limpo exige mudar esse teste, que fica em `.claude/` (trava, merge da pessoa).
4. **Contrato com a #100.** O cliente remove a hora do ensaio omitindo o campo; `rehearsalAt: null` é recusado pelas Rules.
5. **Validação do token.** Só texto não vazio. A spec não fixa tamanho máximo; não acrescentei limite.
6. **Adaptador sem teste unitário.** `createPushDeps` é provado por typecheck, build e pelo teste de aparelho da #99, como `statsDeps`.
7. **`fakeDeps.ts` em `src/`.** É um helper de teste fora do `index.ts`; não entra no bundle. Se preferir outro lugar (`testing/`), muda só o import.
