# Fase 8 — Repertórios (setlists): Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membros montam o repertório de um culto (data + rótulo, louvores ordenados, cada um num tom), editam na hora (arrastar, ▲ ▼, trocar tom, remover, acrescentar), e todos os músicos navegam pelas cifras do repertório com Anterior/Próxima; mudanças de outra pessoa chegam ao vivo atrás de um banner "Atualizar"; cada repertório some 30 dias após a data do culto.

**Architecture:** Coleção `setlists` com a lista de itens dentro do documento; edições são operações puras aplicadas ao estado mais recente dentro de `runTransaction`. Uma assinatura por repertório aberto alimenta um reducer (`latest` × `shown`) mantido acima das rotas, de modo que a lista e o visualizador compartilham o mesmo estado e o mesmo banner. TTL do Firestore em `expiresAt`, com o cliente escondendo os vencidos. Sem Cloud Function.

**Tech Stack:** React 19, react-router 8, Firebase 13 (Firestore), Vitest + Testing Library, `@firebase/rules-unit-testing`, Playwright, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` (versões **exatas**, a mais recente estável com mais de 2 semanas, só no chunk da rota do repertório).

**Spec:** `docs/superpowers/specs/2026-11-16-repertorios-design.md` (§6 completo); pai: `docs/superpowers/specs/2026-11-13-church-cifras-design.md`.

## Global Constraints

- Limites: até **40** itens; `label` de **1 a 60** caracteres; `date` `YYYY-MM-DD`; id do documento casa `[A-Za-z0-9_-]{1,100}` (`validId` existente).
- TTL: `expiresAt` = fim do dia de `date` em `America/Sao_Paulo` (UTC−3 fixo) + **30 dias**; `date` anterior a 29 dias atrás é barrada na UI ("já expiraria"). As rules **não** conferem o cálculo de `expiresAt` (só que é timestamp): risco aceito, coberto por testes do cliente.
- Rules: leitura `signedIn()`; create/update/delete `isEditor()`. Create e update exigem `createdBy`/`updatedBy == request.auth.uid` e `createdAt`/`updatedAt == request.time`; update não altera `createdBy`/`createdAt`.
- Rotas: `/?aba=repertorios`, `/repertorios/:id`, `/musicas/:songId?tom=X&repertorio=:id&item=:itemId`. `?tom=` continua sendo a fonte de verdade do tom exibido.
- Textos (pt-BR, exatos): `Próximo culto`, aba `Repertórios`, `＋ Novo repertório`, `＋ Adicionar`, `O repertório foi alterado.` + botão `Atualizar`, `Música removida`, `já está`, `Fora do repertório`, `Voltar ao repertório`, `Tom do repertório: G` + `Voltar ao G`, `O tom deste louvor mudou para A`, barra `‹ Anterior · 2 de 5 · Próxima ›`.
- Banner = elemento na tela com `role="status"`, **nunca** `alert()`/`confirm()` do navegador.
- Padrões do repositório: API injetável + fake em `apps/web/src/test/`, `Dialog`/`ConfirmDialog` de `apps/web/src/viewer/`, classes de `apps/web/src/ui/styles.css` (`.list`, `.list-card`, `.chip`, `.fab`, `.notice`, `.btn`, `.dialog`); UI pt-BR, identificadores em inglês; TS strict; versões exatas; Conventional Commits em inglês + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add` e `git commit` em comandos separados.
- Entrega em PRs sequenciais para `develop`, cada um com o template e revisado pelo `code-reviewer`: **A** = Task 1 (`feat/setlists-rules`), **B** = Tasks 2–5 (`feat/setlists-core`), **C** = Tasks 6–8 (`feat/setlists-ui`), **D** = Task 9 (`feat/setlists-viewer`), **E** = Task 10 (`test/setlists-e2e`).

## Review Focus

1. **Primeiro snapshot vindo do cache** (até 30 dias velho) → o músico abre o repertório sem banner falso — teste do reducer (Task 3) e do provider (Task 5).
2. **Dois líderes acrescentam ao mesmo tempo** → nenhum acréscimo se perde — teste de `applyOp` com transação que já vê o item do outro (Task 4).
3. **Item aberto removido por outra pessoa e o músico toca em "Atualizar"** → a cifra continua aberta, barra "Fora do repertório" — teste (Task 9).
4. **Tom do item apagado pelo admin** → a cifra abre no tom padrão **com aviso**, nunca em silêncio — teste (Task 9).
5. **Virada de dia/fuso e vencidos**: às 23:30 em Brasília já é o dia seguinte em UTC; repertório com `expiresAt` no passado (TTL ainda não rodou) não aparece — testes de `todayLocal`, `expiresAtFor`, `groupSetlists` (Task 2).

