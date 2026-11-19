# Estatísticas para admins — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela "Estatísticas" (só admin, dentro de "Mais") com quantidade de PDFs, armazenamento em PDFs e as cifras mais usadas nos repertórios.

**Architecture:** Uma função agendada diária (e o próprio `getStats`) grava um documento permanente `setlistUsage/{setlistId}` para cada repertório que já "fechou" (data + 2 dias). `getStats` (`onCall`, só admin) conta tons, soma o Storage e agrega `setlistUsage` em dois rankings. O app lê com um `statsApi` no molde do `peopleApi` e mostra em `StatsPage`.

**Tech Stack:** Firebase Functions v2 (`onCall`, `onSchedule`), firebase-admin (Firestore + Storage), vitest; web: React 19 + react-router, vitest + Testing Library; regras testadas com `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-11-19-estatisticas-admin-design.md`. Referência visual: arquivo Paper "Church - Cifras" (id `01M7BN04NKJ00S1T4XVC8HRGRS`), artboards "27 · Estatísticas (admin)" e "05 · Mais (admin)" (use `get_jsx` com `includeNodeIds: false` para os valores exatos).

## Global Constraints

- Funções em `southamerica-east1`; papel conferido por `requireRole(deps, uid, ['admin'])` (`apps/functions/src/auth/requireRole.ts`).
- Lógica pura com dependências injetadas, adaptadores do Firebase fora da lógica (padrão de `songs/adminSongs.ts`).
- Um repertório de data `D` só conta quando `hoje (America/Sao_Paulo) >= D + 2 dias`, ou seja, `date <= hoje − 2 dias`.
- Cada repertório conta **uma vez por música** (sem repetir por tom); dois repertórios no mesmo dia contam duas vezes.
- Uso contado fica **congelado**: `setlistUsage/{id}` é criado uma vez e nunca atualizado. **Não** ligar TTL nessa coleção.
- Rankings: top **10**, "todo o período" e "últimos 30 dias" (`date >= hoje − 29 dias`). Empate: mais usos primeiro, depois título em ordem alfabética (`localeCompare('pt-BR')`).
- Armazenamento = soma de `metadata.size` dos arquivos `.pdf` em `songs/` (não inclui `pads/`).
- Firestore nega tudo por padrão: `setlistUsage` só é lido/escrito pelo Admin SDK; nenhuma regra nova de acesso.
- Texto de UI em pt-BR; identificadores em inglês. Commits em português no estilo do repositório, terminando com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Branch `feat/admin-stats` (worktree `workspaces/church-cifras/estatisticas`); PR para `develop`.

## Review Focus

Cada linha tem o teste que a fixa na tarefa indicada.

1. Fronteira de `D + 2`: repertório do dia 20 **não** conta no dia 21 e **conta** no dia 22 (Tarefa 1).
2. Mesma música duas vezes no mesmo repertório (tons diferentes) conta **uma** vez; repertório sem músicas é marcado como contado com `songIds: []` (Tarefa 1).
3. Segunda execução (ou execuções simultâneas) não duplica: `recordUsage` devolvendo `'exists'` não é erro (Tarefa 1).
4. Fuso: às 23:30 em Brasília já é o dia seguinte em UTC; "hoje" tem de ser o de Brasília (Tarefa 1).
5. Música apagada depois de contada some do ranking e o 11º colocado ocupa a vaga (Tarefa 2).
6. Falha na contagem dentro do `getStats` não derruba a tela (Tarefa 2); não-admin e não-logado são recusados (Tarefa 2).
7. Nenhum papel (nem admin) lê ou escreve `setlistUsage` pelo cliente (Tarefa 3).
8. Sem nenhum repertório fechado: tela mostra estado vazio, não lista quebrada; erro de rede mostra mensagem (Tarefa 5).
9. `formatBytes` nos limites 0, 1023, 1024 e GB, com vírgula decimal (Tarefa 4).

---

### Task 1: Datas e contagem de repertórios fechados

**Files:**
- Create: `apps/functions/src/stats/dates.ts`, `apps/functions/src/stats/dates.test.ts`
- Create: `apps/functions/src/stats/countUsage.ts`, `apps/functions/src/stats/countUsage.test.ts`

