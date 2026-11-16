# Fase 6 — Administração e importação em lote: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins corrigem nome/cantor de uma música, apagam um tom ou a música inteira, e importam o acervo existente em lote (vários PDFs ou uma pasta) com uma tabela de conferência editável, fila com progresso e relatório CSV do que não entrou.

**Architecture:** Três callables de admin (`updateSongMeta`, `deleteArrangement`, `deleteSong`) com lógica pura + deps injetadas (padrão das fases anteriores), checando papel via `requireRole` (doc `users/{uid}`). O site ganha um menu "Gerenciar" no visualizador (só admin) e a página `/importar` (lazy, só admin, pensada para computador) que reutiliza `readPdfSuggestion` e `saveUpload` da Fase 4. A lógica do lote (classificação, duplicatas, ordenação por música, fila) é pura e testada separada da UI.

**Tech Stack:** firebase-functions 7.4.0, firebase-admin, React 19, `@cifras/chords`, `@cifras/pdf`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§6.7 callables, §6.9 Administração e Importação em lote, §6.10 telas 4a)

## Global Constraints

- Somente **admin** chama `updateSongMeta`, `deleteArrangement`, `deleteSong` (via `requireRole(['admin'])`), região `southamerica-east1`.
- `deleteArrangement({ songId, key })`: recusa (`failed-precondition`, `Não é possível apagar o último PDF feito à mão enquanto houver tons gerados.`) apagar o último `handmade` se existir algum `generated`; apaga o doc e depois o arquivo (falha ao apagar o arquivo é logada, não falha); o gatilho existente recalcula `keys`/`handmadeKeys`.
- `deleteSong({ songId })`: apaga todos os arrangements (docs + arquivos) e o doc da música; idempotente (música inexistente → ok).
- `updateSongMeta({ songId, title, artistName })`: valida (1–120, `normalizeText` não vazio), recalcula `titleNormalized`/`artistId` (`artistIdFromName`), `updatedAt`; recusa (`already-exists`, `Já existe uma música com esse nome e cantor.`) se outra música tiver a mesma identidade; **não altera PDFs**.
- Importação: arquivos `.pdf` (inclusive de pasta via `webkitdirectory`), cada um lido no navegador com `readPdfSuggestion` (Fase 4), `knownArtists` = cantores atuais + os já confirmados no lote.
- **Status de cada linha** (ordem de prioridade): `fora do padrão` (0 acordes) → `grande demais` (> 10 MB) → `falta a música` / `falta o cantor` / `falta o tom` → `duplicado no lote` (mesma música+cantor+tom de uma linha anterior) → `conflito: tom feito à mão já existe` → `substitui gerado` → `já existe — novo tom` → `pronto`. Aviso adicional (não bloqueia): `revisar: <tokens>` para acordes suspeitos e `linhas de acorde ignoradas: <n>`.
- "Importar prontos" importa linhas `pronto`, `já existe — novo tom` e `substitui gerado`; linhas da **mesma música** são processadas em sequência (a primeira cria a música, as demais acrescentam tons); músicas diferentes com concorrência 2; progresso `Importando <i> de <n>…`; resultado por linha (`importado`, `já existia`, `erro: <mensagem>`).
- Relatório CSV (UTF-8 com BOM, separador `;`): colunas `arquivo;música;cantor;tom;status;detalhe` com as linhas não importadas.
- UI pt-BR; identificadores em inglês; versões exatas; TS strict; Conventional Commits + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add`/`git commit` separados.

## Review Focus

1. **Admin apaga o tom feito à mão usado como origem de tons gerados** (sobrando outro feito à mão) → permitido; a troca de tom passa a usar o outro (`pickTransposeSource`) — teste da função e smoke.
2. **Lote com o mesmo PDF duas vezes** ou duas músicas iguais com tons diferentes → duplicado marcado / música criada uma vez só — testes da lógica do lote.
3. **Editar nome para um que já existe** → `already-exists` com mensagem clara — teste.
4. **Fechar a aba no meio da importação** → o que já entrou fica; o resto aparece no relatório na próxima vez como `já existe — novo tom`/`conflito` (idempotência pela detecção de existente) — teste da classificação com catálogo atualizado.
5. **Arquivo não-PDF ou PDF escaneado numa pasta** → ignorado (não-PDF) / `fora do padrão` — testes.

---

### Task 1: Callables de administração (backend-dev)

**Files:** Create `apps/functions/src/songs/{adminSongs.ts,adminSongs.test.ts}`; Modify `apps/functions/src/index.ts`

**Interfaces:**
- Produces: `AdminDeps = { getSong(id); listArrangements(songId): Promise<Array<{ slug: string; key: string; source: string; storagePath: string }>>; deleteArrangementDoc(songId, slug); deleteSongDoc(songId); deleteFile(path); findSongByIdentity(titleNormalized, artistId): Promise<string | null>; updateSong(songId, data); now() }`; `updateSongMeta(deps, input)`, `deleteArrangement(deps, input)`, `deleteSong(deps, input)` (regras das Global Constraints); callables homônimas no índice.
- [ ] **Step 1:** Testes que falham: `updates title and artist with normalized fields`; `rejects empty normalized names`; `rejects identity of another song`; `allows keeping the same identity` (só caixa diferente); `deletes a generated key and its file`; `deletes a handmade key when another handmade remains`; `refuses deleting the last handmade while generated exist`; `deletes the last handmade when no generated exist`; `keeps going when file delete fails`; `deletes song with all arrangements and files`; `deleting a missing song is ok`; `non-admin is rejected` (via requireRole no índice — teste com deps falsas do requireRole).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test`, lint, typecheck, build → verde.
- [ ] **Step 5: Commit** — `feat(functions): admin callables to edit songs and delete keys or songs`.