---

### Task 1: Rules e TTL de `setlists` (backend-dev) — PR A

**Files:** `firestore.rules` (modify), `firestore.indexes.json` (modify), `tests/rules/setlists.rules.test.ts` (create; mesmo setup de `firestore.rules.test.ts`: `initializeTestEnvironment`, `clearFirestore` no `beforeEach`), `tests/config/firestore-indexes.test.ts` (create).

**Interfaces:**
- Produces: documento `setlists/{id}` com campos exatos `date, label, items, expiresAt, createdBy, createdAt, updatedBy, updatedAt` (tipos do spec §6.1).

- [ ] **Step 1: testes que falham.** Em `setlists.rules.test.ts`, helper `setlistData(over)` válido (`date: '2026-11-22'`, `label: 'Domingo'`, `items: []`, `expiresAt: Timestamp.fromDate(new Date('2026-12-23T03:00:00Z'))`, `createdBy/updatedBy: 'm1'`, `createdAt/updatedAt: serverTimestamp()`). Casos (`assertSucceeds`/`assertFails`): leitura por viewer/member/admin ok e anônimo falha; create por member e admin ok, por viewer e anônimo falha; create com `items` vazio ok; com 41 itens falha; com 40 ok; `label` vazio e `label` de 61 caracteres falham; `date` `'22/11/2026'` falha; chave extra e chave ausente falham; `expiresAt` string falha; `createdBy` de outro uid falha; id com 101 caracteres (`'x'.repeat(101)`) falha; update por member (mudar `items`, `label`, `date`, `expiresAt`, com `updatedBy` próprio e `updatedAt: serverTimestamp()`) ok; update de viewer falha; update alterando `createdBy` ou `createdAt` falha; update com `updatedBy` de outro uid falha; delete por member/admin ok e por viewer falha. Em `firestore-indexes.test.ts`: lê `firestore.indexes.json` e afirma um override com `collectionGroup: 'setlists'`, `fieldPath: 'expiresAt'`, `ttl: true` **e** um índice `{ order: 'ASCENDING', queryScope: 'COLLECTION' }` mantido (spec §6.2: não pode desligar o índice da consulta).
- [ ] **Step 2:** `npm run test:rules` e `npm test -w @cifras/tests` → FAIL.
- [ ] **Step 3: `validSetlist(data)` e `match /setlists/{setlistId}` em `firestore.rules`** conforme as Global Constraints (`data.keys().hasOnly/hasAll`, `date.matches('[0-9]{4}-[0-9]{2}-[0-9]{2}')`, `label` string de 1–60, `items is list && items.size() <= 40`, `expiresAt is timestamp`). Acrescente o override de TTL em `firestore.indexes.json` com o índice ascendente.
- [ ] **Step 4:** os mesmos comandos → PASS. Confirme que o emulador sobe sem aviso sobre `firestore.indexes.json`. Se o `firebase-tools` 15.36.0 rejeitar `ttl`, mantenha só o índice, configure o TTL com `gcloud firestore fields ttls update expiresAt --collection-group=setlists --enable-ttl` e documente o comando em `AGENTS.md` (seção Comandos).
- [ ] **Step 5: commit** `feat(rules): setlists collection rules and TTL policy`.

### Task 2: Datas, seletores e itens puros (frontend-dev) — PR B

**Files:** `apps/web/src/setlists/types.ts`, `dates.ts`, `selectors.ts`, `items.ts` (create) e os `*.test.ts` ao lado.

**Interfaces:**
- Produces (`types.ts`): `SetlistItem { id: string; songId: string; key: KeyName }`; `Setlist { id: string; date: string; label: string; items: SetlistItem[]; expiresAt: Date; createdAt: Date | null }`; `SetlistOp = { type: 'add'; item: SetlistItem } | { type: 'remove'; itemId: string } | { type: 'move'; itemId: string; afterItemId: string | null } | { type: 'setKey'; itemId: string; key: KeyName }`; constantes `MAX_ITEMS = 40`, `LABEL_MAX = 60`, `TTL_DAYS = 30`.
- Produces (`dates.ts`): `todayLocal(now: Date): string`; `expiresAtFor(date: string): Date`; `defaultCultoDate(today: string): string`; `defaultLabel(date: string): string`; `isTooOld(date: string, today: string): boolean`; `isExpired(setlist: Setlist, now: Date): boolean`.
- Produces (`selectors.ts`): `groupSetlists(setlists: Setlist[], today: string, now: Date): { upcoming: Setlist[]; recent: Setlist[] }`; `nextCultos(setlists: Setlist[], today: string, now: Date): Setlist[]`; `sameContent(a: Setlist | null, b: Setlist | null): boolean`.
- Produces (`items.ts`): `newItemId(): string`; `copyItems(items: SetlistItem[]): SetlistItem[]` (ids novos); `defaultKeyFor(song: SongSummary): KeyName | null` (`handmadeKeys[0] ?? keys[0] ?? null`).