**Interfaces:**
- Produces (`dates.ts`):
  - `todayInSaoPaulo(now: Date): string` — `YYYY-MM-DD` em `America/Sao_Paulo`.
  - `addDays(date: string, days: number): string` — soma dias (pode ser negativo) a uma data `YYYY-MM-DD`.
- Produces (`countUsage.ts`):
  - `type SettledSetlist = { id: string; date: string; songIds: string[] }`
  - `type UsageDeps = { listSettledSetlists(cutoff: string): Promise<SettledSetlist[]>; recordUsage(usage: { setlistId: string; date: string; songIds: string[] }): Promise<'created' | 'exists'>; now(): Date }`
  - `countSettledSetlists(deps: UsageDeps): Promise<{ created: number; alreadyCounted: number }>`

- [ ] **Step 1: Write the failing tests**

`dates.test.ts`:
  - `todayInSaoPaulo(new Date('2026-11-20T02:30:00Z'))` → `'2026-11-19'`; `new Date('2026-11-20T03:00:00Z')` → `'2026-11-20'`.
  - `addDays('2026-12-31', 1)` → `'2027-01-01'`; `addDays('2026-03-01', -1)` → `'2026-02-28'`; `addDays('2026-11-22', -2)` → `'2026-11-20'`.

`countUsage.test.ts` (deps falsos registram chamadas; `listSettledSetlists` devolve os repertórios cuja `date <= cutoff` de uma lista fixa):
  - agora = `2026-11-22T15:00:00Z`, repertórios em `2026-11-20` e `2026-11-21`: só o de 20 é gravado (cutoff `'2026-11-20'`).
  - agora = `2026-11-21T15:00:00Z`: o de 20 **não** é gravado (cutoff `'2026-11-19'`).
  - agora = `2026-11-22T02:30:00Z` (ainda 21 em Brasília): cutoff `'2026-11-19'`.
  - `songIds: ['a', 'b', 'a']` é gravado como `['a', 'b']`.
  - `songIds: []` é gravado com `[]`.
  - `recordUsage` devolvendo `'exists'` conta em `alreadyCounted`, não lança; o resultado soma `created` e `alreadyCounted` corretamente.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @cifras/functions -- src/stats`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implement `dates.ts` and `countUsage.ts` per the Interfaces**

`todayInSaoPaulo`: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`. `addDays`: aritmética em UTC sobre a data. `countSettledSetlists`: `cutoff = addDays(todayInSaoPaulo(deps.now()), -2)`; deduplica `songIds` mantendo a ordem; chama `recordUsage` por repertório e totaliza.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test -w @cifras/functions -- src/stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/stats
git commit -m "feat(functions): contar repertórios fechados em setlistUsage"
```

---

### Task 2: `getStats` (agregação e papel de admin)

**Files:**
- Create: `apps/functions/src/stats/getStats.ts`, `apps/functions/src/stats/getStats.test.ts`

**Interfaces:**
- Consumes: `UsageDeps`, `countSettledSetlists` (Tarefa 1); `addDays`, `todayInSaoPaulo` (Tarefa 1); `requireRole`, `RoleDeps` de `../auth/requireRole`.
- Produces:
  - `type TopSong = { songId: string; title: string; artistName: string; uses: number }`
  - `type StatsResult = { songCount: number; pdfCount: number; handmadeCount: number; generatedCount: number; storageBytes: number; topAllTime: TopSong[]; topLast30Days: TopSong[] }`
  - `type StatsDeps = UsageDeps & { countSongs(): Promise<number>; listArrangementSources(): Promise<string[]>; listPdfSizes(): Promise<number[]>; listUsage(): Promise<Array<{ date: string; songIds: string[] }>>; getSongs(ids: string[]): Promise<Map<string, { title: string; artistName: string }>> }`
  - `getStats(deps: StatsDeps): Promise<StatsResult>`
  - `getStatsForAdmin(deps: StatsDeps & RoleDeps, uid: string | undefined): Promise<StatsResult>` — `requireRole(['admin'])` e depois `getStats`.

- [ ] **Step 1: Write the failing tests** (deps falsos; `now` = `2026-11-22T15:00:00Z`)

  - contagens: `listArrangementSources` = `['handmade','handmade','generated']` → `pdfCount 3`, `handmadeCount 2`, `generatedCount 1`; `countSongs` → `songCount`.
  - `listPdfSizes` = `[1000, 2000]` → `storageBytes 3000`; lista vazia → `0`.
  - ranking: usos `s1`:3, `s2`:2, `s3`:2 → ordem `s1`, depois `s2`/`s3` por título (`localeCompare('pt-BR')`); cada item traz `title`, `artistName` e `uses`.
  - janela de 30 dias: uso com `date: '2026-10-24'` (hoje−29) entra em `topLast30Days`; `date: '2026-10-23'` não entra, mas ambos entram em `topAllTime`.
  - top 10: com 12 músicas, ambos os rankings têm 10 itens.
  - música apagada (ausente em `getSongs`) é ignorada e a 11ª ocupa a vaga (12 músicas, a mais usada apagada → `topAllTime` ainda tem 10 itens e não contém a apagada).
  - sem nenhum uso: `topAllTime` e `topLast30Days` são `[]`.
  - a contagem (`countSettledSetlists`) roda antes de ler `listUsage` (registrar a ordem das chamadas); se `listSettledSetlists` lançar, `getStats` ainda devolve o resultado e registra o erro (`console.error` espionado).
  - `getStatsForAdmin`: papel `admin` retorna dados; `member`, `viewer` e papel inexistente lançam `permission-denied`; `uid` indefinido lança `unauthenticated`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @cifras/functions -- src/stats/getStats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `getStats` and `getStatsForAdmin` per the Interfaces**

`getStats`: chama `countSettledSetlists` dentro de try/catch (erro vira `console.error`); soma usos por `songId` (todo o período e `date >= addDays(todayInSaoPaulo(now), -29)`); busca os dados das músicas com **uma** chamada a `getSongs` com os ids que aparecem em qualquer contagem; descarta as ausentes **antes** de ordenar e cortar em 10.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test -w @cifras/functions -- src/stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/functions/src/stats
git commit -m "feat(functions): getStats agrega PDFs, armazenamento e cifras mais usadas"
```

