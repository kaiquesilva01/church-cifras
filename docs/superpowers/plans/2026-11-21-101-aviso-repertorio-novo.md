# Aviso "Novo repertório" (#101) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Avisar os aparelhos de membros e admins quando um repertório chega a 4 louvores, uma vez por repertório, sem avisar quem gravou e respeitando o interruptor e a origem (produção ou teste).

**Architecture:** Gatilho Firestore v2 `onDocumentWritten('setlists/{setlistId}')` em `southamerica-east1`, exportado por `index.ts` como `onSetlistWritten`. A decisão é uma função pura sobre o `before` e o `after` (contagem de `items`). A idempotência fica numa marca `avisosEnviados/{setlistId}_novo` criada com `create()` antes do envio, e o envio reusa `sendToDevices` da #98. A lógica entra por `PushDeps & MarkerDeps` (mesmo padrão de `stats/`), testada com fakes em memória. Não há mudança em Rules nem em `firebase.json`. **Dependência: #100** (ver Global Constraints): esta entrega só entra na `develop` depois da #100.

**Tech Stack:** TypeScript 6.0.3 em `strict` + `noUncheckedIndexedAccess`; firebase-admin 14.5.1 (`firestore`, `messaging`); firebase-functions 7.4.0 (`firebase-functions/v2/firestore`, `onDocumentWritten` com `retry` padrão `false`, confirmado em `node_modules/firebase-functions/lib/v2/providers/firestore.js`); vitest 5.1.0; firebase-tools 15.36.0 (validador de `fieldOverrides`); `@firebase/rules-unit-testing` no emulador.