- [ ] **Step 1: testes que falham.** `dates`: `todayLocal(new Date('2026-11-23T02:30:00Z'))` → `'2026-11-22'`; `todayLocal(new Date('2026-11-22T03:00:00Z'))` → `'2026-11-22'`; `expiresAtFor('2026-11-22')` → `2026-12-23T03:00:00.000Z`; `expiresAtFor('2026-12-15')` → `2027-01-15T03:00:00.000Z`; `expiresAtFor('2028-02-01')` → `2028-03-03T03:00:00.000Z`; `defaultCultoDate`: `'2026-11-16'`→`'2026-11-19'` (seg→qui), `'2026-11-19'`→ ela mesma, `'2026-11-20'`→`'2026-11-22'`, `'2026-11-22'`→ ela mesma, `'2026-11-23'`→`'2026-11-26'`; `defaultLabel('2026-11-22')`→`'Domingo'`, `'2026-11-19'`→`'Quinta'`, `'2026-11-18'`→`'Quarta'`; `isTooOld('2026-10-17','2026-11-16')` true e `'2026-10-18'` false; `isExpired` com `expiresAt` igual a `now` → true. `selectors`: `groupSetlists` esconde vencidos, `upcoming` por data crescente (mesma data: `createdAt` crescente, depois `id`), `recent` por data decrescente, hoje conta como `upcoming`; `nextCultos` devolve **todos** os repertórios da menor data ≥ hoje e `[]` se não houver; `sameContent` compara `date`, `label` e `items` (id+songId+key, na ordem), ignora `expiresAt`/`createdAt`, e `null`×`null` é `true`, `null`×objeto `false`. `items`: `copyItems` mantém `songId`/`key` e troca todos os ids; `defaultKeyFor` cobre handmade, só gerados (`keys[0]`) e sem tons (`null`).
- [ ] **Step 2:** `npm test -w @cifras/web -- setlists` → FAIL.
- [ ] **Step 3: implementar as assinaturas acima.** `todayLocal` com `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`; `expiresAtFor` = `Date.UTC(y, m-1, d+1, 3) + TTL_DAYS * 86_400_000` (sem biblioteca de datas); dia da semana via `Date.UTC`.
- [ ] **Step 4:** testes → PASS; `npm run typecheck`.
- [ ] **Step 5: commit** `feat(web): setlist dates, selectors and item helpers`.

### Task 3: Operações e sincronização puras (frontend-dev) — PR B

**Files:** `apps/web/src/setlists/ops.ts`, `sync.ts`, `navigation.ts` (create) e os `*.test.ts`.

**Interfaces:**
- Consumes: tipos e `sameContent` (Task 2).
- Produces (`ops.ts`): `applySetlistOp(items: SetlistItem[], op: SetlistOp): { items: SetlistItem[]; changed: boolean }`; `class SetlistFullError extends Error`.
- Produces (`sync.ts`): `interface SetlistSnapshot { setlist: Setlist | null; fromCache: boolean }`; `interface SyncState { phase: 'loading' | 'ready' | 'not-found'; latest: Setlist | null; shown: Setlist | null; synced: boolean }`; `type SyncEvent = { type: 'snapshot'; snap: SetlistSnapshot } | { type: 'accept' } | { type: 'adopt'; setlist: Setlist } | { type: 'optimistic'; setlist: Setlist }`; `initialSync: SyncState`; `syncReducer(state: SyncState, event: SyncEvent): SyncState`; `hasChanges(state: SyncState): boolean`; `isRemoved(state: SyncState): boolean`.
- Produces (`navigation.ts`): `interface ItemNav { position: number; total: number; prev: SetlistItem | null; next: SetlistItem | null; inList: boolean }`; `navigateItems(items: SetlistItem[], songs: SongSummary[], currentItemId: string | null): ItemNav`; `itemHref(setlistId: string, item: SetlistItem): string`.