---

### Task 3: Adaptadores, funções publicadas, regras e deploy

**Files:**
- Create: `apps/functions/src/stats/statsDeps.ts`
- Modify: `apps/functions/src/index.ts` (exportar `getStats` e `countSetlistUsage`)
- Create: `tests/rules/setlistUsage.rules.test.ts`
- Modify: `firestore.rules` (só um comentário), `docs/deploy.md` (nova seção 11)

**Interfaces:**
- Consumes: `StatsDeps`, `getStatsForAdmin` (Tarefa 2); `UsageDeps`, `countSettledSetlists` (Tarefa 1); `deps` (`RoleDeps`) já definido em `index.ts`.
- Produces:
  - `createStatsDeps(): StatsDeps` em `statsDeps.ts`: `listSettledSetlists(cutoff)` lê `setlists` com `where('date', '<=', cutoff)` e mapeia `items[].songId` (só strings); `recordUsage` faz `create()` em `setlistUsage/{id}` com `{ date, songIds, countedAt: FieldValue.serverTimestamp() }` e devolve `'exists'` no erro `ALREADY_EXISTS` (código gRPC 6); `countSongs` usa `collection('songs').count()`; `listArrangementSources` usa `collectionGroup('arrangements').select('source')` (sem filtro, não exige índice); `listPdfSizes` lista `songs/` no bucket, só `.pdf`, `Number(metadata.size) || 0`; `listUsage` lê `setlistUsage` (`date`, `songIds`); `getSongs` usa `getAll` em blocos de 300 ids; `now: () => new Date()`.
  - Exports de `index.ts`: `getStats` (`onCall`, região `REGION`, chama `getStatsForAdmin({ ...statsDeps, ...deps }, request.auth?.uid)`) e `countSetlistUsage` (`onSchedule` de `firebase-functions/v2/scheduler`, `{ region: REGION, schedule: 'every day 04:00', timeZone: 'America/Sao_Paulo' }`, chama `countSettledSetlists(statsDeps)`).

- [ ] **Step 1: Write the failing rules test** em `tests/rules/setlistUsage.rules.test.ts`, no molde de `setlists.rules.test.ts` (semeia `setlistUsage/existing` com `withSecurityRulesDisabled`). Para cada contexto — `admin`, `member`, `viewer` (autenticados com `{ role }`) e não autenticado — `assertFails(getDoc(...))`, `assertFails(setDoc(...))` e `assertFails(deleteDoc(...))` sobre `setlistUsage/existing`.