**Spec:** Não há spec próprio. Esta entrega implementa o critério 1 alterado pela pessoa em 21/11 16:50 (Análise Agêntica da [#101](https://github.com/kaiquesilva01/church-cifras/issues/101)), os critérios 2 a 7 do corpo da issue e as decisões gerais da [#85](https://github.com/kaiquesilva01/church-cifras/issues/85). Base: `c07b4a5` (#98, backend dos avisos). Repertórios: [docs/superpowers/specs/2026-11-16-repertorios-design.md](../specs/2026-11-16-repertorios-design.md).

## Global Constraints

- Dependência: #100 (o app web grava `origin` em `setlists`). A entrega só entra na `develop` depois da #100. Antes dela, `origin` ausente vale `producao` via `readSetlist`, o que é seguro: não há repertório de teste antes da #100.
- Região do gatilho: `southamerica-east1` (igual a `onArrangementWritten` em `songs/keys.ts`).
- Limiar: `NEW_SETLIST_MIN_ITEMS = 4`, contado por `items.length` do documento gravado (inclusive "Música removida").
- Aviso sai só quando `before` ausente ou com menos de 4 itens, e `after` com 4 ou mais. Repertório com menos de 4 nunca avisa.
- Marca: `avisosEnviados/{setlistId}_novo`, criada com `create()` **antes** do envio; campos exatos `setlistId`, `tipo: 'novo'`, `createdAt`, `expiresAt` = o maior valor entre agora + 60 dias e o `expiresAt` do repertório (a marca nunca vence antes do repertório; ver `markerExpiresAt`). `ALREADY_EXISTS` (código gRPC 6) → não envia.
- Título exato: `Novo repertório`. Corpo: `{rótulo} · {dia abreviado} {dd/mm}`, ex.: `Culto de domingo · dom 22/11`. Abreviações pt-BR: `dom seg ter qua qui sex sáb`.
- Dia da semana calculado com `Date.UTC` + `getUTCDay()`, sem depender do fuso da máquina.
- `link`: `/repertorios/{setlistId}` (o domínio vem da origem do aparelho, em `sendToDevices`). `tag`: `setlist-{setlistId}-novo`.
- `origin` do repertório: `producao` quando ausente ou desconhecido (`parseOrigin(x) ?? 'producao'`). Só aparelhos da mesma origem.
- `excludeUid`: `updatedBy` numa atualização; `createdBy` na criação. Vazio vira `undefined`.
- `respectSwitch: true` (`config/push.enabled === false` bloqueia).
- Falha de envio: loga com `setlistId` e `code` (nunca token nem mensagem completa do erro), não relança e não reenvia. Erro ao criar a marca que não seja `ALREADY_EXISTS` **propaga** e não envia.
- Gatilho com `retry: false` explícito (padrão já é `false` em firebase-functions 7.4.0).
- Logs só com contagens, ids de repertório e `shortHash` quando for preciso. Token nunca aparece em log, resposta ou mensagem de erro.
- Texto de UI e de aviso em pt-BR; identificadores em inglês. Commits: prefixo do tipo em inglês (Conventional Commits) e descrição em pt-BR, como no histórico do repo. Cada implementador acrescenta o trailer `Co-Authored-By:` com o nome do próprio modelo; o plano não fixa modelo.
- Não tocar: `apps/web`, `firestore.rules`, `firebase.json`, `.github/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, `cors.json`, `storage.rules`, `push/token.ts`, `push/send.ts`, `push/types.ts`, `push/adminDeps.ts`, `push/fakeDeps.ts`.
- Lembretes (#102) ficam fora.
- Testes primeiro: em cada tarefa o teste é escrito e visto falhando antes do código.

## Review Focus

1. Repertório com data inválida (`''`, `2026-02-31`, texto qualquer): não avisa e **não** cria a marca; deve ser `invalid`. Coberto na Tarefa 6 (`invalid`) e na Tarefa 1 (`formatCultoDate` retorna `null`).
2. Repertório que já avisou, esvaziado e enchido de novo, ou editado com 4 itens antes de a marca existir: a marca impede o segundo aviso. Coberto na Tarefa 6 (marca de envio anterior; sequência 3 → 4 → 3 → 4; `already-announced`).
3. Origem ausente ou desconhecida: vai para produção, sem erro. Coberto na Tarefa 1 (`readSetlist`) e na Tarefa 6 (origem `teste` só para aparelhos de teste).
4. Falha do FCM (indisponível) no meio do envio: só loga, não relança e não reenvia no próximo evento. Coberto na Tarefa 6 (`failed`).
5. Reentrega do mesmo evento (o Firestore pode entregar o mesmo `write` mais de uma vez): a segunda chamada não envia. Coberto na Tarefa 6 (reentrega) e na Tarefa 2 (`ALREADY_EXISTS`).

---

## File Structure

| Arquivo | Responsabilidade | Tarefa |
| --- | --- | --- |
| `apps/functions/src/push/newSetlist.ts` | Lógica pura: ler o snapshot, decidir o aviso, montar o texto e a mensagem | 1 |
| `apps/functions/src/push/newSetlist.test.ts` | Testes da lógica pura | 1 |
| `apps/functions/src/push/markers.ts` | Adaptador da marca `avisosEnviados` (`create` com `ALREADY_EXISTS`) | 2 |
| `apps/functions/src/push/markers.test.ts` | Testes do adaptador (Firestore mockado) | 2 |
| `firestore.indexes.json` | TTL em `avisosEnviados.expiresAt` | 3 |
| `docs/sistema.md` | Functions (gatilho), Dados (`avisosEnviados`, TTL), regra dos 4 louvores, pendências | 4 |
| `docs/deploy.md` | APIs Pub/Sub e Eventarc, IAM Eventarc Admin, conferência do TTL depois do deploy | 5 |
| `apps/functions/src/push/announce.ts` | Orquestra: decide, reserva a marca, envia, trata falhas | 6 |
| `apps/functions/src/push/announce.test.ts` | Testes da orquestração (fakes) | 6 |
| `apps/functions/src/push/setlistTrigger.ts` | Gatilho `onSetlistWritten` (`onDocumentWritten`) com as deps reais | 7 |
| `apps/functions/src/push/setlistTrigger.test.ts` | Testes da fiação do gatilho (opções e repasse de dados) | 7 |
| `apps/functions/src/index.ts` | Re-exporta `onSetlistWritten` (uma linha) | 7 |

Tarefas 1, 2, 3, 4 e 5 são independentes (arquivos disjuntos): podem rodar em paralelo. Tarefa 6 depende de 1 e 2. Tarefa 7 depende de 6. Tarefa 8 fecha a entrega.

---

### Task 1: Lógica pura do aviso (`newSetlist.ts`)

**Files:**
- Create: `apps/functions/src/push/newSetlist.ts`
- Test: `apps/functions/src/push/newSetlist.test.ts`

**Interfaces:**
- Consumes: `parseOrigin`, `Origin` de `./token`; `SendInput` de `./send` (já existentes).
- Produces:
  - `NEW_SETLIST_MIN_ITEMS = 4` (`number`)
  - `type SetlistSnapshot = { date: string; label: string; itemCount: number; origin: Origin; createdBy: string; updatedBy: string; expiresAt?: Date | undefined }`
  - `readSetlist(data: Record<string, unknown> | undefined): SetlistSnapshot | undefined`: `undefined` se `data` ausente; `itemCount` = `items.length` (0 se não for array); campos ausentes viram `''`; origem via `parseOrigin ?? 'producao'`; `expiresAt` via `toDate` (ver Step 3), `undefined` se ausente.
  - `shouldAnnounce(before: SetlistSnapshot | undefined, after: SetlistSnapshot | undefined): boolean`
  - `formatCultoDate(date: string): string | null`: `'dom 22/11'`, ou `null` se `date` não for `YYYY-MM-DD` real.
  - `buildNewSetlistMessage(setlistId: string, setlist: SetlistSnapshot, before: SetlistSnapshot | undefined): SendInput | null`: `null` se `formatCultoDate` falhar.

- [ ] **Step 1: Escrever os testes (falham)**

```ts
// apps/functions/src/push/newSetlist.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildNewSetlistMessage,
  formatCultoDate,
  readSetlist,
  shouldAnnounce,
  type SetlistSnapshot,
} from './newSetlist';

const snap = (itemCount: number, extra: Partial<SetlistSnapshot> = {}): SetlistSnapshot => ({
  date: '2026-11-22',
  label: 'Culto de domingo',
  itemCount,
  origin: 'producao',
  createdBy: 'a1',
  updatedBy: 'm1',
  ...extra,
});

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe('shouldAnnounce: a hora de avisar', () => {
  it.each([
    ['0 para 4', snap(0), snap(4), true],
    ['3 para 4', snap(3), snap(4), true],
    ['criação com 4', undefined, snap(4), true],
    ['criação com 5', undefined, snap(5), true],
    ['4 para 5', snap(4), snap(5), false],
    ['5 para 4', snap(5), snap(4), false],
    ['4 para 3', snap(4), snap(3), false],
    ['0 para 3', snap(0), snap(3), false],
    ['criação com 3', undefined, snap(3), false],
    ['exclusão (sem depois)', snap(4), undefined, false],
    ['só rótulo com 4 (antes 4)', snap(4), snap(4, { label: 'Outro' }), false],
    ['só hora ou tom com 3 (antes 3)', snap(3, { date: '2026-11-22' }), snap(3, { date: '2026-11-29' }), false],
  ])('%s', (_name, before, after, expected) => {
    expect(shouldAnnounce(before, after)).toBe(expected);
  });
});

describe('readSetlist', () => {
  it('conta items.length e lê a origem; ausente vira produção', () => {
    expect(readSetlist({ date: '2026-11-22', label: 'L', items: [{}, {}], createdBy: 'a', updatedBy: 'b' })).toEqual({
      date: '2026-11-22',
      label: 'L',
      itemCount: 2,
      origin: 'producao',
      createdBy: 'a',
      updatedBy: 'b',
    });
  });

  it('origem desconhecida vira produção; teste passa', () => {
    expect(readSetlist({ origin: 'outra', items: [] })?.origin).toBe('producao');
    expect(readSetlist({ origin: 'teste', items: [] })?.origin).toBe('teste');
  });

  it('lê expiresAt de Date ou de Timestamp; ausente é undefined', () => {
    const d = new Date('2027-01-31T03:00:00Z');
    expect(readSetlist({ items: [], expiresAt: d })?.expiresAt).toEqual(d);
    expect(readSetlist({ items: [], expiresAt: { toDate: () => d } })?.expiresAt).toEqual(d);
    expect(readSetlist({ items: [] })?.expiresAt).toBeUndefined();
  });

  it('sem items é zero; sem dados é undefined', () => {
    expect(readSetlist({ date: '2026-11-22' })?.itemCount).toBe(0);
    expect(readSetlist(undefined)).toBeUndefined();
  });
});

describe('formatCultoDate: dia da semana independe do fuso', () => {
  it('formata dia abreviado e dd/mm', () => {
    expect(formatCultoDate('2026-11-22')).toBe('dom 22/11');
    expect(formatCultoDate('2026-11-21')).toBe('sáb 21/11');
  });

  it.each(['Pacific/Kiritimati', 'America/Los_Angeles'])('mesmo resultado no fuso %s', (tz) => {
    process.env.TZ = tz;
    expect(formatCultoDate('2026-11-22')).toBe('dom 22/11');
  });

  it('recusa data que não existe ou fora do formato', () => {
    expect(formatCultoDate('2026-02-31')).toBeNull();
    expect(formatCultoDate('')).toBeNull();
    expect(formatCultoDate('22/11/2026')).toBeNull();
  });
});

describe('buildNewSetlistMessage', () => {
  it('criação: exclui createdBy (não updatedBy); texto, link, tag e origem', () => {
    expect(buildNewSetlistMessage('r1', snap(4, { createdBy: 'a1', updatedBy: 'm1' }), undefined)).toEqual({
      title: 'Novo repertório',
      body: 'Culto de domingo · dom 22/11',
      link: '/repertorios/r1',
      tag: 'setlist-r1-novo',
      origin: 'producao',
      excludeUid: 'a1',
      respectSwitch: true,
    });
  });

  it('atualização: exclui updatedBy, não createdBy', () => {
    const msg = buildNewSetlistMessage('r1', snap(4, { createdBy: 'a1', updatedBy: 'm1' }), snap(3));
    expect(msg?.excludeUid).toBe('m1');
  });

  it('repassa a origem teste', () => {
    expect(buildNewSetlistMessage('r1', snap(4, { origin: 'teste' }), snap(3))?.origin).toBe('teste');
  });

  it('data inválida não monta mensagem', () => {
    expect(buildNewSetlistMessage('r1', snap(4, { date: '2026-02-31' }), snap(3))).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- newSetlist`
Expected: FAIL com "Cannot find module './newSetlist'" (ou erro equivalente de import).

- [ ] **Step 3: Implementar `apps/functions/src/push/newSetlist.ts`**

Assinaturas exatas em Interfaces. Pontos que a assinatura não fixa:
- `expiresAt` em `readSetlist`: auxiliar `toDate(value: unknown): Date | undefined` que aceita `Date` e qualquer objeto com `toDate()` (Timestamp do Admin SDK); outro valor vira `undefined`. Tolerante de propósito: documento sem `expiresAt` não quebra a leitura.
- `WEEKDAYS` é uma constante `['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']` indexada por `getUTCDay()`. Com `noUncheckedIndexedAccess`, o acesso devolve `string | undefined`: conferir antes de usar.
- `formatCultoDate`: regex `^\d{4}-\d{2}-\d{2}$`; montar `Date.UTC(ano, mês - 1, dia)` com `Number(...)` de `slice`; recusar se `toISOString().slice(0, 10) !== date` (pega dia 31 de fevereiro).
- `buildNewSetlistMessage`: `body` = `` `${label} · ${when}` `` com `·` (U+00B7). `excludeUid` = `(before ? setlist.updatedBy : setlist.createdBy) || undefined`. `respectSwitch: true`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- newSetlist`
Expected: PASS, todos os casos de `newSetlist.test.ts`.

- [ ] **Step 5: Typecheck do arquivo**

Run: `npm run typecheck -w @cifras/functions`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/functions/src/push/newSetlist.ts apps/functions/src/push/newSetlist.test.ts
git commit -m "feat(push): decide e monta o aviso de repertório novo"
```

---

### Task 2: Adaptador da marca `avisosEnviados` (`markers.ts`)

**Files:**
- Create: `apps/functions/src/push/markers.ts`
- Test: `apps/functions/src/push/markers.test.ts`

**Interfaces:**
- Consumes: nada de outras tarefas.
- Produces:
  - `type MarkerDeps = { claimMarker(id: string, data: Record<string, unknown>): Promise<'created' | 'exists'> }`
  - `createMarkerDeps(): MarkerDeps`: `claimMarker` faz `getFirestore().doc(`avisosEnviados/${id}`).create(data)`; devolve `'created'`; `ALREADY_EXISTS` (código 6) devolve `'exists'`; outro erro é relançado.

- [ ] **Step 1: Escrever os testes (falham)**

```ts
// apps/functions/src/push/markers.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarkerDeps } from './markers';

const fs = vi.hoisted(() => ({ create: vi.fn(), paths: [] as string[] }));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => {
      fs.paths.push(path);
      return { create: fs.create };
    },
  }),
}));