- [ ] **Step 1: testes que falham.** `ops`: `add` ao fim; `add` com id já existente → `changed: false`; `add` com 40 itens → lança `SetlistFullError`; `remove` e `setKey` de item existente; `remove`/`setKey`/`move` de id inexistente → `changed: false` e lista igual; `move` com `afterItemId: null` vai ao início; `move` depois de `c` em `[a,b,c,d]` movendo `a` → `[b,c,a,d]`; movendo `d` depois de `a` → `[a,d,b,c]`; `afterItemId` inexistente → vai ao fim; mover depois de si mesmo → `changed: false`. `sync` (ver Review Focus 1): snapshot só de cache com `setlist: null` mantém `phase: 'loading'`; snapshot do servidor com `null` e `shown` nulo → `'not-found'`; **antes do primeiro snapshot do servidor** (`synced: false`) cada snapshot move `shown` junto com `latest` (sem banner), e snapshot de cache não marca `synced`; depois de `synced`, um snapshot diferente muda só `latest` e `hasChanges` vira `true`; mudança revertida (conteúdo volta a ser igual) → `hasChanges` `false`; `accept` copia `latest` para `shown`; `accept` com `latest` nulo não faz nada; snapshot `null` do servidor depois de pronto mantém `shown`, zera `latest` e `isRemoved` é `true`; `adopt` iguala `shown` e `latest`; `optimistic` só muda `shown`. `navigation`: itens cuja música não existe ou não tem tons ficam fora de `total` e de `prev`/`next`; `position` conta só os que abrem cifra (`2 de 5`); item atual fora da lista → `inList: false`, `position: 0`, `prev`/`next` `null`; `itemHref('r1', { id: 'i1', songId: 's1', key: 'F#m' })` → `/musicas/s1?tom=Fsm&repertorio=r1&item=i1` (o `?tom=` usa `keySlug`, como o `KeyChips`).
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar.** `move` e `applySetlistOp` sem mutar a entrada; `syncReducer` conforme os testes (regra do spec §6.5: `shown` acompanha `latest` até o primeiro snapshot com `fromCache === false`).
- [ ] **Step 4:** testes → PASS; typecheck.
- [ ] **Step 5: commit** `feat(web): pure setlist operations, sync reducer and item navigation`.

### Task 4: `SetlistApi` e fake (frontend-dev) — PR B

**Files:** `apps/web/src/setlists/setlistApi.ts` (create), `setlistApi.firebase.test.ts` (create; mesma abordagem de mock de `catalogApi.firebase.test.ts`), `apps/web/src/test/fakeSetlistApi.ts` (create).

**Interfaces:**
- Consumes: `FirebaseServices` (`apps/web/src/lib/firebase.ts`), tipos (Task 2), `applySetlistOp` (Task 3).
- Produces:
  ```ts
  export interface SetlistApi {
    subscribeSetlists(cb: (setlists: Setlist[]) => void, onError: (e: unknown) => void): () => void;
    subscribeSetlist(id: string, cb: (snap: SetlistSnapshot) => void, onError: (e: unknown) => void): () => void;
    createSetlist(input: { date: string; label: string; items: SetlistItem[] }): Promise<string>;
    updateSetlistMeta(id: string, input: { date: string; label: string }): Promise<void>;
    applyOp(id: string, op: SetlistOp): Promise<{ setlist: Setlist; changed: boolean }>;
    deleteSetlist(id: string): Promise<void>;
  }
  export function createSetlistApi(services: FirebaseServices): SetlistApi;
  export class SetlistGoneError extends Error {}
  ```
  `fakeSetlistApi(initial?: Setlist[], overrides?: Partial<SetlistApi>)` devolve a API em memória **e** `push(id, snap)`/`pushList(setlists)` para os testes simularem mudanças de outra pessoa.

