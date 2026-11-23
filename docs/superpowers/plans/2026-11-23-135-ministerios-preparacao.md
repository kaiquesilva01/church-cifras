# Ministérios: Preparação (#135) Implementation Plan

> **Para workers agentes:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Preparar o backend para vários ministérios sem nenhuma mudança visível para quem usa: dados de ministério (ministério, membros, pedidos, repertórios no caminho novo), claims derivados gravados junto do `role` atual, Functions de vínculo, Rules do caminho novo, espelho de `setlists` raiz, ponte da tela Pessoas e migração idempotente da Haja Luz.

**Architecture:** O documento é a verdade (ministério, membro, pedido). Functions callable conferem o papel pelo documento e recalculam os claims `appAdmin`, `hasMinistry` e `canUploadSong` a partir dele; o `role` continua como hoje. As Rules do caminho novo conferem `ministries/{mid}/members/{uid}` com `exists()` e `get()`. Um espelho copia `setlists` raiz para `ministries/hajaluz/setlists` relendo o estado atual da raiz, não o evento. A migração é um CLI idempotente (gravações só de criação, `--dry-run` primeiro).

**Tech Stack:** TypeScript `strict`; Cloud Functions v2 (`onCall`, `onDocumentWritten`, `onSchedule`) em `southamerica-east1`; firebase-admin 14; Vitest 5 (`apps/functions`); `@firebase/rules-unit-testing` no emulador do Firestore (`tests/rules`); tsup para o CLI.