beforeEach(() => {
  fs.create.mockReset();
  fs.paths.length = 0;
});

describe('createMarkerDeps.claimMarker', () => {
  it('cria avisosEnviados/<id> com os dados recebidos', async () => {
    fs.create.mockResolvedValue(undefined);
    const data = { setlistId: 'r1', tipo: 'novo' };

    const result = await createMarkerDeps().claimMarker('r1_novo', data);

    expect(result).toBe('created');
    expect(fs.paths).toEqual(['avisosEnviados/r1_novo']);
    expect(fs.create).toHaveBeenCalledWith(data);
  });

  it('ALREADY_EXISTS (código 6) vira exists, sem erro', async () => {
    fs.create.mockRejectedValue(Object.assign(new Error('already exists'), { code: 6 }));

    await expect(createMarkerDeps().claimMarker('r1_novo', {})).resolves.toBe('exists');
  });

  it('outro erro é relançado', async () => {
    fs.create.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 14 }));

    await expect(createMarkerDeps().claimMarker('r1_novo', {})).rejects.toThrow('unavailable');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- markers`
Expected: FAIL com "Cannot find module './markers'".

- [ ] **Step 3: Implementar `apps/functions/src/push/markers.ts`**

Constante local `ALREADY_EXISTS = 6`, com comentário "código gRPC ALREADY_EXISTS: a marca já foi criada" (a constante de `stats/statsDeps.ts` é privada, por isso não se importa). `create` nunca `set`: a marca é a trava. Sem `FieldValue`: `createdAt` e `expiresAt` chegam prontos como `Date`, que o Admin SDK grava como timestamp.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- markers`
Expected: PASS nos três casos.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/push/markers.ts apps/functions/src/push/markers.test.ts
git commit -m "feat(push): marca de aviso enviado com create e código ALREADY_EXISTS"
```

---

### Task 3: TTL de `avisosEnviados` (`firestore.indexes.json`)

**Files:**
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: nada.
- Produces: política de TTL no campo `avisosEnviados.expiresAt` (usada pela Tarefa 6, que grava `expiresAt`).

- [ ] **Step 1: Conferir o formato aceito pelo validador (antes de editar)**

Run: `node -e "const s=require('fs').readFileSync('node_modules/firebase-tools/lib/firestore/api.js','utf8'); console.log(s.includes('assertHas(field, \"indexes\")'))"`
Expected: `true`. Isso significa que cada `fieldOverride` precisa da chave `indexes`, mesmo vazia. Para TTL sem índice, `"indexes": []`.

- [ ] **Step 2: Escrever a verificação (falha antes da edição)**

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); const o=j.fieldOverrides.find(f=>f.collectionGroup==='avisosEnviados'); if(!o||o.fieldPath!=='expiresAt'||o.ttl!==true||!Array.isArray(o.indexes)) process.exit(1)"`
Expected: sai com código 1 (ainda não existe a regra).

- [ ] **Step 3: Editar `firestore.indexes.json`**

Acrescentar, depois do override de `setlists`, um item em `fieldOverrides`, no mesmo estilo em linha:

```json
{ "collectionGroup": "avisosEnviados", "fieldPath": "expiresAt", "ttl": true, "indexes": [] }
```

O arquivo continua com `"indexes": []` no topo. Formatar com `npx prettier --write firestore.indexes.json`.

- [ ] **Step 4: Rodar a verificação e ver passar**

Run: `node -e "const j=JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); const o=j.fieldOverrides.find(f=>f.collectionGroup==='avisosEnviados'); if(!o||o.fieldPath!=='expiresAt'||o.ttl!==true||!Array.isArray(o.indexes)) process.exit(1); console.log('ok', j.fieldOverrides.length)"`
Expected: imprime `ok 2` e sai com código 0.

Run: `npx prettier --check firestore.indexes.json`
Expected: `All matched files use Prettier code style!`.

- [ ] **Step 5: Commit**

```bash
git add firestore.indexes.json
git commit -m "chore(firestore): TTL em avisosEnviados.expiresAt"
```

---

### Task 4: Documentação do sistema (`docs/sistema.md`)

**Files:**
- Modify: `docs/sistema.md` (hoje com 264 linhas; limite 350 em `.claude/agents/sistema.test.mjs`)

**Interfaces:**
- Consumes: nomes da Tarefa 7 (`onSetlistWritten`) e da Tarefa 2 (`avisosEnviados`, `tipo`).
- Produces: documentação. Sem código.

- [ ] **Step 1: Teste (falha antes da edição)**

O teste de limite já existe. Acrescentar a verificação de conteúdo com um comando:

Run: `grep -c "onSetlistWritten" docs/sistema.md`
Expected: `0` (confirma que ainda não há a linha).

- [ ] **Step 2: Editar `docs/sistema.md`**

Quatro alterações, nesta ordem:

1. **Dados, tabela do Firestore:** depois da linha de `config/push`, uma linha nova:
   `| avisosEnviados/{setlistId}_novo | setlistId, tipo (novo), createdAt, expiresAt (TTL de 60 dias; marca do aviso de repertório novo) | nenhuma; só Functions |`
2. **Dados, lista de regras (bullet "TTL do Firestore em `setlists.expiresAt`..."):** acrescentar que também há TTL em `avisosEnviados.expiresAt` (60 dias), sem índice de campo.
3. **Functions e jobs, tabela:** nova linha depois de `sendTestPush`:
   `| onSetlistWritten | Firestore (`setlists/{setlistId}`) | automático | Avisa "Novo repertório" aos aparelhos de membros e admins quando o repertório chega a 4 louvores; uma vez por repertório (marca em `avisosEnviados`); não avisa quem gravou; só aparelhos da mesma origem; respeita `config/push` |`
   E trocar o parágrafo "Avisos (push): ... Ainda não há gatilho: os avisos chegam nas entregas #101 e #102." por "... O gatilho do repertório novo é `onSetlistWritten` (regra abaixo); os lembretes chegam na #102."
4. **Functions e jobs, nova seção "Regra do aviso de repertório novo"** (depois de "Regras de contagem de uso"), com 5 bullets: sai quando `items.length` passa de 3 ou menos para 4 ou mais, ou nasce com 4 ou mais; repertório com menos de 4 nunca avisa; a marca é criada com `create()` antes do envio, então esvaziar e encher de novo não avisa outra vez; falha de envio só loga; com `config/push.enabled === false` a marca é criada e o aviso não sai (não sai depois ao religar).
5. **Limites conhecidos, "Pendências abertas":** acrescentar "Antes do deploy da #101, passos manuais de `deploy.md` §3 (Pub/Sub e Eventarc) e §15 (papel Eventarc Admin); depois, conferir o TTL de `avisosEnviados` (§15)."

Manter o arquivo abaixo de 350 linhas.

- [ ] **Step 3: Verificar**

Run: `grep -c "onSetlistWritten" docs/sistema.md`
Expected: 2 ou mais (tabela e parágrafo).

Run: `node --test .claude/agents/sistema.test.mjs`
Expected: PASS, incluindo "at most 350 lines".

- [ ] **Step 4: Commit**

```bash
git add docs/sistema.md
git commit -m "docs(sistema): gatilho do repertório novo, avisosEnviados e regra dos 4 louvores"
```

---

### Task 5: Passos de deploy (`docs/deploy.md`)

**Files:**
- Modify: `docs/deploy.md`

**Interfaces:**
- Consumes: nada.
- Produces: instruções para a pessoa (passos manuais, gatilho 4 da Análise da #101).

- [ ] **Step 1: Verificar o ponto de partida (falha antes da edição)**

Run: `grep -c "Pub/Sub" docs/deploy.md`
Expected: `0`.

- [ ] **Step 2: Editar `docs/deploy.md`**

1. **§3, "APIs do Google Cloud":** na frase que lista as APIs (Cloud Functions, Cloud Build, Artifact Registry, Cloud Run e Eventarc), acrescentar **Pub/Sub**, e uma frase: "O gatilho do repertório novo (`onSetlistWritten`) usa Eventarc, que entrega por Pub/Sub."
2. **Nova seção no fim do arquivo, depois de §14:** `## 15. Avisos de repertório novo (#101)`, com:
   - **Antes do deploy que traz a #101 (passo manual da pessoa):** ativar as APIs `pubsub.googleapis.com` e `eventarc.googleapis.com` no projeto (APIs e serviços > Biblioteca, ou `gcloud services enable pubsub.googleapis.com eventarc.googleapis.com --project <id>`); dar à conta de serviço do deploy o papel **Eventarc Admin** (`roles/eventarc.admin`). Sem isso, o deploy da função `onSetlistWritten` falha. Confirmar o nome do papel na documentação oficial do Firebase e do Google Cloud no momento do passo, porque ele pode mudar; quem executa é a pessoa, e a nota fica no `deploy.md`.
   - **Depois do deploy:** em Firestore > TTL e índices, conferir que a política de TTL de `avisosEnviados` no campo `expiresAt` está ativa. Se o deploy não a tiver criado, ativá-la à mão. Não há índice de campo para `avisosEnviados.expiresAt`: é esperado.
   - **Conferência:** no Cloud Run ou em Functions, a função `onSetlistWritten` existe na região `southamerica-east1`.
   - Nota: a coleção `avisosEnviados` não deve ser apagada à mão, porque ela é a trava contra aviso repetido.

- [ ] **Step 3: Verificar**

Run: `grep -c "Pub/Sub" docs/deploy.md`
Expected: 2 ou mais.

Run: `grep -n "## 15" docs/deploy.md`
Expected: uma linha com `## 15. Avisos de repertório novo (#101)`.

Não há teste automático para este arquivo. Conferir a leitura no diff.

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md
git commit -m "docs(deploy): APIs Pub/Sub e Eventarc e TTL de avisosEnviados"
```

---

### Task 6: Orquestração do aviso (`announce.ts`)

**Files:**
- Create: `apps/functions/src/push/announce.ts`
- Test: `apps/functions/src/push/announce.test.ts`

**Interfaces:**
- Consumes (Tarefa 1): `readSetlist`, `shouldAnnounce`, `buildNewSetlistMessage`, `SetlistSnapshot` de `./newSetlist`.
- Consumes (Tarefa 2): `MarkerDeps` de `./markers`.
- Consumes (existente): `sendToDevices` de `./send`; `PushDeps` de `./types`; `FAKE_NOW`, `device`, `fakeDeps`, `sentTokens`, `FakeOptions` de `./fakeDeps` (só nos testes).
- Produces:
  - `NEW_SETLIST_TTL_DAYS = 60` (`number`)
  - `markerExpiresAt(now: Date, setlistExpiresAt: Date | undefined): Date`: o maior entre `now + 60 dias` e `setlistExpiresAt`; `undefined` ou menor vira `now + 60 dias`.
  - `type AnnounceDeps = PushDeps & MarkerDeps`
  - `type AnnounceResult = 'not-due' | 'invalid' | 'already-announced' | 'blocked' | 'sent' | 'failed'`
  - `announceNewSetlist(deps: AnnounceDeps, setlistId: string, beforeData: Record<string, unknown> | undefined, afterData: Record<string, unknown> | undefined): Promise<AnnounceResult>`

Fluxo exato: (1) `before`/`after` via `readSetlist`; (2) sem `after` ou `!shouldAnnounce` → `'not-due'`; (3) `buildNewSetlistMessage(setlistId, after, before)` nulo → `'invalid'` (antes de qualquer marca); (4) `now = deps.now()`, `claimMarker(`${setlistId}_novo`, { setlistId, tipo: 'novo', createdAt: now, expiresAt: markerExpiresAt(now, after.expiresAt) })`; (5) `'exists'` → `'already-announced'`; (6) `sendToDevices(deps, input)` dentro de `try`: `blocked` → `'blocked'`; senão `console.info` com contagens e `'sent'`; (7) `catch` → `console.error('push: falha ao avisar repertório novo', { setlistId, code })` com `code` de `(error as { code?: unknown }).code ?? 'error'` e `'failed'`. Erro de `claimMarker` fica **fora** do `try` e propaga.

- [ ] **Step 1: Escrever os testes (falham)**

```ts
// apps/functions/src/push/announce.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { announceNewSetlist, markerExpiresAt, type AnnounceDeps } from './announce';
import { device, fakeDeps, FAKE_NOW, sentTokens, type FakeOptions } from './fakeDeps';

const DAY_MS = 24 * 60 * 60 * 1000;
const plus = (days: number) => new Date(FAKE_NOW.getTime() + days * DAY_MS);

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, songId: `s${i}`, key: 'C' }));
const setlist = (n: number, extra: Record<string, unknown> = {}) => ({
  date: '2026-11-22',
  label: 'Culto de domingo',
  items: items(n),
  createdBy: 'a1',
  updatedBy: 'a1',
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup(fake: FakeOptions = {}, existing: string[] = []) {
  const { deps, calls } = fakeDeps(fake);
  const markers = new Map<string, Record<string, unknown>>(existing.map((id) => [id, {}]));
  const claims: string[] = [];
  const annDeps: AnnounceDeps = {
    ...deps,
    claimMarker: async (id, data) => {
      claims.push(id);
      if (markers.has(id)) return 'exists';
      markers.set(id, data);
      return 'created';
    },
  };
  return { annDeps, calls, markers, claims };
}

const members = { roles: { m1: 'member', a1: 'admin' } } satisfies FakeOptions;

describe('announceNewSetlist: envio e marca', () => {
  it('cria a marca com os campos exatos e avisa quem não gravou', async () => {
    const { annDeps, calls, markers } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    // createdBy a1 fica de fora (a1 não recebe); updatedBy m1 não é excluído na criação.
    const result = await announceNewSetlist(annDeps, 'r1', undefined, setlist(4, { updatedBy: 'm1' }));

    expect(result).toBe('sent');
    expect(markers.get('r1_novo')).toEqual({
      setlistId: 'r1',
      tipo: 'novo',
      createdAt: FAKE_NOW,
      expiresAt: new Date(FAKE_NOW.getTime() + 60 * DAY_MS),
    });
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(calls.flat()[0]?.message).toEqual({
      title: 'Novo repertório',
      body: 'Culto de domingo · dom 22/11',
      tag: 'setlist-r1-novo',
      link: 'https://louvor-hajaluz.web.app/repertorios/r1',
    });
  });

  it('marca de envio anterior: 3 → 4 não envia de novo', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] }, ['r1_novo']);

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('already-announced');
    expect(calls).toEqual([]);
  });

  it('reentrega do mesmo evento não duplica', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('sent');
    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('already-announced');
    expect(sentTokens(calls)).toEqual(['t1']);
  });

  it('sequência 3 → 4 → 3 → 4: avisa uma vez só, mesmo caindo abaixo de 4', async () => {
    const { annDeps, calls, markers } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('sent');
    expect(await announceNewSetlist(annDeps, 'r1', setlist(4), setlist(3))).toBe('not-due');
    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('already-announced');
    expect(sentTokens(calls)).toEqual(['t1']);
    expect(markers.has('r1_novo')).toBe(true);
  });

  it('atualização que chega a 4 exclui updatedBy (não createdBy)', async () => {
    const { annDeps, calls } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'a1', 'producao')],
    });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4, { updatedBy: 'm1' }))).toBe('sent');
    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('marca não vence antes de um repertório com data futura', async () => {
    const { annDeps, markers } = setup({ ...members, devices: [] });

    await announceNewSetlist(annDeps, 'r1', undefined, setlist(4, { expiresAt: plus(200) }));

    expect(markers.get('r1_novo')?.expiresAt).toEqual(plus(200));
  });

  it('interruptor desligado: bloqueado, sem envio; a marca fica', async () => {
    const { annDeps, calls, markers } = setup({
      ...members,
      config: { enabled: false },
      devices: [device('t1', 'm1')],
    });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('blocked');
    expect(calls).toEqual([]);
    expect(markers.has('r1_novo')).toBe(true);
  });

  it('origem teste só avisa aparelhos de teste', async () => {
    const { annDeps, calls } = setup({
      ...members,
      devices: [device('t1', 'm1', 'producao'), device('t2', 'm1', 'teste')],
    });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4, { origin: 'teste' }))).toBe('sent');
    expect(sentTokens(calls)).toEqual(['t2']);
  });

  it('falha de envio só loga, não relança e não tira a marca', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { annDeps, markers } = setup({ ...members, devices: [device('t1', 'm1')] });
    annDeps.sendBatch = async () => {
      throw Object.assign(new Error('fcm fora'), { code: 'unavailable' });
    };

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).toBe('failed');
    expect(markers.has('r1_novo')).toBe(true);
    expect(errorSpy).toHaveBeenCalledWith('push: falha ao avisar repertório novo', {
      setlistId: 'r1',
      code: 'unavailable',
    });
  });

  it('erro ao criar a marca (que não seja já existente) propaga e não envia', async () => {
    const { annDeps, calls } = setup({ ...members, devices: [device('t1', 'm1')] });
    annDeps.claimMarker = async () => {
      throw Object.assign(new Error('unavailable'), { code: 14 });
    };

    await expect(announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4))).rejects.toThrow('unavailable');
    expect(calls).toEqual([]);
  });

  it('data inválida: "invalid", sem marca e sem envio', async () => {
    const { annDeps, claims, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', setlist(3), setlist(4, { date: '2026-02-31' }))).toBe('invalid');
    expect(claims).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('markerExpiresAt: a marca não vence antes do repertório', () => {
  it.each([
    ['repertório sem expiresAt: agora + 60 dias', undefined, plus(60)],
    ['repertório vence antes de 60 dias: agora + 60 dias', plus(10), plus(60)],
    ['repertório vence depois de 60 dias: a marca vence junto', plus(200), plus(200)],
  ])('%s', (_name, setlistExpiresAt, expected) => {
    expect(markerExpiresAt(FAKE_NOW, setlistExpiresAt)).toEqual(expected);
  });
});

describe('announceNewSetlist: quando não avisa', () => {
  it.each([
    ['0 → 3', setlist(0), setlist(3)],
    ['criação com 3', undefined, setlist(3)],
    ['4 → 5', setlist(4), setlist(5)],
    ['5 → 4', setlist(5), setlist(4)],
    ['edição de rótulo com 4', setlist(4), setlist(4, { label: 'Outro' })],
    ['exclusão', setlist(4), undefined],
  ])('%s: "not-due", sem marca e sem envio', async (_name, before, after) => {
    const { annDeps, claims, calls } = setup({ ...members, devices: [device('t1', 'm1')] });

    expect(await announceNewSetlist(annDeps, 'r1', before, after)).toBe('not-due');
    expect(claims).toEqual([]);
    expect(calls).toEqual([]);
  });
});
```

Nota sobre o tipo de `members`: `satisfies FakeOptions` mantém o literal de `roles`. Se o TypeScript reclamar do `satisfies`, trocar por `const members: FakeOptions = { ... }`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- announce`
Expected: FAIL com "Cannot find module './announce'".

- [ ] **Step 3: Implementar `apps/functions/src/push/announce.ts`**

Assinaturas exatas em Interfaces, e o fluxo exato em sete passos (ver texto acima da lista de testes). Constante local `DAY_MS = 24 * 60 * 60 * 1000`. `markerExpiresAt` fica exportada e é testada direto: `minimo = now.getTime() + NEW_SETLIST_TTL_DAYS * DAY_MS`; devolve `setlistExpiresAt` se existir e for maior que `minimo`, senão `new Date(minimo)`. Imports de `./newSetlist`, `./markers` (só o tipo `MarkerDeps`), `./send` e `./types`. Nenhum log com token.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- announce`
Expected: PASS em todos os casos de `announce.test.ts`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck -w @cifras/functions`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/functions/src/push/announce.ts apps/functions/src/push/announce.test.ts
git commit -m "feat(push): orquestra o aviso de repertório novo com marca e envio"
```

---

### Task 7: Gatilho `onSetlistWritten` e exportação em `index.ts`

**Files:**
- Create: `apps/functions/src/push/setlistTrigger.ts`
- Test: `apps/functions/src/push/setlistTrigger.test.ts`
- Modify: `apps/functions/src/index.ts` (uma linha, única tarefa que toca este arquivo)

**Interfaces:**
- Consumes (Tarefa 6): `announceNewSetlist`, `AnnounceDeps` de `./announce`.
- Consumes (Tarefa 2): `createMarkerDeps` de `./markers`.
- Consumes (existente): `createPushDeps` de `./adminDeps`.
- Produces: `onSetlistWritten` (gatilho v2), exportado por `apps/functions/src/index.ts`.

- [ ] **Step 1: Escrever o teste (falha)**

```ts
// apps/functions/src/push/setlistTrigger.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  announce: vi.fn(),
  opts: undefined as unknown,
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (opts: unknown, handler: unknown) => {
    h.opts = opts;
    return handler;
  },
}));
vi.mock('./announce', () => ({ announceNewSetlist: h.announce }));
vi.mock('./adminDeps', () => ({ createPushDeps: () => ({}) }));