- [ ] **Step 1: testes que falham.** Com `firebase/firestore` mockado: `subscribeSetlists` consulta `setlists` com `where('expiresAt', '>', agora)` e converte `Timestamp` em `Date`; `subscribeSetlist` usa `onSnapshot` com `includeMetadataChanges: true` e entrega `fromCache` de `snap.metadata.fromCache`, `setlist: null` quando o documento não existe; item inválido no documento (sem `songId` ou `key` fora dos 24 tons) é descartado na conversão; `createSetlist` grava `expiresAt: Timestamp.fromDate(expiresAtFor(date))`, `createdBy`/`updatedBy` = uid, `createdAt`/`updatedAt` = `serverTimestamp()` e devolve o id; `updateSetlistMeta` regrava `date`, `label`, `expiresAt` recalculado, `updatedBy`, `updatedAt` e não toca `createdBy`/`createdAt`; **(Review Focus 2)** `applyOp` roda em `runTransaction`, lê o documento **dentro** da transação e aplica a operação ao que leu: com a leitura já contendo um item de outra pessoa, `add` devolve os dois itens; documento inexistente → lança `SetlistGoneError`; `changed: false` não escreve nada; `SetlistFullError` propaga; `deleteSetlist` apaga o documento.
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar `createSetlistApi`** no estilo de `createCatalogApi` (uid via `auth.currentUser`, erro "Usuário não autenticado" se ausente). Implementar também o fake.
- [ ] **Step 4:** testes → PASS; typecheck e lint.
- [ ] **Step 5: commit** `feat(web): setlist api over firestore with transactional edits`.

### Task 5: Providers e fiação no App (frontend-dev) — PR B

**Files:** `apps/web/src/setlists/SetlistsProvider.tsx`, `ActiveSetlistProvider.tsx`, `useActiveSetlist.ts` (create) e testes; `apps/web/src/App.tsx`, `apps/web/src/bootstrap.tsx` (modify); atualizar os testes existentes que montam `<App>` (`App.test.tsx`, `App.import.test.tsx`, `App.upload.test.tsx`, `App.uploadError.test.tsx`, `routes/routes.test.tsx`) passando `setlistApi={fakeSetlistApi()}`.

**Interfaces:**
- Consumes: `SetlistApi`, `syncReducer` & cia, `applySetlistOp`.
- Produces:
  ```ts
  useSetlistsContext(): { status: 'loading' | 'ready' | 'error'; setlists: Setlist[] }
  interface ActiveSetlist {
    id: string;
    status: 'loading' | 'ready' | 'not-found' | 'error';
    shown: Setlist | null; latest: Setlist | null;
    hasChanges: boolean; removed: boolean;
    accept(): void;
    edit(op: SetlistOp): Promise<'ok' | 'noop' | 'full' | 'gone' | 'error'>;
  }
  useActiveSetlist(): ActiveSetlist | null   // null fora do provider ou sem repertório ativo
  ```
  `AppProps` ganha `setlistApi: SetlistApi`.

- [ ] **Step 1: testes que falham.** `SetlistsProvider`: assina uma vez, expõe `loading`→`ready`, `error` em falha. `ActiveSetlistProvider` (com `fakeSetlistApi`, dentro de `MemoryRouter`): o id ativo vem de `/repertorios/:id` **ou** de `?repertorio=`; sem nenhum, `useActiveSetlist()` é `null`; navegar de `/musicas/s1?repertorio=r1&item=a` para `/musicas/s2?repertorio=r1&item=b` **não reassina** e mantém o `shown` (assinatura chamada 1 vez); sair do repertório cancela a assinatura; mudar o id reinicia o estado; **(Review Focus 1)** primeiro snapshot com `fromCache: true` e conteúdo velho seguido de snapshot do servidor diferente → `hasChanges` `false`, `shown` com o conteúdo do servidor; `push` de outra pessoa depois de pronto → `hasChanges` `true` e `shown` intacto; `accept()` → `shown` igual ao novo e `hasChanges` `false`; `edit(op)` aplica a operação otimista em `shown` imediatamente, chama `api.applyOp`, e ao resolver faz `adopt` do resultado (que inclui mudanças alheias); falha de rede → `shown` volta ao valor anterior e devolve `'error'`; `changed: false` → `'noop'`; `SetlistFullError` → `'full'`; `SetlistGoneError` → `'gone'`.
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar.** `ActiveSetlistProvider` usa `useMatch('/repertorios/:id')` e `useSearchParams`, e renderiza um componente interno com `key={id}` que roda `useReducer(syncReducer)` + a assinatura. Em `App.tsx` o layout vira `SongsProvider > SetlistsProvider > ActiveSetlistProvider > AppShell`; `bootstrap.tsx` cria `createSetlistApi(services)` e o passa ao `App`.
- [ ] **Step 4:** `npm test -w @cifras/web`, typecheck, lint → verdes.
- [ ] **Step 5: commit** `feat(web): setlist providers with latest/shown sync state`.

### Task 6: Aba Repertórios, cartão "Próximo culto" e diálogo de criar/editar/duplicar (frontend-dev) — PR C