- [ ] **Step 2: Run to verify** (as regras atuais já negam; o teste deve passar de imediato e protege contra regressão)

Run: `npm run test:rules`
Expected: PASS (requer o emulador do Firestore; veja `package.json`). Se o emulador não estiver disponível no ambiente, registre isso e siga.

- [ ] **Step 3: Implement `statsDeps.ts` and the two exports in `index.ts`** conforme as Interfaces. Acrescente em `firestore.rules` um comentário junto ao `match /{document=**}`: `setlistUsage` é acessado só pelo Admin SDK (negado por padrão).

- [ ] **Step 4: Document the deploy** em `docs/deploy.md`, nova seção "11. Estatísticas: Cloud Scheduler e setlistUsage": ativar a API do Cloud Scheduler no projeto antes do primeiro deploy; depois do deploy, conferir que o job de `countSetlistUsage` existe e roda às 04:00 (Brasília); `setlistUsage` **não** deve ter política de TTL; a primeira visita de um admin a Estatísticas já conta os repertórios fechados que ainda existem.

- [ ] **Step 5: Run build, typecheck and tests**

Run: `npm run typecheck -w @cifras/functions && npm run build -w @cifras/functions && npm run test -w @cifras/functions`
Expected: tudo passa.

- [ ] **Step 6: Commit**

```bash
git add apps/functions tests/rules/setlistUsage.rules.test.ts firestore.rules docs/deploy.md
git commit -m "feat(functions): publicar getStats e a contagem diária de usos"
```

---

### Task 4: API do cliente e formatador de bytes

**Files:**
- Create: `apps/web/src/stats/statsApi.ts`, `apps/web/src/stats/statsApi.test.ts`
- Create: `apps/web/src/test/fakeStatsApi.ts`

**Interfaces:**
- Produces:
  - `interface TopSong { songId: string; title: string; artistName: string; uses: number }`
  - `interface Stats { songCount: number; pdfCount: number; handmadeCount: number; generatedCount: number; storageBytes: number; topAllTime: TopSong[]; topLast30Days: TopSong[] }`
  - `interface StatsApi { getStats(): Promise<Stats> }`
  - `createStatsApi(services: FirebaseServices): StatsApi` — import dinâmico de `firebase/functions`, `httpsCallable<unknown, Stats>(functions, 'getStats')()` e devolve `data` (mesmo padrão de `createPeopleApi.setRole`).
  - `formatBytes(bytes: number): string` — base 1024, vírgula decimal pt-BR, no máximo 1 casa em MB/GB, inteiro em B/KB, sem separador de milhar.
  - `fakeStatsApi(overrides?: Partial<Stats>): StatsApi` em `test/fakeStatsApi.ts`, com dados de exemplo (uma lista curta em cada ranking).