### Task 2: Gerenciar no visualizador (frontend-dev)

**Files:** Create `apps/web/src/viewer/{ManageMenu.tsx,EditSongDialog.tsx,ConfirmDialog.tsx}` (+ testes); Modify `catalogApi.ts` (`updateSongMeta`, `deleteArrangement`, `deleteSong` via callables), `ViewerPage.tsx`, `styles.css`

**Interfaces:** botão `Gerenciar` (só admin) no cabeçalho do visualizador → menu: `Editar nome e cantor`, `Apagar tom <K>`, `Apagar música`. Editar: diálogo com Música/Cantor (validação igual ao upload), `Salvar` → mensagem `Dados atualizados.`; `already-exists` → `Já existe uma música com esse nome e cantor.`. Apagar tom: confirmação `Apagar o tom <K> de “<título>”? O PDF será removido.` → depois navega para o primeiro tom restante; `failed-precondition` → a mensagem da função. Apagar música: confirmação exigindo digitar o título (botão habilitado só quando bate, ignorando caixa/acentos) → navega para `/` com `Música apagada.`.
- [ ] **Step 1:** Testes que falham: `manage menu only for admins`; `edits song metadata`; `shows already exists error`; `deletes a key and navigates to the remaining key`; `shows last handmade error`; `delete song requires typing the title`; `deletes song and returns home`.
- [ ] **Step 2–4:** FAIL → implementar → verde (lint, typecheck, build, format).
- [ ] **Step 5: Commit** — `feat(web): manage songs from the viewer for admins`.

### Task 3: Contagem de linhas de acorde ignoradas (backend-dev)

**Files:** Modify `packages/chords/src/{plan.ts,lines.ts}` (+ testes)

**Interfaces:** `TransposePlan.ignoredChordLines: number` — segmentos em negrito com ≥ 1 token de acorde que foram classificados como não-acorde e **não** entraram em `suspectSegments` (ex.: `(repete` ao lado de acordes). `readPdfSuggestion` (web) passa a expor `ignoredChordLines`.
- [ ] **Step 1:** Testes que falham: `counts chord lines skipped because of non chord-like words`; `does not count titles without chords`; fixtures reais continuam com 0 suspeitos (e registrar os valores de `ignoredChordLines` no relatório).
- [ ] **Step 2–4:** FAIL → implementar → verde.
- [ ] **Step 5: Commit** — `feat(chords): report chord lines ignored by classification`.