**Files:** `apps/web/src/setlists/NextCultoCard.tsx`, `SetlistsTab.tsx`, `SetlistFormDialog.tsx` (create) e testes; `apps/web/src/search/HomePage.tsx` (modify: `TABS` ganha `repertorios`, busca oculta nessa aba, cartão no topo, FAB); `apps/web/src/ui/styles.css`.

**Interfaces:**
- Consumes: `useSetlistsContext`, `groupSetlists`, `nextCultos`, `todayLocal`, `defaultCultoDate`, `defaultLabel`, `isTooOld`, `expiresAtFor`, `SetlistApi`, `Dialog`.
- Produces: `<SetlistFormDialog mode="create" | "edit" | "duplicate" initial?: { date; label } busy error onSave(v: { date: string; label: string }) onCancel />`.

- [ ] **Step 1: testes que falham.** `NextCultoCard`: sem repertório futuro não renderiza; com vários na mesma data lista todos ("Domingo · 22/11", "5 louvores"; 1 → "1 louvor"), cada um é um `Link` para `/repertorios/:id`. `SetlistsTab`: seções "Próximos" e "Recentes", vencidos escondidos, vazio → "Nenhum repertório ainda."; `HomePage`: aba `?aba=repertorios` esconde o campo de busca e as outras abas o mantêm; link da aba "Repertórios"; FAB `＋ Novo repertório` só para membro/admin e `＋ Nova cifra` nas outras abas; visitante não vê FAB. `SetlistFormDialog`: data padrão = `defaultCultoDate(hoje)` e rótulo padrão = `defaultLabel(data)` (muda junto enquanto o usuário não editou o rótulo); rótulo vazio ou > 60 desabilita salvar; data malformada ou `isTooOld` mostra "já expiraria" e desabilita; salvar chama `onSave`. Fluxo de criação na Home: salvar chama `createSetlist({date,label,items:[]})` e navega para `/repertorios/<id>`; erro mostra mensagem e mantém o diálogo.
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar** reutilizando `Dialog`, `.list-card`, `.tabs`, `.fab`. `HomePage` recebe a data "hoje" de `todayLocal(new Date())`.
- [ ] **Step 4:** testes → PASS; typecheck e lint.
- [ ] **Step 5: commit** `feat(web): setlists tab, next-service card and create dialog`.

### Task 7: Tela do repertório (frontend-dev) — PR C

**Files:** `apps/web/src/setlists/SetlistRoute.tsx` (default export, carregado com `lazy` em `App.tsx`; rota `/repertorios/:id` dentro do `AppShell`), `SetlistPage.tsx`, `SetlistItemRow.tsx`, `UpdateBanner.tsx`, `AddSongSheet.tsx`, `KeyPicker.tsx` (create) e testes; `App.tsx`, `styles.css` (modify).

**Interfaces:**
- Consumes: `useActiveSetlist`, `useSongsContext`, `filterSongs`, `defaultKeyFor`, `newItemId`, `copyItems`, `itemHref`, `canEdit`, `ConfirmDialog`, `SetlistFormDialog`.
- Produces: `<UpdateBanner message?: string onAccept />` (`role="status"`, texto `O repertório foi alterado.` + botão `Atualizar`; usado também no visualizador, Task 9).

- [ ] **Step 1: testes que falham.** Lista: itens na ordem, cada linha com número, título (link para `itemHref`), tom; item cuja música não existe → "Música removida" com `✕` e sem link; carregando → "Carregando…"; `not-found` → "Repertório não encontrado." com link para `/?aba=repertorios`; `removed` → aviso "Este repertório foi removido." mantendo a lista; banner aparece quando `hasChanges` e **só** "Atualizar" muda a lista (empurre uma mudança com o fake e confira que a ordem na tela não mudou antes do clique). Edição (membro): ▲ move uma posição (chama `edit({type:'move', itemId, afterItemId})` com o vizinho certo; o primeiro ▲ e o último ▼ ficam desabilitados), `✕` remove, tocar no tom abre `KeyPicker` com os tons salvos da música e chama `setKey`; `'noop'` mostra "Esse item já tinha sido alterado por outra pessoa."; `'full'` mostra "O repertório está cheio (40 louvores)."; `'gone'` mostra "Este repertório foi removido.". Visitante: sem `≡`, ▲ ▼, `✕`, `＋ Adicionar` nem menu, e o tom não é botão. `AddSongSheet`: busca com `filterSongs`; tocar numa música chama `edit({type:'add', item:{id,songId,key:defaultKeyFor(song)}})` e a folha **continua aberta**; música sem PDF (`defaultKeyFor` nulo) desabilitada; música já no repertório com selo `já está` (ainda adicionável); sem resultado → `Nada encontrado para “x”.`. Menu do repertório (membro): "Editar data e rótulo" (`updateSetlistMeta`; `isTooOld` barra), "Duplicar" (diálogo em modo `duplicate`, cria com `copyItems` e navega para o novo), "Apagar" (`ConfirmDialog`; `deleteSetlist` e volta para `/?aba=repertorios` com notice "Repertório apagado.").
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar** sem biblioteca de arrastar ainda (a alça `≡` entra na Task 8). Chunk lazy: nada daqui entra no bundle inicial.
- [ ] **Step 4:** testes → PASS; typecheck e lint.
- [ ] **Step 5: commit** `feat(web): setlist page with live-update banner and editing`.