import { onSetlistWritten } from './setlistTrigger';

type Event = { params: { setlistId: string }; data?: { before: { data: () => unknown }; after: { data: () => unknown } } };
const handler = onSetlistWritten as unknown as (event: Event) => Promise<unknown>;

beforeEach(() => {
  h.announce.mockReset();
  h.announce.mockResolvedValue('not-due');
});

describe('onSetlistWritten: fiação', () => {
  it('escuta setlists/{setlistId} na região de São Paulo, sem retry', () => {
    expect(h.opts).toEqual({
      document: 'setlists/{setlistId}',
      region: 'southamerica-east1',
      retry: false,
    });
  });

  it('repassa o id e os dados antes e depois', async () => {
    const after = { date: '2026-11-22', items: [] };
    await handler({
      params: { setlistId: 'r1' },
      data: { before: { data: () => undefined }, after: { data: () => after } },
    });

    expect(h.announce).toHaveBeenCalledWith(expect.any(Object), 'r1', undefined, after);
  });

  it('sem data no evento, repassa undefined nos dois lados', async () => {
    await handler({ params: { setlistId: 'r1' } });

    expect(h.announce).toHaveBeenCalledWith(expect.any(Object), 'r1', undefined, undefined);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w @cifras/functions -- setlistTrigger`
Expected: FAIL com "Cannot find module './setlistTrigger'".

- [ ] **Step 3: Implementar `apps/functions/src/push/setlistTrigger.ts`**

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { announceNewSetlist, type AnnounceDeps } from './announce';
import { createPushDeps } from './adminDeps';
import { createMarkerDeps } from './markers';

const deps: AnnounceDeps = { ...createPushDeps(), ...createMarkerDeps() };

// Sem retry: a marca já foi criada, e um reenvio automático duplicaria o aviso se a marca falhar depois.
export const onSetlistWritten = onDocumentWritten(
  { document: 'setlists/{setlistId}', region: 'southamerica-east1', retry: false },
  (event) =>
    announceNewSetlist(
      deps,
      event.params.setlistId,
      event.data?.before.data(),
      event.data?.after.data(),
    ),
);
```

Escolha de implementação: a fiação fica em `push/setlistTrigger.ts` (não em `index.ts`), como `songs/keys.ts`, para que `index.ts` tenha uma linha só.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w @cifras/functions -- setlistTrigger`
Expected: PASS nos três casos.

- [ ] **Step 5: Exportar em `apps/functions/src/index.ts`**

Acrescentar logo abaixo da linha `export { onArrangementWritten } from './songs/keys';`:

```ts
export { onSetlistWritten } from './push/setlistTrigger';
```

- [ ] **Step 6: Typecheck e build**

Run: `npm run typecheck -w @cifras/functions`
Expected: sem erros. Se `retry` não for aceito em `DocumentOptions`, o erro aponta para a linha; a correção é remover `retry: false` e confiar no padrão `false` de firebase-functions 7.4.0 (confirmado em `lib/v2/providers/firestore.js`).

Run: `npm run build -w @cifras/functions`
Expected: build conclui; `grep -c onSetlistWritten apps/functions/lib/index.js` retorna 1 ou mais.

- [ ] **Step 7: Commit**

```bash
git add apps/functions/src/push/setlistTrigger.ts apps/functions/src/push/setlistTrigger.test.ts apps/functions/src/index.ts
git commit -m "feat(push): gatilho onSetlistWritten para o aviso de repertório novo"
```

---

### Task 8: Verificação final da entrega

**Files:** nenhum arquivo novo. Só comandos.

**Interfaces:**
- Consumes: todas as tarefas anteriores.
- Produces: evidência de que a entrega está pronta.

- [ ] **Step 1: Conferir o escopo do diff**

Run: `git diff --stat origin/develop...HEAD`
Expected: só os arquivos das tarefas 1 a 7 (ver File Structure). Nenhum de `firebase.json`, `.github/`, `.claude/`, `firestore.rules`, `apps/web/`.

- [ ] **Step 2: Testes de todos os workspaces**

Run: `npm test`
Expected: todos os workspaces verdes (`Test Files ... passed`, sem `failed`).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: sem erros.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem erros em nenhum workspace.

- [ ] **Step 5: Formatação**

Run: `npm run format:check`
Expected: `All matched files use Prettier code style!`. Se falhar, formatar só os arquivos alterados de código (`*.ts`, `*.json`) com `npx prettier --write <arquivo>` e rodar de novo. Não formatar `docs/` (está no `.prettierignore`).

- [ ] **Step 6: Harness (inclui o limite de 350 linhas de `sistema.md`)**

Run: `npm run test:harness`
Expected: PASS.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build de todos os workspaces conclui.

- [ ] **Step 8: Rules (confirmar que `avisosEnviados` segue fechado ao cliente)**

Não há mudança em Rules. `tests/rules/push.rules.test.ts` já cobre `avisosEnviados/a1` em `PATHS`, `COLLECTIONS` e `EXISTING`.

Run (com Java 21 no host): `npm run test:rules`
Run (Windows sem Java): `docker compose run --rm --no-deps emulators npm run test:rules`
Expected: PASS, incluindo `colecoes de push fechadas`.

- [ ] **Step 9: E2E**

Não há E2E novo (push não é verificável no emulador). O E2E existente de repertórios roda com o emulador de Functions no CI: sem aparelhos registrados, o gatilho cria a marca e não envia. Conferir no CI do PR.

- [ ] **Step 10: Commit de fechamento**

Não há mudança nova nesta tarefa. Se os passos 5 ou 6 pedirem formatação, commitar:

```bash
git add <arquivos formatados>
git commit -m "style(functions): formata arquivos do aviso de repertório novo"
```

---

## Passos manuais da pessoa (fora deste plano, antes do deploy)

Estes passos não são tarefas de agente. Estão em `docs/deploy.md` §15 (Tarefa 5):

1. Ativar as APIs `pubsub.googleapis.com` e `eventarc.googleapis.com`.
2. Dar à conta de serviço do deploy o papel Eventarc Admin (`roles/eventarc.admin`). Confirmar o nome do papel na documentação oficial no momento do passo.
3. Depois do deploy: conferir o TTL de `avisosEnviados.expiresAt` no console (Firestore > TTL e índices).
4. Teste no aparelho real (critério 7 [A]): com o app fechado, o aviso chega e o toque abre o repertório.

## Self-Review (feito pelo tech-lead)

**1. Cobertura do spec (critérios da #101):**
- Critério 1 (4 louvores, uma vez, marca `create()`, 5→3→4 não avisa): Tarefas 1 (`shouldAnnounce`), 2 (`create`/`ALREADY_EXISTS`), 6 (fluxo e testes).
- Critério 2 (edições não avisam; reentrega não duplica): Tarefa 1 (tabela de casos), Tarefa 6 (reentrega).
- Critério 3 (exclui `updatedBy`/`createdBy`; mesma origem; só membros e admins): `excludeUid` na Tarefa 1; origem na Tarefa 1 e Tarefa 6; papel já coberto por `sendToDevices` (testes existentes da #98).
- Critério 4 (título, corpo, tag, link): Tarefa 1 (`buildNewSetlistMessage` com valores exatos).
- Critério 5 [E2E] (login e volta ao repertório): não coberto aqui; ver Dúvidas.
- Critério 6 (falha só loga; interruptor): Tarefa 6 (`failed`, `blocked`).
- Critério 7 [A]: passo manual da pessoa.
- Itens 3 a 7 do pedido: gatilho (Tarefa 7, `retry: false`), TTL (Tarefa 3), testes (Tarefas 1, 2, 6, 7; Rules na Tarefa 8), docs (Tarefas 4 e 5), E2E (Tarefa 8, passo 9: nenhum E2E de push).
- `firebase.json`: não precisa mudar; confirmado porque o gatilho v2 é descoberto pelo código e a região vem de `onDocumentWritten`.

**2. Varredura de passos:** os passos de código dão assinatura, fluxo e testes exatos. Corpos completos aparecem só nos testes e onde o formato é fixo (`setlistTrigger.ts`, pela própria fiação).

**3. Consistência de tipos:** `SetlistSnapshot` (Tarefa 1) é usado com os mesmos campos na Tarefa 6. `MarkerDeps.claimMarker(id, data)` (Tarefa 2) bate com a chamada da Tarefa 6. `AnnounceDeps = PushDeps & MarkerDeps` (Tarefa 6) é o tipo de `deps` na Tarefa 7. `AnnounceResult` é o mesmo nos testes da Tarefa 6. `SetlistSnapshot.expiresAt` (Tarefa 1) é lido na Tarefa 6 por `markerExpiresAt`.

**4. Review Focus:** cinco entradas, cada uma com teste na tarefa dona (ver a seção).

**5. Proporção:** o plano descreve código, não o escreve por inteiro; os corpos de código ficam nos testes e nos pontos que o spec fixa.

## Decisões registradas (orquestrador)

1. **Interruptor desligado grava a marca: decidido.** Aceito como parada de emergência. Com `config/push.enabled === false`, a marca é criada e o aviso não sai; ao religar, o repertório não avisa de novo. A marca vem antes do envio e o interruptor não é checado antes dela.
2. **Critério 5 [E2E]: decidido.** Sem E2E novo. O retorno ao destino depois do login já tem E2E; o envio de push não roda no emulador.
3. **Abreviação `sáb`** (com acento) no corpo do aviso: decidido.
4. **Papel Eventarc Admin: a confirmar no passo manual.** O nome do papel (`roles/eventarc.admin`) deve ser conferido na documentação oficial no momento em que a pessoa executar o passo. A nota fica em `docs/deploy.md` §15 (Tarefa 5).
5. **TTL sem índice: verificado.** `"indexes": []` é o formato que o validador do firebase-tools 15.36.0 exige (a chave `indexes` é obrigatória). Se o primeiro deploy não criar a política de TTL, o `deploy.md` §15 manda ativar à mão.
6. **Execução:** a decidir pelo orquestrador. Recomendo subagent-driven, com as Tarefas 1 a 5 em paralelo (arquivos disjuntos), depois a 6, a 7 e a 8.

Nada foi executado: os testes não rodaram e nenhum commit foi feito.