**Spec:** `docs/superpowers/specs/2026-11-23-131-ministerios-design.md` (§3, §4.2 a §4.6, §6 item 1, §8). Esta sub-issue é a Preparação: o cliente (`apps/web`) não muda; ele entra no Pacote (#136).

## Restrições globais

- Não tocar `apps/web`, `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md` (são travas).
- As Rules de `setlists` raiz, do catálogo (`songs`, `arrangements`, `songLyrics`) e do Storage continuam iguais. `requireRole` dos callables que já existem não muda nesta entrega.
- O campo `role` (em `users` e no claim) continua gravado e lido como hoje até a limpeza (§4.6, passo 3).
- Claims: `role`, `appAdmin` (booleano), `hasMinistry` (booleano), `canUploadSong` (booleano). `setCustomUserClaims` substitui o objeto inteiro: **toda** gravação de claims passa os quatro campos.
- Ministério: id = slug do nome, `^[a-z0-9]+(-[a-z0-9]+)*$`, até 60 caracteres; `hajaluz` fixo para a Haja Luz. Nome e cidade: 1 a 60 caracteres depois de `trim()` (spec §4.2).
- Região `southamerica-east1`. Identificadores de código em inglês; mensagens de erro para a pessoa em pt-BR. Commits em Conventional Commits, em inglês.
- Nenhum e-mail real no repositório: o CLI recebe `--app-admin <e-mail>` como argumento, e nos testes usar e-mails fictícios.
- Toda mudança em Rules ou Functions passa por `npm run test:rules` antes do PR (spec §7).
- Nesta entrega não há teste no celular (nenhum arquivo de `viewer/`, `setlists/` ou `pad/` muda) e não há desenho no Paper (nenhuma tela muda).
- Não publicar nas quintas e domingos das 16h30 às 23h59 (America/Sao_Paulo) e não rodar a migração na janela do culto (spec §2).

## Revisão de foco (Review Focus)

1. **Claims apagados:** gravar só `role` no claim apaga `appAdmin`, `hasMinistry` e `canUploadSong` do token. Testes em `claims.test.ts` (recálculo grava os quatro campos) e `users.test.ts` (criação e troca de papel gravam o conjunto completo).
2. **Removido continua lendo repertório com token antigo:** teste na matriz de `ministerios.rules.test.ts`, caso "removido com claim `hasMinistry`", que deve negar a leitura de `ministries/hajaluz/setlists/s1`.
3. **Ministério sem admin:** o admin do ministério rebaixa ou remove o último admin dele. Testes em `members.test.ts` (bloqueia para o admin do ministério; permite para o admin da app).
4. **Pessoa com ministério (ou com pedido em outro) pede de novo:** testes em `requests.test.ts`.
5. **Espelho ou migração fora de ordem ou repetidos regridem repertório editado:** `mirror.test.ts` ("copia o estado atual da raiz, não o evento") e `migration.test.ts` ("não sobrescreve destino existente").

## Mapa de grupos (paralelismo sem arquivos compartilhados)

| Grupo | Tarefas | Por que pode andar junto |
| --- | --- | --- |
| A | 1 (Rules e índices), 2 (domínio puro) | Arquivos disjuntos; sem dependência entre elas. |
| B | 3 (espelho), 4 (pedidos), 5 (vínculos), 6 (ministério e admin da app), 7 (ponte Pessoas e `users.ts`), 8 (estatísticas), 9 (migração pura), 10 (adaptadores firebase-admin) | Dependem só da tarefa 2 (tipos e modelo). Arquivos disjuntos. |
| C | 11 (CLI de migração e scripts), 12 (cabeamento de `index.ts`) | 11 depende de 9 e 10; 12 depende de 3 a 7 e 10. Arquivos disjuntos. |
| D | 13 (docs) | Só usa os nomes fixados neste plano; pode andar com a 12. |
| E | Verificação final (orquestrador) | Depois de tudo. |

Dentro de cada tarefa, o passo 1 escreve o teste e o passo 2 confirma que ele falha. Ao fim de cada tarefa, o orquestrador faz o commit (o agente não commita).

---

## Tarefa 1: Rules e índices do caminho novo

**Arquivos:**
- Modificar: `firestore.rules` (acrescentar blocos; não alterar os existentes)
- Modificar: `firestore.indexes.json`
- Criar: `tests/rules/ministerios.rules.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: caminhos `ministries/{mid}`, `ministries/{mid}/members/{uid}`, `ministries/{mid}/requests/{uid}`, `ministries/{mid}/setlists/{sid}`; leitura do claim `appAdmin` por `request.auth.token.get('appAdmin', false) == true`. Campos de membro e pedido usados pelas Rules: `uid`, `role` (membro), `status` (pedido).

- [ ] **Passo 1: escrever a matriz de testes**

O arquivo tem um `beforeEach` que limpa o Firestore e semeia (com `withSecurityRulesDisabled`): `ministries/hajaluz` e `ministries/outro` (`name`, `nameNormalized`, `city`); `ministries/hajaluz/members/m1` (`uid: 'm1'`, `role: 'admin'`); `members/m2` (`role: 'member'`); `ministries/outro/members/o1` (`role: 'member'`); `ministries/outro/members/o2` (`role: 'admin'`); `ministries/hajaluz/requests/r1` (`uid: 'r1'`, `status: 'pending'`); `ministries/hajaluz/setlists/s1` com os dados de `setlistData` de `tests/rules/setlists.rules.test.ts` (copiar os helpers e o `Timestamp`). Contextos: `deslogado` (`unauthenticatedContext`), `semVinculo` (`'x1'`, sem claims), `removido` (`'ex'`, `{ role: 'admin', hasMinistry: true, canUploadSong: true }`, sem documento de membro), `membroHaja` (`'m2'`, `{ hasMinistry: true }`), `adminHaja` (`'m1'`, `{ hasMinistry: true, canUploadSong: true }`), `membroOutro` (`'o1'`), `adminOutro` (`'o2'`), `adminApp` (`'app'`, `{ appAdmin: true }`, sem vínculo), `pedinte` (`'r1'`).

Matriz esperada (S = permitido, N = negado), que vira `it.each([[nome, contexto, operação, esperado]])`:

| Operação | deslogado | semVinculo | removido | membroHaja | adminHaja | membroOutro | adminOutro | adminApp | pedinte |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| get `ministries/hajaluz` | N | S | S | S | S | S | S | S | S |
| get `ministries/hajaluz/members/m2` | N | N | N | S | S | N | N | S | N |
| get `ministries/hajaluz/requests/r1` | N | N | N | N | S | N | N | S | S |
| get `ministries/hajaluz/setlists/s1` | N | N | N | S | S | N | N | N | N |
| create `ministries/hajaluz/setlists/n1` (`createdBy` = uid do contexto) | N | N | N | N | S | N | N | N | N |
| create/update `ministries/hajaluz` (cliente) | N | N | N | N | N | N | N | N | N |
| create `ministries/hajaluz/members/x` (cliente) | N | N | N | N | N | N | N | N | N |
| collectionGroup `members` (`getDocs`) | N | N | N | N | N | N | N | S | N |
| collectionGroup `requests` (`getDocs`) | N | N | N | N | N | N | N | S | N |

Casos extras no mesmo arquivo: `setlists` do ministério com `rehearsalAt` fora da janela de `date` é negado para admin; `setlists` do ministério com `createdBy` de outro uid é negado; `setlists` raiz continua como está (os testes de `setlists.rules.test.ts` cobrem).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`
Expected: FAIL nos casos que devem passar (ex.: "get ministries/hajaluz" para `semVinculo`). Sem Java no Windows: `docker compose run --rm --no-deps emulators npm run test:rules`.

- [ ] **Passo 3: acrescentar as Rules**

Dentro de `match /databases/{database}/documents`, depois de `match /setlists/{setlistId}` e antes do `match /{document=**}` de negação, acrescentar. As funções de apoio entram no topo, junto de `isAdmin()`. Caminhos inline em cada função (não retornar caminho de função):

```
    function isAppAdminClaim() {
      return signedIn() && request.auth.token.get('appAdmin', false) == true;
    }

    function isMemberOf(mid) {
      return signedIn()
        && exists(/databases/$(database)/documents/ministries/$(mid)/members/$(request.auth.uid));
    }

    function isMinistryAdmin(mid) {
      return isMemberOf(mid)
        && get(/databases/$(database)/documents/ministries/$(mid)/members/$(request.auth.uid)).data.role == 'admin';
    }

    match /ministries/{mid} {
      allow read: if signedIn();
      allow write: if false;

      match /members/{uid} {
        allow read: if signedIn() && (request.auth.uid == uid || isMinistryAdmin(mid) || isAppAdminClaim());
        allow write: if false;
      }

      match /requests/{uid} {
        allow read: if signedIn() && (request.auth.uid == uid || isMinistryAdmin(mid) || isAppAdminClaim());
        allow write: if false;
      }

      match /setlists/{setlistId} {
        allow read: if isMemberOf(mid);
        allow create: if isMinistryAdmin(mid)
          && validSetlist(request.resource.data, setlistId)
          && request.resource.data.createdBy == request.auth.uid
          && request.resource.data.createdAt == request.time;
        allow update: if isMinistryAdmin(mid)
          && validSetlist(request.resource.data, setlistId)
          && request.resource.data.createdBy == resource.data.createdBy
          && request.resource.data.createdAt == resource.data.createdAt;
        allow delete: if isMinistryAdmin(mid);
      }
    }

    // Admin da app: todos os vínculos e pedidos (consulta de grupo). Não lê repertórios.
    match /{path=**}/members/{uid} {
      allow read: if isAppAdminClaim();
    }

    match /{path=**}/requests/{uid} {
      allow read: if isAppAdminClaim();
    }
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`
Expected: PASS em todos os testes (novos e os existentes de `firestore.rules.test.ts`, `setlists.rules.test.ts`, `acesso.rules.test.ts`, `storage.rules.test.ts`).

- [ ] **Passo 5: índices de grupo**

Acrescentar em `fieldOverrides` de `firestore.indexes.json` (manter os dois existentes intactos):

```json
{ "collectionGroup": "members", "fieldPath": "uid", "indexes": [
  { "order": "ASCENDING", "queryScope": "COLLECTION" },
  { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] },
{ "collectionGroup": "requests", "fieldPath": "uid", "indexes": [
  { "order": "ASCENDING", "queryScope": "COLLECTION" },
  { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] },
{ "collectionGroup": "requests", "fieldPath": "status", "indexes": [
  { "order": "ASCENDING", "queryScope": "COLLECTION" },
  { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] }
```

Verificação: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"` sem erro. O emulador não exige índices: a validação real é em produção (passo manual, ver a seção final).

**Entregável:** Rules e índices verdes. Mensagem sugerida: `feat(rules): caminho novo de ministérios (Rules e índices)`.

---

## Tarefa 2: Domínio puro, tipos de dependência e claims

**Arquivos:**
- Criar: `apps/functions/src/ministries/model.ts`, `deps.ts`, `claims.ts`, `permissions.ts`, `fakeDeps.ts`
- Testes: `apps/functions/src/ministries/model.test.ts`, `claims.test.ts`, `permissions.test.ts`

**Interfaces:**
- Consome: `Role` e `ROLES` de `apps/functions/src/roles.ts`; `HttpsError` de `firebase-functions/v2/https`.
- Produz (exato):

```ts
// model.ts
export const HAJALUZ_ID = 'hajaluz';
export const HAJALUZ_NAME = 'Haja Luz';
export const HAJALUZ_CITY = 'São Paulo';
export type MinistryFields = { name: string; city: string };
export function slugify(name: string): string;            // sem acento, minúsculas, [a-z0-9] separado por "-", até 60; '' se não sobra nada
export function normalizeForSearch(text: string): string;  // sem acento, minúsculas, espaços colapsados, trim
export function validateMinistryFields(input: unknown): MinistryFields; // invalid-argument se faltar ou passar de 60
export function readMinistryId(data: unknown): string;     // data.ministryId no formato do slug; invalid-argument
export function readUid(data: unknown, key?: string): string; // data[key] string não vazia de até 128; invalid-argument
export function parseMembershipRole(value: unknown): MembershipRole; // 'member' | 'admin'; invalid-argument
export function requireCaller(uid: string | undefined): string; // unauthenticated se não houver
export const paths: {
  user(uid: string): string;                    // users/{uid}
  ministry(id: string): string;                 // ministries/{id}
  member(mid: string, uid: string): string;     // ministries/{mid}/members/{uid}
  request(mid: string, uid: string): string;    // ministries/{mid}/requests/{uid}
};

// deps.ts
export type MembershipRole = 'member' | 'admin';
export type MinistryRecord = { name: string; city: string };
export type MembershipRecord = { uid: string; role: MembershipRole; displayName: string | null; email: string | null; photoURL: string | null };
export type RequestRecord = { uid: string; status: 'pending' | 'rejected'; displayName: string | null; email: string | null; photoURL: string | null };
export type UserRecord = { role: Role | undefined; appAdmin: boolean; displayName: string | null; email: string | null; photoURL: string | null };
export type WriteOp = { op: 'create' | 'set' | 'merge' | 'delete'; path: string; data?: Record<string, unknown> };
export interface MinistryReads {
  readUser(uid: string): Promise<UserRecord | null>;
  readMinistry(ministryId: string): Promise<MinistryRecord | null>;
  readMembership(ministryId: string, uid: string): Promise<MembershipRecord | null>;
  readRequest(ministryId: string, uid: string): Promise<RequestRecord | null>;
  listAdminUids(ministryId: string): Promise<string[]>;
}
export interface MinistryTx extends MinistryReads {
  write(op: WriteOp): void; // todas as leituras da transação vêm antes das escritas
}
export interface MinistryDeps extends MinistryReads {
  now(): Date;
  runTransaction<T>(fn: (tx: MinistryTx) => Promise<T>): Promise<T>;
  listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: MembershipRole }>>;
  listPendingRequestsOfUser(uid: string): Promise<Array<{ ministryId: string }>>;
  countAppAdmins(): Promise<number>;
  setClaims(uid: string, claims: Claims): Promise<void>;
}

// claims.ts
export type Claims = { role: Role; appAdmin: boolean; hasMinistry: boolean; canUploadSong: boolean };
export function buildClaims(input: { role: Role; appAdmin: boolean; memberRoles: MembershipRole[] }): Claims;
export async function recalcClaims(
  deps: Pick<MinistryDeps, 'readUser' | 'listMembershipsOfUser' | 'setClaims'>,
  uid: string,
): Promise<void>; // sem usuário: não faz nada

// permissions.ts
export type ManagerKind = 'app-admin' | 'ministry-admin';
export async function assertCanManageMinistry(deps: MinistryReads, callerUid: string, ministryId: string): Promise<ManagerKind>;
export async function assertAppAdmin(deps: MinistryReads, callerUid: string): Promise<void>;

// fakeDeps.ts (só testes)
export const NOW: Date; // new Date('2026-11-23T12:00:00Z')
export function createFakeMinistryDeps(seed: Record<string, Record<string, unknown>>): {
  deps: MinistryDeps;
  docs: Map<string, Record<string, unknown>>; // chaves = caminhos (ex.: 'ministries/hajaluz/members/u1')
  claimCalls: Array<[string, Claims]>;
};
```

`buildClaims`: `hasMinistry = memberRoles.length > 0`; `canUploadSong = appAdmin || memberRoles.includes('admin')`.

`fakeDeps`: `runTransaction` chama `fn` com um `tx` que lê de `docs` e aplica `write` na hora (`create` lança `Error('ALREADY_EXISTS')` se o caminho existe; `merge` faz `{...atual, ...data}`); `listMembershipsOfUser` e `listPendingRequestsOfUser` varrem as chaves `ministries/<mid>/members|requests/<uid>` filtrando pelo campo `uid`; `countAppAdmins` conta `users/*` com `appAdmin === true`; `setClaims` empurra em `claimCalls`.

- [ ] **Passo 1: escrever os testes**

`model.test.ts`:

```ts
expect(slugify('Vida Nova · Sumaré')).toBe('vida-nova-sumare');
expect(slugify('!!!')).toBe('');
expect(normalizeForSearch('  Sumaré   Norte ')).toBe('sumare norte');
expect(validateMinistryFields({ name: ' Haja Luz ', city: 'São Paulo' })).toEqual({ name: 'Haja Luz', city: 'São Paulo' });
expect(() => validateMinistryFields({ name: '', city: 'x' })).toThrow(); // code 'invalid-argument'
expect(() => validateMinistryFields({ name: 'a'.repeat(61), city: 'x' })).toThrow();
expect(readMinistryId({ ministryId: 'hajaluz' })).toBe('hajaluz');
expect(() => readMinistryId({ ministryId: 'Haja Luz' })).toThrow();
expect(() => readMinistryId({ ministryId: '../x' })).toThrow();
expect(parseMembershipRole('admin')).toBe('admin');
expect(() => parseMembershipRole('viewer')).toThrow();
expect(() => requireCaller(undefined)).toThrow(); // code 'unauthenticated'
expect(paths.member('hajaluz', 'u1')).toBe('ministries/hajaluz/members/u1');
```

`claims.test.ts`:

```ts
it.each([
  [{ role: 'viewer', appAdmin: false, memberRoles: ['member'] }, { role: 'viewer', appAdmin: false, hasMinistry: true, canUploadSong: false }],
  [{ role: 'member', appAdmin: false, memberRoles: ['admin'] }, { role: 'member', appAdmin: false, hasMinistry: true, canUploadSong: true }],
  [{ role: 'viewer', appAdmin: true, memberRoles: [] }, { role: 'viewer', appAdmin: true, hasMinistry: false, canUploadSong: true }],
  [{ role: 'viewer', appAdmin: false, memberRoles: [] }, { role: 'viewer', appAdmin: false, hasMinistry: false, canUploadSong: false }],
])('buildClaims %#', (input, expected) => expect(buildClaims(input as any)).toEqual(expected));

// recalcClaims: users/u1 {role:'member', appAdmin:false}; membership hajaluz role 'member' de u1
// -> claimCalls == [['u1', {role:'member', appAdmin:false, hasMinistry:true, canUploadSong:false}]]
// usuário inexistente -> claimCalls vazio
// sem role no usuário -> role 'viewer' no claim
```

`permissions.test.ts`: app admin sem vínculo → `'app-admin'`; admin do ministério → `'ministry-admin'`; membro comum → `permission-denied`; admin de outro ministério → `permission-denied`; caller sem documento de usuário → `permission-denied`.

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/ministries`
Expected: FAIL (módulos não existem).

- [ ] **Passo 3: implementar** `deps.ts` (só tipos, como no bloco acima), `model.ts`, `claims.ts`, `permissions.ts` e `fakeDeps.ts`. `slugify`: NFD, remover marcas (`/\p{M}/gu`), minúsculas, trocar `[^a-z0-9]+` por `-`, aparar `-`, cortar em 60 e aparar de novo. Erros com `HttpsError` (códigos `invalid-argument`, `unauthenticated`, `permission-denied`). Mensagens em pt-BR, ex.: `'Só o admin do ministério ou da app pode fazer isso.'`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/ministries`
Expected: PASS. Depois: `npm run typecheck -w @cifras/functions`, Expected: sem erros.

**Entregável:** domínio e tipos fixados. Mensagem sugerida: `feat(functions): modelo e claims de ministérios`.

---

## Tarefa 3: Espelho de `setlists` raiz para o caminho novo

**Arquivos:**
- Criar: `apps/functions/src/ministries/mirror.ts`, `mirrorTrigger.ts`, teste `mirror.test.ts`

**Interfaces:**
- Consome: `HAJALUZ_ID`, `paths` (tarefa 2, `model.ts`).
- Produz:

```ts
export type MirrorDeps = {
  readRoot(setlistId: string): Promise<Record<string, unknown> | null>;        // leitura atual da raiz
  writeTarget(setlistId: string, data: Record<string, unknown>): Promise<void>; // set completo, sem merge
  deleteTarget(setlistId: string): Promise<void>;                              // tolera ausente
};
export async function syncSetlistMirror(deps: MirrorDeps, setlistId: string): Promise<'written' | 'deleted'>;
// mirrorTrigger.ts (sem teste unitário: fiação)
export const mirrorSetlists = onDocumentWritten(
  { document: 'setlists/{setlistId}', region: 'southamerica-east1', retry: true },
  (event) => syncSetlistMirror(realMirrorDeps, event.params.setlistId),
);
```

O espelho nunca escreve na raiz e nunca lê `event.data`: lê a raiz no momento. Assim uma entrega fora de ordem ou repetida converge para o estado atual. O caminho do destino é `ministries/hajaluz/setlists/{id}` (mesmo id). `retry: true` é seguro porque a operação é idempotente (proposta, ver pontos em aberto).

- [ ] **Passo 1: testes em `mirror.test.ts`**

```ts
it('copia o estado atual da raiz', async () => {
  // readRoot('s1') -> { label: 'Domingo', items: [] }
  expect(await syncSetlistMirror(deps, 's1')).toBe('written');
  expect(writeTarget).toHaveBeenCalledWith('s1', { label: 'Domingo', items: [] });
});
it('copia o estado atual, não o evento (raiz editada depois)', async () => {
  // readRoot devolve { label: 'Novo' } sempre; chamadas repetidas com o mesmo id gravam 'Novo'
  // e readRoot é chamado a cada sincronização
});
it('apaga o destino quando a raiz não existe', async () => {
  // readRoot -> null
  expect(await syncSetlistMirror(deps, 's1')).toBe('deleted');
  expect(deleteTarget).toHaveBeenCalledWith('s1');
  expect(writeTarget).not.toHaveBeenCalled();
});
it('não escreve na raiz (MirrorDeps não tem método de escrita na raiz)', () => {
  expect(Object.keys(deps).sort()).toEqual(['deleteTarget', 'readRoot', 'writeTarget']);
});
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/mirror`. Expected: FAIL.

- [ ] **Passo 3: implementar** `mirror.ts` (a função acima, sem lógica extra) e `mirrorTrigger.ts`: `realMirrorDeps` com `getFirestore()`: `readRoot` lê `setlists/{id}` (`data()` ou `null`); `writeTarget` faz `.set(data)` em `ministries/${HAJALUZ_ID}/setlists/{id}`; `deleteTarget` faz `.delete()`.

- [ ] **Passo 4: rodar e ver passar** — mesmo comando, Expected: PASS; `npm run typecheck -w @cifras/functions`.

**Entregável:** espelho pronto e ainda não exportado. Mensagem sugerida: `feat(functions): espelho de setlists para o caminho do ministério`.

---

## Tarefa 4: Pedidos de entrada (`requests.ts`)

**Arquivos:**
- Criar: `apps/functions/src/ministries/requests.ts`, `requests.test.ts`

**Interfaces:**
- Consome: `MinistryDeps`; `readMinistryId`, `readUid`, `requireCaller`, `paths` (tarefa 2); `recalcClaims` (tarefa 2); `assertCanManageMinistry` (tarefa 2).
- Produz:

```ts
export async function requestAccess(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ministryId: string; status: 'pending' }>;
export async function cancelRequest(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>;
export async function approveRequest(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>; // data: { ministryId, uid }
export async function rejectRequest(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>;  // data: { ministryId, uid }
```

Regras de `requestAccess` (nesta ordem): caller obrigatório; `ministryId` válido; se o caller já tem qualquer vínculo (`listMembershipsOfUser`) → `failed-precondition` "Você já faz parte de um ministério."; se tem pedido pendente em outro ministério → `failed-precondition` "Você já tem um pedido pendente em outro ministério."; se já tem pedido pendente neste ministério → `{ ministryId, status: 'pending' }` sem gravar; se o ministério não existe → `not-found`; senão grava `paths.request` com `{ uid, status: 'pending', displayName, email, photoURL (de users), createdAt: now, decidedBy: null, decidedAt: null }` (sobrescreve um pedido `rejected`). Usuário sem documento → `not-found`.

`approveRequest` e `rejectRequest`: `assertCanManageMinistry` antes. Dentro de `runTransaction`: lê o pedido (inexistente → `not-found` "Pedido não encontrado."; `status !== 'pending'` → `failed-precondition` "Este pedido não está pendente."). Aprovar: lê o vínculo do alvo; apaga o pedido; se não houver vínculo, cria `paths.member` com `{ uid, role: 'member', displayName, email, photoURL, joinedAt: now, updatedAt: now, updatedBy: caller }`. Depois da transação, `recalcClaims(deps, uid)`. Recusar: `set merge` em `{ status: 'rejected', decidedBy: caller, decidedAt: now }`.

`cancelRequest`: caller só mexe no próprio pedido; se pendente, apaga; se não existe ou não está pendente, retorna `{ ok: true }` sem erro (idempotente).

- [ ] **Passo 1: testes em `requests.test.ts`** (fake com `ministries/hajaluz`, `users/u1` com `displayName: 'Ana'`, `users/adm` com role admin e membership admin em hajaluz):

```ts
it('pede entrada num ministério sem vínculo', async () => {
  await requestAccess(deps, 'u1', { ministryId: 'hajaluz' });
  expect(docs.get('ministries/hajaluz/requests/u1')).toMatchObject({ uid: 'u1', status: 'pending', displayName: 'Ana', decidedBy: null });
});
it('bloqueia quem já tem ministério', async () => { /* seed membership u1 em outro */ rejects code 'failed-precondition' });
it('bloqueia segundo pedido em outro ministério, mas repetir o mesmo é idempotente', ...);
it('pede de novo depois de recusado', ...); // status rejected -> pending, decidedBy null
it('ministério inexistente: not-found', ...);
it('aprovar cria membro, apaga o pedido e recalcula claims', async () => {
  await approveRequest(deps, 'adm', { ministryId: 'hajaluz', uid: 'u1' });
  expect(docs.has('ministries/hajaluz/requests/u1')).toBe(false);
  expect(docs.get('ministries/hajaluz/members/u1')).toMatchObject({ role: 'member', updatedBy: 'adm' });
  expect(claimCalls.at(-1)).toEqual(['u1', expect.objectContaining({ hasMinistry: true, canUploadSong: false })]);
});
it('aprovar pedido que não está pendente: failed-precondition', ...);
it('membro comum não aprova: permission-denied', ...);
it('recusar marca rejected com decidedBy', ...);
it('cancelar apaga o próprio pedido pendente e é idempotente', ...);
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/requests`. Expected: FAIL.

- [ ] **Passo 3: implementar** `requests.ts` conforme as regras acima. Todas as leituras antes das escritas dentro da transação.

- [ ] **Passo 4: rodar e ver passar** — mesmo comando, Expected: PASS. Typecheck.

**Entregável:** pedidos com as regras da §4.2 e §4.5. Mensagem sugerida: `feat(functions): pedidos de entrada em ministério`.

---

## Tarefa 5: Vínculos (`members.ts`): tornar admin ou membro, remover

**Arquivos:**
- Criar: `apps/functions/src/ministries/members.ts`, `members.test.ts`

**Interfaces:**
- Consome: `MinistryDeps`; `readMinistryId`, `readUid`, `parseMembershipRole`, `requireCaller`, `paths` (tarefa 2); `assertCanManageMinistry`, `recalcClaims` (tarefa 2).
- Produz:

```ts
export async function setMemberRole(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>; // data: { ministryId, uid, role: 'member' | 'admin' }
export async function removeMember(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>;   // data: { ministryId, uid }
```

Regras: `assertCanManageMinistry` antes. Alvo sem vínculo → `not-found` "Membro não encontrado.". Mesmo papel pedido → `{ ok: true }` sem gravar. Proteção do último admin: se o caller é só `ministry-admin` (não é admin da app), o alvo é admin, e a operação é rebaixar ou remover, então `listAdminUids` na transação: se o total de admins é 1 ou menos → `failed-precondition` "Não é possível rebaixar o último admin do ministério." (ou "remover", conforme a operação). Admin da app não sofre essa proteção. Rebaixar: `merge` em `{ role, updatedAt, updatedBy }`. Remover: apaga `paths.member`. Depois, `recalcClaims(deps, uid)`.

- [ ] **Passo 1: testes em `members.test.ts`**

```ts
it('admin do ministério torna membro em admin: claim canUploadSong passa a true', ...);
it('admin do ministério não rebaixa o último admin', async () => {
  // seed: adm (admin), u2 (admin) -> só um admin? Caso com um só admin: m1 único admin
  // setMemberRole(deps, 'm1', { ministryId:'hajaluz', uid:'m1', role:'member' }) -> failed-precondition
});
it('com dois admins, o admin do ministério rebaixa um deles', ...);
it('admin do ministério não remove o último admin (removeMember): failed-precondition', ...);
it('admin da app pode rebaixar e remover o último admin', ...); // appAdmin sem vínculo
it('membro comum: permission-denied', ...);
it('admin de outro ministério: permission-denied', ...);
it('alvo sem vínculo: not-found', ...);
it('remover apaga o vínculo e recalcula hasMinistry false', ...);
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/members`. Expected: FAIL.

- [ ] **Passo 3: implementar** `members.ts` conforme as regras.

- [ ] **Passo 4: rodar e ver passar** — mesmo comando, Expected: PASS; typecheck.

**Entregável:** vínculos com proteção do último admin. Mensagem sugerida: `feat(functions): tornar admin, tornar membro e remover membro`.

---

## Tarefa 6: Ministérios e admin da app (`admin.ts`)

**Arquivos:**
- Criar: `apps/functions/src/ministries/admin.ts`, `admin.test.ts`

**Interfaces:**
- Consome: `MinistryDeps`; `validateMinistryFields`, `slugify`, `normalizeForSearch`, `readUid`, `requireCaller`, `paths` (tarefa 2); `assertAppAdmin`, `recalcClaims` (tarefa 2).
- Produz:

```ts
export async function createMinistry(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ministryId: string }>; // data: { name, city }
export async function updateMinistry(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>;          // data: { ministryId, name, city }
export async function setAppAdmin(deps: MinistryDeps, callerUid: string | undefined, data: unknown): Promise<{ ok: true }>;          // data: { uid, appAdmin: boolean }
```

Regras: só admin da app (`assertAppAdmin`) nas três. `createMinistry`: `id = slugify(name)`; vazio → `invalid-argument` "O nome precisa ter letras ou números."; na transação, se `paths.ministry(id)` existe → `failed-precondition` "Já existe um ministério com esse nome."; grava `{ name, nameNormalized: normalizeForSearch(name), city, createdBy: caller, createdAt: now, updatedAt: now }` com `create`. `updateMinistry`: inexistente → `not-found`; `merge` em `{ name, nameNormalized, city, updatedAt }`. Não apaga ministério (fora do escopo). `setAppAdmin`: `uid === caller` → `failed-precondition` "Você não pode alterar o próprio acesso de admin da app."; `appAdmin` não booleano → `invalid-argument`; alvo sem `users/{uid}` → `not-found`; se vai remover e é o último admin da app (`countAppAdmins() <= 1`) → `failed-precondition` "Não é possível remover o último admin da app." (proposta, ver pontos em aberto); grava `merge` em `paths.user(uid)` com `{ appAdmin }` dentro da transação; depois `recalcClaims(deps, uid)`.

- [ ] **Passo 1: testes em `admin.test.ts`**

```ts
it('cria ministério com id slug e campos de busca', async () => {
  // createMinistry(deps, 'app', { name: 'Vida Nova', city: 'Sumaré' }) -> { ministryId: 'vida-nova' }
  expect(docs.get('ministries/vida-nova')).toEqual({ name: 'Vida Nova', nameNormalized: 'vida nova', city: 'Sumaré', createdBy: 'app', createdAt: NOW, updatedAt: NOW });
});
it('id já usado: failed-precondition', ...);
it('nome sem letras: invalid-argument', ...); // 'o.o.'? usar '!!!'
it('admin de ministério não cria: permission-denied', ...);
it('atualiza nome e cidade; nameNormalized recalculado; inexistente: not-found', ...);
it('setAppAdmin marca outro usuário e recalcula claims (appAdmin true)', ...);
it('setAppAdmin no próprio uid: failed-precondition', ...);
it('setAppAdmin remove o último admin da app: failed-precondition', ...);
it('setAppAdmin de quem não é admin da app: permission-denied', ...);
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/admin`. Expected: FAIL.

- [ ] **Passo 3: implementar** `admin.ts`.

- [ ] **Passo 4: rodar e ver passar** — mesmo comando, Expected: PASS; typecheck.

**Entregável:** criação, edição e admin da app. Mensagem sugerida: `feat(functions): criar e editar ministério e marcar admin da app`.

---

## Tarefa 7: Ponte da tela Pessoas e claims completos (`bridge.ts`, `users.ts`)

**Arquivos:**
- Criar: `apps/functions/src/ministries/bridge.ts`, `bridge.test.ts`
- Modificar: `apps/functions/src/users.ts`, `apps/functions/src/users.test.ts`

**Interfaces:**
- Consome: `MinistryDeps`, `paths`, `HAJALUZ_ID` (tarefa 2); `buildClaims`, `Claims` (tarefa 2).
- Produz:

```ts
// bridge.ts
export async function applyHajaLuzRole(deps: MinistryDeps, uid: string, role: Role, callerUid: string): Promise<void>;

// users.ts
export type UserDeps = {
  setClaims(uid: string, claims: Claims): Promise<void>;
  writeUser(uid: string, data: Record<string, unknown>, merge: boolean): Promise<void>;
  userExists(uid: string): Promise<boolean>;
  getUserRole(uid: string): Promise<Role | undefined>;
  applyHajaLuzRole(uid: string, role: Role, callerUid: string): Promise<void>;
  recalcClaims(uid: string): Promise<void>;
  now(): Date;
};
export async function createUserProfile(deps: UserDeps, user: {...}, adminEmails: string[]): Promise<Role>; // assinatura igual
export async function changeUserRole(deps: UserDeps, input: Parameters<typeof validateRoleChange>[0]): Promise<{ uid: string; role: Role }>;
```

Regras da ponte (`applyHajaLuzRole`, numa transação só): `ministries/hajaluz` inexistente → `failed-precondition` "Ministério Haja Luz ainda não existe. Rode a migração antes." (e nada é gravado). `viewer`: apaga `paths.member(HAJALUZ_ID, uid)` se existir; mantém o pedido pendente. `member` ou `admin`: se já há vínculo, `merge` em `{ role, updatedAt: now, updatedBy: callerUid }` (mantém `joinedAt`); senão cria `{ uid, role, displayName, email, photoURL (de users), joinedAt, updatedAt, updatedBy }`; e apaga `paths.request(HAJALUZ_ID, uid)` se existir.

`createUserProfile`: `appAdmin = role === 'admin'` (só vem de `ADMIN_EMAILS`); grava claims com `buildClaims({ role, appAdmin, memberRoles: [] })` (com o retry atual); depois `writeUser` com `appAdmin` e demais campos. O `role` legado continua sendo `admin` para quem está em `ADMIN_EMAILS` (proposta, ver pontos em aberto).

`changeUserRole`: valida (`validateRoleChange`); usuário inexistente → `not-found`; ordem: `applyHajaLuzRole(uid, role, callerUid)` → `writeUser(uid, { role, roleUpdatedAt }, true)` → `recalcClaims(uid)`. Não grava claims diretamente. Se a ponte falhar, nada é gravado.

- [ ] **Passo 1: testes**

`bridge.test.ts`: member cria vínculo com `joinedAt` e apaga pedido pendente; admin cria com `role: 'admin'`; viewer apaga vínculo existente e mantém pedido; sem `ministries/hajaluz` → `failed-precondition` e `docs` inalterado; vínculo existente preserva `joinedAt`.

`users.test.ts` (atualizar os existentes):

```ts
// createUserProfile: claims enviados = { role:'viewer', appAdmin:false, hasMinistry:false, canUploadSong:false }
// createUserProfile ADMIN_EMAILS: claims = { role:'admin', appAdmin:true, hasMinistry:false, canUploadSong:true }; writeUser recebe appAdmin:true
// changeUserRole: ordem de chamadas applyHajaLuzRole -> writeUser -> recalcClaims; setClaims NÃO é chamado
// changeUserRole: applyHajaLuzRole lança -> writeUser não é chamado
// retry de setClaims continua (2 chamadas e writeUser 1 vez)
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/bridge src/users`. Expected: FAIL.

- [ ] **Passo 3: implementar** `bridge.ts` e ajustar `users.ts` (o `UserDeps` novo acima; `setClaimsWithRetry` passa a receber `Claims`).

- [ ] **Passo 4: rodar e ver passar** — mesmo comando; typecheck.

**Entregável:** ponte Pessoas e claims completos. Mensagem sugerida: `feat(functions): ponte da tela Pessoas com o vínculo da Haja Luz`.

---

## Tarefa 8: Estatísticas grava `ministryId` em `setlistUsage`

**Arquivos:**
- Modificar: `apps/functions/src/stats/countUsage.ts`, `apps/functions/src/stats/countUsage.test.ts`, `apps/functions/src/stats/statsDeps.ts`

**Interfaces:**
- Consome: `HAJALUZ_ID` (tarefa 2).
- Produz: `UsageDeps.recordUsage(usage: { setlistId: string; date: string; songIds: string[]; ministryId: string }): Promise<'created' | 'exists'>`.

Avisos e estatísticas continuam lendo a raiz `setlists` nesta entrega; o que muda é só o registro de uso: `countSettledSetlists` passa `ministryId: HAJALUZ_ID` (todo repertório da raiz é da Haja Luz). `statsDeps.recordUsage` grava `ministryId` no `create`.

- [ ] **Passo 1:** em `countUsage.test.ts`, os asserts de `recordUsage` passam a incluir `ministryId: 'hajaluz'` (ajustar todos os `toEqual`/`toHaveBeenCalledWith` existentes).
- [ ] **Passo 2:** rodar `npm run test -w @cifras/functions -- src/stats` e ver falhar.
- [ ] **Passo 3:** implementar a mudança de tipo em `countUsage.ts` e o campo em `statsDeps.ts`.
- [ ] **Passo 4:** rodar e ver passar; typecheck.

**Entregável:** uso com `ministryId`. Mensagem sugerida: `feat(stats): registrar ministryId no uso de repertórios`.

---

## Tarefa 9: Migração pura da Haja Luz (`migration.ts`)

**Arquivos:**
- Criar: `apps/functions/src/ministries/migration.ts`, `migration.test.ts`

**Interfaces:**
- Consome: `HAJALUZ_ID`, `HAJALUZ_NAME`, `HAJALUZ_CITY`, `paths`, `MembershipRole` (tarefa 2).
- Produz:

```ts
export type MigrationUser = { uid: string; email: string | null; displayName: string | null; photoURL: string | null; role: unknown };
export interface MigrationDeps {
  now(): Date;
  listUsers(): Promise<MigrationUser[]>;
  ministryExists(id: string): Promise<boolean>;
  createMinistry(id: string, data: Record<string, unknown>): Promise<boolean>;       // false se já existe
  memberUids(ministryId: string): Promise<Set<string>>;
  requestUids(ministryId: string): Promise<Set<string>>;
  createMembership(ministryId: string, uid: string, data: Record<string, unknown>): Promise<boolean>;
  createRequest(ministryId: string, uid: string, data: Record<string, unknown>): Promise<boolean>;
  listRootSetlists(): Promise<Array<{ id: string; data: Record<string, unknown> }>>;
  targetSetlistIds(ministryId: string): Promise<Set<string>>;
  createTargetSetlist(ministryId: string, id: string, data: Record<string, unknown>): Promise<boolean>;
  deleteTargetSetlist(ministryId: string, id: string): Promise<void>;
  usageIdsWithoutMinistry(): Promise<string[]>;
  setUsageMinistry(setlistId: string, ministryId: string): Promise<void>;
  resolveUidByEmail(email: string): Promise<string>;   // lança se não existir
  setAppAdmin(uid: string): Promise<void>;
  recalcClaims(uid: string): Promise<void>;            // lança em falha
}
export type MigrationReport = {
  dryRun: boolean;
  ministryCreated: boolean;
  members: { created: number; kept: number; skippedNoRole: string[] };
  requests: { created: number; kept: number };
  setlists: { copied: number; kept: number; removedOrphans: number };
  usage: { updated: number };
  appAdmin: string | null;               // uid
  claims: { ok: number; failed: string[] };
};
export async function migrateMinistries(
  deps: MigrationDeps,
  options: { dryRun: boolean; appAdminEmail?: string },
): Promise<MigrationReport>;
```

Mapeamento: `member` → membro; `admin` → admin; `viewer` → pedido pendente (`{ uid, status: 'pending', displayName, email, photoURL, createdAt: now, decidedBy: null, decidedAt: null }`); qualquer outro valor (inclusive ausente) → `skippedNoRole`. Membro: `{ uid, role, displayName, email, photoURL, joinedAt: now, updatedAt: now, updatedBy: 'migration' }`. Ministério: `{ name: 'Haja Luz', nameNormalized: 'haja luz', city: 'São Paulo', createdBy: 'migration', createdAt: now, updatedAt: now }`. Setlist copiada: mesmo id e mesmos campos. Uso: `ministryId` só onde falta.

Ordem na execução real: (1) se há e-mail, `resolveUidByEmail` (antes de qualquer escrita; falha aborta sem escrever); (2) criar ministério se não existe; (3) membros e pedidos (`create`; quem já existe conta em `kept`); (4) copiar setlists que faltam (`create`; existente conta em `kept`); apagar destinos sem raiz (`removedOrphans`); (5) `setUsageMinistry` onde falta; (6) `setAppAdmin(uid)`; (7) `recalcClaims` de todos os usuários (falha de um não interrompe; entra em `claims.failed`). Dry-run: nenhuma chamada de escrita (`createMinistry`, `createMembership`, `createRequest`, `createTargetSetlist`, `deleteTargetSetlist`, `setUsageMinistry`, `setAppAdmin`, `recalcClaims`); só leituras; o relatório mostra o que seria feito. `resolveUidByEmail` é leitura e roda no dry-run.

- [ ] **Passo 1: testes em `migration.test.ts`** (fake em memória de `MigrationDeps`)

```ts
it('cria o ministério Haja Luz (real) e, no dry-run, não chama createMinistry', ...);
it('mapeia member para membro, admin para admin, viewer para pedido pendente, sem role para skippedNoRole', ...);
it('não sobrescreve vínculo existente (kept)', ...);
it('copia setlists que faltam e preserva o destino existente (kept)', ...);
it('apaga destino órfão (sem raiz) na execução real', ...);
it('preenche ministryId só em setlistUsage sem ministryId', ...);
it('e-mail do admin da app não encontrado: lança antes de qualquer escrita', ...);
it('--app-admin marca só esse uid como appAdmin', ...);
it('dry-run: nenhuma escrita, relatório completo', ...);
it('falha de claims em um usuário é relatada e não interrompe', ...);
it('segunda execução não cria nada (idempotente)', ...); // executa duas vezes sobre o mesmo fake
```

- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/ministries/migration`. Expected: FAIL.

- [ ] **Passo 3: implementar** `migration.ts` conforme a ordem acima.

- [ ] **Passo 4: rodar e ver passar** — mesmo comando; typecheck.

**Entregável:** migração pura testada. Mensagem sugerida: `feat(functions): migração idempotente da Haja Luz (lógica)`.

---

## Tarefa 10: Adaptadores firebase-admin de `MinistryDeps`

**Arquivos:**
- Criar: `apps/functions/src/ministries/adminDeps.ts`

**Interfaces:**
- Consome: tipos de `deps.ts` (tarefa 2); `ROLES` de `roles.ts`; `getFirestore`, `getAuth`.
- Produz: `export function createMinistryDeps(): MinistryDeps;`

Sem teste unitário, como em `push/adminDeps.ts` (adaptador sem lógica): validado por typecheck, pelo dry-run da migração e pela checagem depois do release. Pontos que o executor não pode errar:
- `runTransaction`: `db.runTransaction(async (t) => fn(adapterTx(t)))`. O `write` do `tx` aplica na hora (`t.create`, `t.set` ou `t.set(..., { merge: true })`, `t.delete`). Como os callers leem antes de escrever, isso basta.
- `readUser`: `role` passa por `ROLES.find` (inválido vira `undefined`); `appAdmin` é `=== true`.
- `listMembershipsOfUser`: `db.collectionGroup('members').where('uid', '==', uid).get()`, com `ministryId` vindo de `doc.ref.parent.parent.id`.
- `listPendingRequestsOfUser`: `collectionGroup('requests')` com `where('uid','==',uid)` e `where('status','==','pending')`.
- `listAdminUids` (dentro da transação, por `t.get(query)`): `collection(ministries/{id}/members).where('role','==','admin')`.
- `countAppAdmins`: `db.collection('users').where('appAdmin','==',true).count().get()`.
- `setClaims`: `getAuth().setCustomUserClaims(uid, claims)`.

- [ ] **Passo 1:** nenhum teste unitário; ver o passo 3.
- [ ] **Passo 2:** não se aplica.
- [ ] **Passo 3:** implementar `adminDeps.ts` com os pontos acima.
- [ ] **Passo 4:** `npm run typecheck -w @cifras/functions`, Expected: sem erros.

**Entregável:** adaptadores para as tarefas 4 a 7 e 11. Mensagem sugerida: `feat(functions): adaptadores firebase-admin dos ministérios`.

---

## Tarefa 11: CLI de migração (`migrateCli.ts`), config e scripts

**Arquivos:**
- Criar: `apps/functions/src/ministries/migrateCli.ts`, `apps/functions/tsup.migrate.config.ts`, `apps/functions/src/cli/projectId.ts`
- Modificar: `apps/functions/src/lyrics/backfillCli.ts` (importa `resolveProjectId` de `cli/projectId.ts`; remover a cópia local), `apps/functions/src/lyrics/backfillTarget.ts` (`bucket?: string`; a linha `bucket:` só sai quando houver valor), `apps/functions/src/lyrics/backfillTarget.test.ts`, `apps/functions/package.json` (script), `package.json` da raiz (script)

**Interfaces:**
- Consome: `migrateMinistries`, `MigrationDeps` (tarefa 9); `createMinistryDeps` e `recalcClaims` (tarefas 2 e 10); `describeTarget` (`lyrics/backfillTarget.ts`).
- Produz: scripts `npm run ministries:migrate -- [--dry-run] [--app-admin <e-mail>]`.

Comportamento: `parseArgs` com `dry-run` (booleano) e `app-admin` (texto, opcional). Inicializa `firebase-admin` com `projectId` de `GOOGLE_CLOUD_PROJECT`/`GCLOUD_PROJECT` ou do ADC (`resolveProjectId`). Imprime `describeTarget` (projeto, modo, variáveis de emulador) e, sem projeto identificado e sem `--dry-run`, sai com código 1 sem gravar. Não imprime o e-mail: imprime só o uid resolvido. Ao final, imprime o relatório (contagens e `claims.failed`) e sai com código 1 se houver falha de claims ou de escrita. Implementa `MigrationDeps` com `firebase-admin` (mesmos caminhos de `paths`); `createTargetSetlist` e `createMembership` usam `create` e devolvem `false` em `ALREADY_EXISTS` (código gRPC 6 ou `'ALREADY_EXISTS'`); `recalcClaims` vem de `createMinistryDeps()`.

`tsup.migrate.config.ts`: igual a `tsup.backfill.config.ts`, com `entry: ['src/ministries/migrateCli.ts']`, `clean: false`, `external: ['firebase-admin', 'firebase-functions']`. Script em `apps/functions/package.json`: `"ministries:migrate": "tsup --config tsup.migrate.config.ts && node lib/migrateCli.mjs"`. Na raiz: `"ministries:migrate": "npm run ministries:migrate -w @cifras/functions --"`.

- [ ] **Passo 1: testes** em `backfillTarget.test.ts`: caso novo "sem bucket não imprime a linha bucket" (`describeTarget({ projectId: 'p', dryRun: true, env: {} }).lines` não contém `bucket:`). Os casos existentes continuam passando.
- [ ] **Passo 2: rodar e ver falhar** — `npm run test -w @cifras/functions -- src/lyrics/backfillTarget`. Expected: FAIL no caso novo.
- [ ] **Passo 3: implementar** as mudanças de `backfillTarget.ts`, `cli/projectId.ts` (função extraída sem mudança de comportamento), `backfillCli.ts` (import), `migrateCli.ts`, `tsup.migrate.config.ts` e os dois scripts.
- [ ] **Passo 4:** `npm run test -w @cifras/functions -- src/lyrics/backfillTarget` (PASS); `npm run typecheck -w @cifras/functions` (PASS). Não rodar o CLI contra produção nesta fase.

**Entregável:** CLI pronto para a pessoa rodar no Cloud Shell. Mensagem sugerida: `feat(functions): CLI de migração dos ministérios`.

---

## Tarefa 12: Cabeamento de `index.ts`

**Arquivos:**
- Modificar: `apps/functions/src/index.ts`

**Interfaces:**
- Consome: as funções exportadas das tarefas 3 a 7 e 10 (nomes fixados abaixo).
- Produz: exports novos.

Mudanças:
- `deps` (`UserDeps`): `setClaims` passa a receber `Claims`; `applyHajaLuzRole: (uid, role, caller) => applyHajaLuzRole(ministryDeps, uid, role, caller)`; `recalcClaims: (uid) => recalcClaims(ministryDeps, uid)`. `onUserCreated` e `setUserRole` continuam com a mesma chamada.
- `ministryDeps = createMinistryDeps()`.
- Callables novas (todas `onCall({ region: REGION }, (request) => ...)` com `request.auth?.uid` e `request.data`):
  `requestMinistryAccess` (requestAccess), `cancelMinistryRequest` (cancelRequest), `approveMinistryRequest`, `rejectMinistryRequest`, `setMinistryMemberRole` (setMemberRole), `removeMinistryMember` (removeMember), `createMinistry`, `updateMinistry`, `setAppAdmin`. Importar as funções de lógica com alias (`createMinistry as createMinistryLogic`), no mesmo padrão de `index.ts`.
- Trigger: `export { mirrorSetlists } from './ministries/mirrorTrigger';`.

- [ ] **Passo 1:** sem teste unitário (fiação). A verificação é o typecheck e o `test:rules` da tarefa 1, que não dependem deste arquivo.
- [ ] **Passo 2:** não se aplica.
- [ ] **Passo 3:** editar `index.ts`.
- [ ] **Passo 4:** `npm run typecheck -w @cifras/functions`; `npm run test -w @cifras/functions -- src/ministries src/users` (PASS).

**Entregável:** Functions exportadas. Mensagem sugerida: `feat(functions): expor callables e espelho de ministérios`.

---

## Tarefa 13: Documentação (`docs/sistema.md`, `docs/deploy.md`)

**Arquivos:**
- Modificar: `docs/sistema.md`, `docs/deploy.md`

**Interfaces:** nenhuma (usa os nomes deste plano).

`docs/sistema.md`: em "Dados", acrescentar as coleções novas (`ministries`, `ministries/{id}/members`, `ministries/{id}/requests`, `ministries/{id}/setlists` como espelho da raiz nesta fase), `users.appAdmin` e `setlistUsage.ministryId`; em "Papéis e permissões", uma nota de que os claims `appAdmin`, `hasMinistry` e `canUploadSong` existem e são gravados junto do `role` (sem efeito visível ainda); em "Functions e jobs", as callables novas e `mirrorSetlists`; em "Limites conhecidos e pendências", a nota "Preparação invisível: a interface ainda usa a raiz `setlists`". Se o arquivo passar de cerca de 300 linhas (já tem ~300), condensar texto existente da seção afetada, sem remover limites.

`docs/deploy.md`: seção nova **18. Ministérios: preparação (#135)**, com:
- Antes do release: conferir que `ADMIN_EMAILS` tem só o e-mail da pessoa dona (§7).
- Depois do release: em Firestore > Índices, os três índices de grupo (`members.uid`, `requests.uid`, `requests.status`) estão "Ativado" antes da migração; em TTL, a política de `setlists` cobre também o caminho `ministries/*/setlists` (é por nome de grupo).
- Migração no Cloud Shell, na raiz: `npm run ministries:migrate -- --dry-run --app-admin <e-mail>`; conferir `projeto:` e a ausência de `_EMULATOR_HOST`; depois, sem `--dry-run`, com o mesmo `--app-admin`. Rodar fora da janela do culto.
- Conferência: `ministries/hajaluz`; contagem de `ministries/hajaluz/setlists` igual à de `setlists`; `setlistUsage` com `ministryId`.
- Passo de volta: reverter só o código (Functions); os dados copiados ficam e não afetam o app de hoje.

- [ ] **Passo 1:** conferir as seções de referência (`docs/deploy.md` §7, §10, §12) para manter o formato.
- [ ] **Passo 2:** não se aplica (documentação). Verificação: revisão do `code-reviewer` no PR (o `code-reviewer` cobra `docs/sistema.md`).
- [ ] **Passo 3:** escrever as mudanças.
- [ ] **Passo 4:** conferir que nenhum e-mail real aparece (usar `<e-mail>`).

**Entregável:** docs da entrega. Mensagem sugerida: `docs: ministérios na preparação (sistema e deploy)`.

---

## Verificação final (orquestrador, depois da tarefa 13)

- `npm run test:rules` (inclui `ministerios.rules.test.ts`); sem Java: `docker compose run --rm --no-deps emulators npm run test:rules`.
- `npm run test -w @cifras/functions -- src/ministries src/users src/stats src/lyrics` (filtrado; não rodar a suíte inteira).
- `npm run typecheck -w @cifras/functions`.
- `npx eslint apps/functions/src/ministries apps/functions/src/users.ts apps/functions/src/index.ts apps/functions/src/stats apps/functions/src/lyrics apps/functions/src/cli tests/rules/ministerios.rules.test.ts`.
- `npm run build -w @cifras/functions`: quando houver memória; senão fica para o CI.
- Não rodar: E2E, `npm run test:harness` (nenhum arquivo de `.claude/` muda) e a suíte completa com pouca memória.

---

## Decisões e pontos em aberto (para a pessoa e o orquestrador)

1. **Campo `uid` em `members` e `requests`** (o spec não lista). É necessário para a consulta de grupo por uid (saber os vínculos de uma pessoa sem varrer tudo). Proposta: adicionar; o campo é a cópia do id do documento.
2. **Nomes dos claims:** `appAdmin`, `hasMinistry`, `canUploadSong`; `role` continua até a limpeza. Risco: `setCustomUserClaims` substitui o objeto inteiro; por isso todo writer passa os quatro campos (testado nas tarefas 2 e 7).
3. **Ponte Pessoas, "Visitante":** remove só o vínculo e mantém o pedido pendente (o spec diz "sem vínculo"). Proposta acima. Confirmar.
4. **Ponte Pessoas, "Admin" entre a Preparação e o Pacote:** continua gravando `role: admin` legado, que dá os poderes de admin da app de `requireRole` até o Pacote (nenhuma mudança visível). O "sem admin da app" do spec vale a partir do Pacote. Confirmar que é isso.
5. **Ordem release → migração:** a ponte exige `ministries/hajaluz`. Entre o release e a migração, mudar papel em Pessoas falha com mensagem. Proposta: rodar a migração logo depois do release, combinada com a pessoa.
6. **Último admin da app:** a tarefa 6 bloqueia remover o último admin da app. Não está no spec. Proposta: manter; a pessoa pode vetar.
7. **Admin do ministério rebaixando a si mesmo:** permitido, desde que não seja o último. O spec não fala.
8. **Id do ministério:** slug do nome; colisão de id vira erro. Nomes iguais com slugs diferentes são aceitos (o spec não exige unicidade de nome).
9. **Espelho:** lê a raiz no momento em vez do evento (ordem e repetição não importam) e usa `retry: true` (idempotente). Proposta.
10. **Migração e corrida com edição:** cópias só de criação (um repertório editado depois da cópia não é revertido) e varredura final dos destinos sem raiz. Corrida rara (apagar um repertório durante a migração) é corrigida pela varredura; a migração roda depois do espelho já ativo.
11. **Um pedido pendente por pessoa, entre ministérios:** conferido por consulta fora da transação; corrida muito rara aceita.
12. **`countSettledSetlists` grava `ministryId: 'hajaluz'` já nesta entrega** (tarefa 8), senão os registros novos saem sem o campo até o Pacote. Confirmar: é uma mudança de comportamento invisível, mas não estava na lista da Preparação.
13. **Tamanho de `docs/sistema.md`:** já tem cerca de 300 linhas (teto do AGENTS.md). A tarefa 13 condensa texto da seção afetada.
14. **Índices e emulador:** o emulador não exige índices, então a validação real é em produção (passo manual antes da migração).
15. **Índice de `rehearsalAt` em grupo** (spec §4.5) não entra aqui: avisos continuam na raiz nesta entrega; entra no Pacote.
16. **`onUserCreated`:** continua gravando o `role` legado (`admin` para `ADMIN_EMAILS`) além de `appAdmin: true`. O spec diz "deixa de dar papel de leitura"; manter o legado evita tirar o acesso do dono do cliente atual antes do Pacote.
17. **Callables que já existem** (`updateSongMeta`, `deleteSong`, etc.) continuam com `requireRole` por `role`; a troca para `appAdmin` é do Pacote.
18. **Adaptadores (tarefa 10) e CLI (tarefa 11) sem teste unitário de I/O:** a lógica testada está em `migration.ts` e nos módulos de domínio; o restante é validado por typecheck, dry-run e checagem depois do release.

---

## Passos manuais da pessoa (ordem)

1. Antes do release: conferir `ADMIN_EMAILS` (variável do repositório) com só o e-mail dela (`docs/deploy.md` §7).
2. Release (merge commit do orquestrador, fora da janela do culto), combinado com a pessoa. O release traz Rules, índices e Functions.
3. Firestore > Índices: `members.uid`, `requests.uid` e `requests.status` (COLLECTION_GROUP) em "Ativado". Firestore > TTL: a política de `setlists` cobre o grupo.
4. Cloud Shell, na raiz do repositório: `npm ci`, `gcloud config set project <id-do-projeto>`, depois `npm run ministries:migrate -- --dry-run --app-admin <e-mail>`. Conferir `projeto:` e a ausência de `_EMULATOR_HOST`.
5. Sem `--dry-run`, com o mesmo `--app-admin`. Fora da janela do culto.
6. Conferir no Firestore: `ministries/hajaluz`; `members` e `requests` batendo com a tela Pessoas; `ministries/hajaluz/setlists` com o mesmo número de `setlists`; `setlistUsage` com `ministryId`.
7. Abrir `https://louvor-hajaluz.web.app` como admin: tudo igual a antes (a interface não muda); trocar um papel em Pessoas e ver o vínculo mudar.

## Riscos

- **Índice de grupo ainda não ativo:** pedidos, troca de vínculo e o recálculo de claims falham com `failed-precondition` até o índice ficar pronto. Mitigação: passo 3 antes da migração e da ponte.
- **Claims atrasados:** o token leva até 1 h para refletir um vínculo. Sem efeito nesta entrega (nada lê claims novos); no Pacote, o cliente força o refresh.
- **Pedidos em massa:** a migração cria um pedido pendente para cada visitante de hoje (decisão do spec). A Haja Luz vai ver esses pedidos em Pessoas; é o esperado, mas precisa ser avisado.
- **Custo:** o espelho dobra as invocações de gravação em `setlists` (uma a mais por gravação); as consultas de grupo lêem poucos documentos. Insignificante para o volume da igreja.
- **Rollback:** reverter o código das Functions para o estado anterior para o espelho e a ponte. Os dados em `ministries/` não afetam o app de hoje e não precisam ser apagados.