### Task 8: Arrastar com `≡` (frontend-dev) — PR C

**Files:** `apps/web/package.json` (+ lockfile), `apps/web/src/setlists/SortableItems.tsx`, `dnd.ts` (create) e testes; `SetlistPage.tsx` (modify).

**Interfaces:**
- Produces (`dnd.ts`): `afterIdForDrop(items: SetlistItem[], activeId: string, overId: string): string | null | undefined` — `undefined` = nada a mover; `null` = para o início; senão o id do item que fica logo acima do movido depois do arrasto.

- [ ] **Step 1: testes que falham.** `afterIdForDrop` com `[a,b,c,d]`: `a` sobre `c` → `'c'`; `d` sobre `b` → `'a'`; `c` sobre `a` → `null`; `a` sobre `a` → `undefined`; id desconhecido → `undefined`. `SortableItems`: renderiza `≡` como botão com `aria-label="Arrastar <título>"` e `touch-action: none` só na alça; só para quem edita; os botões ▲ ▼ continuam funcionando (teste herdado da Task 7 segue verde); o arrasto concluído chama `edit({ type: 'move', itemId, afterItemId })` (jsdom não simula o gesto: teste o handler `onDragEnd` exportado).
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3:** instalar `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` com `npm install -E -w @cifras/web`; implementar `afterIdForDrop` (com `arrayMove`) e `SortableItems` com sensores de ponteiro/toque (alça própria) e teclado.
- [ ] **Step 4:** testes → PASS; `npm run build -w @cifras/web` e `grep -l "@dnd-kit" apps/web/dist/assets/*.js` **não** lista o chunk inicial (`index-*.js`); registrar no PR o tamanho gzip do chunk da rota.
- [ ] **Step 5: commit** `feat(web): drag-to-reorder setlist items`.

### Task 9: Visualizador em contexto de repertório (frontend-dev) — PR D

**Files:** `apps/web/src/setlists/SetlistBar.tsx` (create) e teste; `apps/web/src/viewer/ViewerPage.tsx`, `ViewerRoute.tsx`, `apps/web/src/search/KeyChips.tsx`, `styles.css` (modify) e testes (`ViewerPage.setlist.test.tsx` novo; `KeyChips` coberto nele).

**Interfaces:**
- Consumes: `useActiveSetlist`, `navigateItems`, `itemHref`, `UpdateBanner`, `keySlug`.
- Produces: `ViewerPageProps` ganha `setlistId?: string | null` e `itemId?: string | null` (do `ViewerRoute`, lidos de `?repertorio=` e `?item=`); `KeyChips` ganha `extraQuery?: string` (ex.: `repertorio=r1&item=i1`) anexado ao `?tom=`; `<SetlistBar nav onGo />` (`‹ Anterior · 2 de 5 · Próxima ›`).