### Task 4: Lógica da importação em lote (frontend-dev)

**Files:** Create `apps/web/src/import/{batch.ts,batch.test.ts,csv.ts,csv.test.ts,queue.ts,queue.test.ts}`

**Interfaces:**
- `BatchRow = { id: string; fileName: string; file: File; title: string; artist: string; key: KeyName | null; chordCount: number; suspects: string[]; ignoredChordLines: number; sizeOk: boolean }`.
- `classifyRows(rows: BatchRow[], catalog: { findSong(titleNormalized, artistId): SongSummary | null; arrangementSource(songId, key): 'handmade' | 'generated' | null }): Array<BatchRow & { status: BatchStatus; detail: string }>` — `BatchStatus` com os valores das Global Constraints (prioridade). O catálogo é síncrono (a página monta um índice a partir de `useSongsContext` + arrangements buscados sob demanda antes de classificar).
- `planImport(classified): Array<{ identity: string; rows: ClassifiedRow[] }>` — agrupa linhas importáveis por música (ordem estável).
- `runImport(groups, worker: (row) => Promise<'imported' | 'existing'>, opts: { concurrency: 2; onProgress(done, total); signal?: AbortSignal }): Promise<Map<string, RowResult>>` — sequencial dentro do grupo, até 2 grupos em paralelo; erro numa linha não para as outras.
- `toCsv(rows): string` — BOM, `;`, aspas escapadas, só não importadas.
- [ ] **Step 1:** Testes que falham: classificação de cada status e da prioridade; `marks second identical row as duplicado no lote`; `groups rows of the same song in order`; `runs groups with concurrency 2 and rows sequentially`; `continues after a row error`; `stops when aborted`; CSV com acentos, `;` e aspas no conteúdo.
- [ ] **Step 2–4:** FAIL → implementar → verde.
- [ ] **Step 5: Commit** — `feat(web): batch import classification, queue and csv report`.

### Task 5: Página Importar em lote (frontend-dev)

**Files:** Create `apps/web/src/import/{ImportPage.tsx,ImportRoute.tsx}` (+ testes); Modify `App.tsx` (rota `/importar` lazy, `RequireRole roles={['admin']}`, ErrorBoundary), `AppShell.tsx` (link `Importar` para admin), `styles.css`

**Interfaces (mockup 4a):** título `Importar em lote`; área `Arraste PDFs ou uma pasta aqui` + botões `Escolher arquivos` / `Escolher pasta`; leitura com progresso `Lendo <i> de <n>…` (concorrência 2); tabela editável (Arquivo, Música, ⇄, Cantor, Tom (select), Acordes, Status + detalhe/avisos) com reclassificação ao editar; contador `<n> arquivos · <k> prontos`; botões `⬇ Relatório CSV` e `Importar <k> prontos`; durante a importação `Importando <i> de <n>…` e `Cancelar` (aborta a fila; o que entrou fica); no fim, resumo `<a> importados · <b> já existiam · <c> com erro`. Não-PDF ignorado com aviso `Ignoramos <n> arquivo(s) que não são PDF.`.
- [ ] **Step 1:** Testes que falham (readPdf/API falsos): `lists files with suggestions and statuses`; `editing fields reclassifies the row`; `swap button swaps title and artist`; `imports ready rows and shows summary`; `downloads csv with skipped rows`; `ignores non pdf files`; `cancel stops the queue`; `route is admin only`.
- [ ] **Step 2–4:** FAIL → implementar → verde; pdf.js fora do chunk principal.
- [ ] **Step 5: Commit** — `feat(web): batch import page for admins`.

### Task 6: Smoke e PR (qa + orquestrador)

- [ ] **Step 1 (qa):** estender o smoke: `updateSongMeta` (ok e `already-exists`), `deleteArrangement` (gerado ok; último feito à mão com gerado → FAILED_PRECONDITION; depois de apagar o gerado → ok), `deleteSong` (arquivos somem → 404), não-admin → PERMISSION_DENIED. Commit `test(smoke): cover admin callables`.
- [ ] **Step 2 (orquestrador):** checks completos, PR para `develop`, CI, revisão final, correções, merge.