- [ ] **Step 1: Write the failing test** `statsApi.test.ts`: `formatBytes(0)` → `'0 B'`; `(1023)` → `'1023 B'`; `(1024)` → `'1 KB'`; `(264192)` → `'258 KB'`; `(65430938)` → `'62,4 MB'`; `(1395864371)` → `'1,3 GB'`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -w @cifras/web -- src/stats/statsApi.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `statsApi.ts` and `fakeStatsApi.ts`** conforme as Interfaces.

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -w @cifras/web -- src/stats/statsApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stats apps/web/src/test/fakeStatsApi.ts
git commit -m "feat(web): statsApi e formatBytes"
```

---

### Task 5: Tela `StatsPage`

**Files:**
- Create: `apps/web/src/stats/StatsPage.tsx`, `apps/web/src/stats/StatsPage.test.tsx`
- Create: `apps/web/src/ui/redesign-stats.css`
- Modify: `apps/web/src/main.tsx` (importar `./ui/redesign-stats.css` junto dos demais `redesign-*.css`), `apps/web/src/ui/themeTokens.test.ts` (incluir o novo CSS na concatenação que ele já faz, para o teste de tokens de tema cobri-lo; só cores via tokens `var(--…)`, nenhuma cor literal nova)

**Interfaces:**
- Consumes: `StatsApi`, `Stats`, `formatBytes`, `fakeStatsApi` (Tarefa 4).
- Produces: `StatsPage({ api }: { api: StatsApi }): JSX.Element` — mesmo molde de `PeoplePage` (efeito que carrega, `active` para evitar `setState` após desmontar).

- [ ] **Step 1: Write the failing tests** `StatsPage.test.tsx` (envolver em `MemoryRouter`; `fakeStatsApi`):
  - mostra "Carregando…" (`role="status"`) até resolver; depois o título "Estatísticas" (nível 1), o link "‹ Voltar" (classe `back`, como em `PeoplePage`) para `/mais`, `248` com "176 à mão · 72 gerados" quando os dados são esses, o total de músicas e o armazenamento formatado (ex.: `storageBytes: 65430938` → `62,4 MB`).
  - ranking "Todo o período" é o padrão: lista ordenada (`<ol>`) com título, cantor e "38 usos"; `1` uso aparece como "1 uso" (singular).
  - clicar em "Últimos 30 dias" troca para `topLast30Days`; o botão ativo tem `aria-pressed="true"`.
  - cada item é um link para `/musicas/{songId}`.
  - ranking vazio mostra "Ainda não há repertórios fechados." e a nota explicando a regra de contagem continua visível.
  - `getStats` rejeitando mostra `role="alert"` "Não foi possível carregar as estatísticas."

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @cifras/web -- src/stats/StatsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `StatsPage.tsx` and `redesign-stats.css`** seguindo o artboard 27 do Paper (cartões de PDFs e Músicas lado a lado, cartão de Armazenamento, alternância em forma de pílula com o segmento ativo claro, linhas do ranking com número em fonte mono — 1 a 3 em âmbar — título/cantor e contagem à direita, nota de rodapé). Reaproveite os tokens e classes existentes (`.menu-card`, `.status`, `.error` etc.). Texto da nota: "Uma música conta quando entra em um repertório que já fechou, isto é, depois do dia seguinte ao culto. Contada uma vez por repertório."

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test -w @cifras/web -- src/stats`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stats/StatsPage.tsx apps/web/src/stats/StatsPage.test.tsx apps/web/src/ui
git commit -m "feat(web): tela de Estatísticas"
```

---

### Task 6: Rota, item em "Mais" e verificação final

**Files:**
- Modify: `apps/web/src/App.tsx` (nova prop `statsApi: StatsApi`, rota `/estatisticas` dentro do grupo `RequireRole roles={['admin']}`), `apps/web/src/bootstrap.tsx` (`createStatsApi(services)`)
- Modify: `apps/web/src/more/MaisPage.tsx`, `apps/web/src/more/MaisPage.test.tsx`
- Modify: `apps/web/src/routes/routes.test.tsx` e os testes que montam `App` com `peopleApi` (`App.test.tsx`, `App.import.test.tsx`, `App.upload.test.tsx`, `App.uploadError.test.tsx`): passar `statsApi={fakeStatsApi()}`.

**Interfaces:**
- Consumes: `StatsPage`, `StatsApi`, `createStatsApi`, `fakeStatsApi` (Tarefas 4 e 5).

- [ ] **Step 1: Write the failing tests**
  - `MaisPage.test.tsx`: admin vê o link "Estatísticas" para `/estatisticas` com o texto "PDFs, espaço e cifras mais usadas"; `member` e `viewer` não veem "Estatísticas".
  - `routes.test.tsx`: admin em `/estatisticas` vê o título "Estatísticas"; `member` em `/estatisticas` é redirecionado para `/`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test -w @cifras/web -- src/more src/routes`
Expected: FAIL.

- [ ] **Step 3: Implement the wiring** — item em `MaisPage` logo depois de "Importar" (mesmo `Link` + `Icon` + chevron; ícone de barras `M5 20v-9M12 20V4M19 20v-6`), prop e rota em `App.tsx`, criação em `bootstrap.tsx`, e `statsApi={fakeStatsApi()}` nos testes que montam `App`.

- [ ] **Step 4: Run the whole verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm run test`
Expected: tudo passa. Se `format:check` reclamar, rode `npx prettier --write` nos arquivos alterados e repita.

- [ ] **Step 5: Verificar na tela (se o ambiente permitir)** — subir o app com os emuladores (`docker-compose`/`firebase emulators`, veja `README.md`), entrar como admin, abrir Mais → Estatísticas e conferir os três blocos contra o Paper. Se não der para subir, diga isso no relatório; não declare a tela verificada.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): rota e item Estatísticas em Mais (admin)"
```