- [ ] **Step 1: testes que falham** (`ViewerPage` com `ActiveSetlistProvider` e `fakeSetlistApi`): sem `setlistId` nada muda (os testes existentes seguem verdes); com contexto, a barra mostra `2 de 5`, Anterior/Próxima navegam com `replace` para `itemHref`, ficam desabilitados nos extremos e pulam item de música removida; o "‹" do cabeçalho aponta para `/repertorios/<id>`; **troca de tom pela cifra** (atalhos do `KeyChips` e "Mudar tom") **mantém** `repertorio`/`item` na URL e mostra `Tom do repertório: G` com link `Voltar ao G` (que volta o `?tom=` ao do item); apagar o tom aberto (`leave()`) também preserva os parâmetros; **(Review Focus 4)** tom do item inexistente nos arrangements → aviso `O tom X deste louvor não existe mais; abrimos o Y.`; banner de `hasChanges` aparece na cifra sem trocar o PDF; **tom do item mudou por outra pessoa**: ao tocar em `Atualizar` a cifra navega (`replace`) para o novo tom e o banner antes do clique diz `O tom deste louvor mudou para A`; se o músico tinha desviado o tom e o item **não** mudou de tom, `Atualizar` não navega; **(Review Focus 3)** item removido por outra pessoa + `Atualizar` → a cifra continua aberta e a barra mostra `Fora do repertório` com link `Voltar ao repertório`; visitante vê a barra normalmente.
- [ ] **Step 2:** testes → FAIL.
- [ ] **Step 3: implementar.** Mudanças cirúrgicas no `ViewerPage`: `open()`, `leave()` e o "‹" usam um helper que acrescenta `&repertorio=…&item=…` quando há contexto; o `?tom=` segue como fonte de verdade; o pré-carregamento do PDF do próximo item usa `api.getPdfBytes` + `docCache` **só depois** de a cifra atual estar pronta (não pode atrasar a abertura da atual; medir no E2E, Task 10).
- [ ] **Step 4:** `npm test -w @cifras/web`, typecheck e lint → verdes (inclusive os testes antigos do visualizador).
- [ ] **Step 5: commit** `feat(web): viewer setlist bar, tom follow and fallback notices`.

### Task 10: E2E, polimento e documentação (qa; designer revisa) — PR E

**Files:** `e2e/fixtures/emulator.ts` (+ `seedSetlist(date, label, items)` via REST com `Bearer owner`, incluindo `expiresAt` como `timestampValue`), `e2e/setlists.spec.ts` (create), `AGENTS.md` e `README.md` (só se o comando de TTL ou o fluxo mudar).

- [ ] **Step 1: testes (Playwright, projetos `mobile` e `desktop`)**, dados por `seedSong`/`seedSetlist`, PDFs sintéticos, login com `signInAs`, esperas por estado da UI (sem `sleep`): (a) **montar**: admin cria "Domingo" pela aba, acrescenta 3 músicas, reordena com ▲ ▼, troca um tom, e a ordem sobrevive a recarregar a página; (b) **navegar**: abre a 1ª cifra, `Próxima` e `Anterior` mostram os PDFs renderizados (`expectPdfRendered`) nos tons do repertório; (c) **ao vivo** com **dois contextos** de navegador (ambos admin): o contexto B abre o repertório, o A reordena, B vê `O repertório foi alterado.` com a lista **inalterada**, toca em `Atualizar` e a ordem muda; (d) mesmo em B **dentro da cifra**: banner sem trocar o PDF e, depois de `Atualizar`, a barra reflete a nova ordem; (e) visitante vê repertório e barra, sem controles de edição; (f) repertório de data antiga (`expiresAt` no passado) semeado **não** aparece. Screenshots em `e2e/artifacts/`.
- [ ] **Step 2:** `npm run test:e2e` → verde 3 vezes seguidas; registrar no PR a medição de abrir cifra pelo repertório vs. pela busca (meta do spec: não mais lenta).
- [ ] **Step 3:** `designer` compara os screenshots da lista, do banner e da barra do visualizador com os tokens/estados existentes e registra ajustes no PR; aplicar só ajustes de CSS.
- [ ] **Step 4:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:rules`, `npm run test:harness` → verdes.
- [ ] **Step 5: commit** `test(e2e): setlists flows and live update across two sessions`.

---

## Self-review (cobertura do spec)

- §6.1 modelo → Tasks 1, 2, 4. §6.2 TTL → 1 (policy, índice), 2 (`expiresAtFor`), 6 (data barrada), 4/2 (vencidos escondidos). §6.3 rules → 1. §6.4 concorrência → 3, 4 (transação), 5 (otimista/adopt). §6.5 tempo real/banner/cache → 3, 5, 7. §6.6 telas → 6, 7, 8. §6.7 visualizador (barra, `replace`, tom do item, desvio do músico, fora do repertório, pontos do `ViewerPage`, "‹") → 9. §6.8 performance (chunk lazy, dnd fora do bundle inicial, pré-carga da próxima) → 7, 8, 9. §6.9 testes → todas as Tasks + 10. §8 divisão em PRs → Global Constraints.
- Anti-objetivos: lista mudando sozinha (Tasks 3, 5, 7), acréscimo perdido (4), tom em silêncio (9), lentidão (9, 10), sumir antes do fim do dia (2).
- Fora do plano por decisão: validação do cálculo de `expiresAt` nas rules (risco aceito, Global Constraints).
