# Fase 4 — Upload e busca: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membros sobem PDFs de cifra (com sugestão de música/cantor/tom lida do PDF, tratamento de música/tom já existente e aviso de PDF fora do padrão); todos os logados buscam por música ou cantor (abas Músicas | Cantores), abrem a tela do cantor e a página da música com os tons salvos.

**Architecture:** O site lê `songs` com `onSnapshot` (cache persistente do Firestore) e filtra em memória; a lista de cantores é **derivada das músicas** no cliente. Upload: PDF → Storage (`songs/{songId}/{keySlug}-{fileId}.pdf`, imutável) → batch no Firestore (`songs/{id}` + `arrangements/{keySlug}`) validado por Security Rules. Gatilho `onArrangementWritten` mantém `song.keys`/`handmadeKeys`. Substituir tom gerado por feito à mão via callable `replaceArrangement`. Callables checam papel lendo `users/{uid}` (fecha a janela de até 1 h do token). pdf.js carregado só na rota de upload.

**Tech Stack:** React 19 + react-router, Firebase JS SDK 13.3.0 (Firestore `persistentLocalCache`, Storage), firebase-functions 7.4.0 (v2 `onDocumentWritten`, `onCall`), `@cifras/chords`, `@cifras/pdf` (pdfjs-dist 6.5.x legacy + worker via `?url`), Vitest, rules-unit-testing.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§6.5, §6.6, §6.7, §6.8, §6.9 Upload, §6.10 telas 1a–1c e 3a–3c)

## Global Constraints

- **Coleção `artists` não será criada** [decisão nossa, desvio da §6.5]: cantores são derivados de `songs` em memória (acervo de centenas). `artistId = normalizeText(nome).replace(/ /g, '-')`.
- `keySlug(key)`: `#` → `s` (`C#`→`Cs`, `F#m`→`Fsm`, `Bb`→`Bb`). Doc id de arrangement = `keySlug`; campo `key` = nome canônico. URLs usam o slug (`?tom=Fs`).
- `songs/{id}`: `title`, `titleNormalized`, `artistId`, `artistName`, `keys: KeyName[]`, `handmadeKeys: KeyName[]`, `createdBy`, `createdAt`, `updatedAt`. Cliente cria com `keys: []`, `handmadeKeys: []`; só o gatilho os preenche (ordem de `KEY_OPTIONS`, maiores antes de menores).
- `arrangements/{slug}`: `key`, `storagePath`, `source: 'handmade' | 'generated'`, `derivedFromKey: KeyName | null`, `writer: 'upload' | 'overlay' | 'rewrite'`, `chordCount`, `collisions`, `createdBy`, `createdAt`. Imutável pelo cliente (só `create`).
- Storage: `songs/{songId}/{keySlug}-{fileId}.pdf`, `contentType == 'application/pdf'`, ≤ 10 MB, sem sobrescrever, `cacheControl: 'public, max-age=31536000, immutable'`.
- Escrever (criar música/tom, enviar arquivo, `replaceArrangement`): papel `member` ou `admin`. Token sem claim = `viewer`.
- Decisão de upload (spec §6.9) — `decideUpload(existingSong, key)`: música inexistente → `new-song`; existe e tom ausente → `add-key`; tom existe `generated` → `replace-generated`; tom existe `handmade` → `blocked`.
- Música existente = mesmo `titleNormalized` **e** mesmo `artistId`.
- PDF sem acordes (`findChords` vazio) → bloqueia com a mensagem da tela 3c.
- UI pt-BR, mobile-first, tokens de `styles.css`; identificadores em inglês; versões exatas; TS strict; Conventional Commits + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add`/`git commit` separados.

## Review Focus

1. **Dois membros subindo o mesmo tom ao mesmo tempo** → o segundo `create` do arrangement falha (doc já existe) e a UI mostra `Esse tom acabou de ser salvo por outra pessoa.` — teste de regra `denies creating an arrangement that already exists` e teste de UI (Task 5).
2. **Upload interrompido** (arquivo no Storage, batch falha) → arquivo órfão é apagado pelo cliente no `catch` — teste `deletes uploaded file when saving fails` (Task 3).
3. **Visitante tentando subir** (UI esconde, mas API/console) → regras negam Storage e Firestore — testes de regra (Task 2).
4. **Busca com acento/caixa** (`sonda me` acha `Sonda-me`; `aline` acha por cantor) — teste `filters songs by title or artist ignoring accents` (Task 4).
5. **PDF fora do padrão ou com linhas suspeitas** → bloqueio (0 acordes) ou aviso listando os tokens não reconhecidos — testes da Task 5.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/chords/src/catalog.ts` | `keySlug`, `keyFromSlug`, `compareKeys`, `artistIdFromName` |
| `apps/functions/src/auth/requireRole.ts` | Lê `users/{uid}.role` e valida |
| `apps/functions/src/songs/keys.ts` | `summarizeArrangements` (puro) + gatilho |
| `apps/functions/src/songs/replaceArrangement.ts` | Lógica pura + handler |
| `firestore.rules`, `storage.rules`, `tests/rules/*` | Regras de escrita |
| `apps/web/src/lib/firebase.ts` | Cache persistente |
| `apps/web/src/catalog/catalogApi.ts` | Ler/escrever músicas, tons, arquivos |
| `apps/web/src/catalog/useSongs.ts` | Assinatura da lista em memória |
| `apps/web/src/catalog/search.ts` | Filtro e derivação de cantores |
| `apps/web/src/search/*` | Início (abas), Cantor, Música |
| `apps/web/src/upload/*` | Nova cifra (lazy), `decideUpload`, leitura do PDF |

---

### Task 1: Domínio compartilhado e Functions de catálogo

**Files:**
- Create: `packages/chords/src/catalog.ts` (+ export), `apps/functions/src/auth/requireRole.ts`, `apps/functions/src/songs/{keys.ts,replaceArrangement.ts}`
- Modify: `apps/functions/src/index.ts` (exports; `setUserRole` passa a usar `requireRole`)
- Test: `packages/chords/src/catalog.test.ts`, `apps/functions/src/auth/requireRole.test.ts`, `apps/functions/src/songs/{keys,replaceArrangement}.test.ts`

**Interfaces:**
- Produces:
  - `keySlug(key: KeyName): string`; `keyFromSlug(slug: string): KeyName | null`; `compareKeys(a: KeyName, b: KeyName): number` (ordem `KEY_OPTIONS.major` depois `minor`); `artistIdFromName(name: string): string`.
  - `requireRole(deps: { getUserRole(uid: string): Promise<unknown> }, uid: string | undefined, allowed: Role[]): Promise<Role>` — lança `HttpsError('unauthenticated'|'permission-denied')`.
  - `summarizeArrangements(docs: Array<{ key: string; source: string }>): { keys: KeyName[]; handmadeKeys: KeyName[] }` (ordenados por `compareKeys`, sem duplicatas, ignora chaves inválidas).
  - Gatilho `onArrangementWritten` = `onDocumentWritten({ document: 'songs/{songId}/arrangements/{slug}', region: 'southamerica-east1' }, …)`: lê todos os arrangements da música e grava `{ keys, handmadeKeys, updatedAt: serverTimestamp() }` (merge); música inexistente → ignora.
  - `ReplaceDeps = { getArrangement(songId, slug): Promise<{ source: string; storagePath: string } | null>; replaceArrangementDoc(songId, slug, data): Promise<void>; deleteFile(path): Promise<void>; fileExists(path): Promise<boolean>; now(): Date }`.
  - `replaceArrangement(deps, input: { uid: string; songId: unknown; key: unknown; storagePath: unknown; chordCount: unknown }): Promise<{ songId: string; key: KeyName }>` — valida tipos; `storagePath` deve começar com `songs/{songId}/{slug}-` e terminar com `.pdf`, e existir; arrangement inexistente → `not-found`; `handmade` → `failed-precondition`; senão grava `{ key, storagePath, source: 'handmade', derivedFromKey: null, writer: 'upload', chordCount, collisions: 0, createdBy: uid, createdAt: now }` e apaga o arquivo antigo (erro ao apagar é logado, não falha). Callable `replaceArrangement` (região sa-east1) chama `requireRole(['member','admin'])` antes.
- [ ] **Step 1:** Testes que falham:
  - catalog: `slugs keys with sharps` (`C#`→`Cs`, `F#m`→`Fsm`, `keyFromSlug('Fsm')`→`F#m`, `keyFromSlug('x')`→null); `orders keys majors then minors`; `artist id from name` (`'Aline Barros '`→`aline-barros`, `'Damáris  ANDRADE'`→`damaris-andrade`).
  - requireRole: `reads role from users doc`, `rejects missing uid`, `rejects role not allowed`, `rejects unknown role value`.
  - keys: `summarizes keys and handmade keys in canonical order`, `drops invalid keys and duplicates`.
  - replaceArrangement: `replaces generated with handmade and deletes old file`, `rejects replacing handmade`, `not-found when missing`, `rejects path outside song folder`, `rejects missing file`, `keeps going when old file delete fails` (loga).
  - `setUserRole` usa `requireRole` (teste existente adaptado: papel vem do doc, não do token).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test`, lint, typecheck, `npm run build -w @cifras/functions` (confirma que `@cifras/chords` é embutido), format → verde.
- [ ] **Step 5: Commit** — `feat(functions): maintain song keys and replace generated arrangements`.

---

### Task 2: Regras de escrita (Firestore e Storage)

**Files:** Modify `firestore.rules`, `storage.rules`, `tests/rules/firestore.rules.test.ts`, `tests/rules/storage.rules.test.ts`

**Interfaces:**
- Produces: `songs/{songId}` `create` se `role in ['member','admin']` e o doc tem exatamente as chaves das Global Constraints, `title` string 1–120, `titleNormalized`/`artistId`/`artistName` strings não vazias (≤ 120), `keys == []`, `handmadeKeys == []`, `createdBy == uid`, `createdAt == request.time`, `updatedAt == request.time`; `update`/`delete`: falso. `arrangements/{slug}` `create` se editor, `existsAfter(/songs/$(songId))`, `key` string na lista canônica (lista literal nas regras), `slug` coerente (`#`→`s`), `source in ['handmade','generated']`, `derivedFromKey == null` quando `handmade` e string quando `generated`, `writer in ['upload','overlay']`, `storagePath.matches('songs/' + songId + '/' + slug + '-[A-Za-z0-9_-]+[.]pdf')`, `chordCount` int ≥ 1, `collisions` int ≥ 0, `createdBy == uid`, `createdAt == request.time`; `update`/`delete`: falso. Storage `songs/{songId}/{fileName}`: `create` (sem sobrescrever) para editor, `contentType == 'application/pdf'`, `size < 10 * 1024 * 1024`, `fileName.matches('[A-Za-z]+-[A-Za-z0-9_-]+[.]pdf')`; leitura como antes.
- [ ] **Step 1:** Testes que falham: `allows member to create song with arrangement in one batch`; `denies viewer creating song`; `denies token without role claim creating song`; `denies song with non-empty keys`; `denies song with createdBy of another user`; `denies arrangement with mismatched slug`; `denies arrangement path outside song folder`; `denies creating an arrangement that already exists`; `denies arrangement updates and deletes`; `denies generated arrangement without derivedFromKey`; Storage: `allows member to upload pdf under songs`, `denies viewer upload`, `denies non-pdf`, `denies files over 10 MB`, `denies overwriting an existing file`, `denies bad file names`. Incluir também os testes adiados da Fase 2: `allows admin to list users` já existe — conferir; `denies unauthenticated read of users/artists/arrangements` já existe — conferir.
- [ ] **Step 2:** `npm run test:rules` → FAIL. **Step 3:** Regras. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(rules): let members create songs, arrangements and pdf uploads`.

---

### Task 3: Camada de dados do site

**Files:**
- Modify: `apps/web/src/lib/firebase.ts` (`initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`; nos testes/jsdom usar memória), `apps/web/src/routes/RequireRole.tsx` (generaliza)
- Create: `apps/web/src/catalog/{types.ts,catalogApi.ts,useSongs.ts,search.ts}`, `apps/web/src/lib/pdfWorker.ts`
- Test: `apps/web/src/catalog/{catalogApi,search,useSongs}.test.ts(x)`, `routes.test.tsx` (RequireRole)

**Interfaces:**
- Consumes: `keySlug`, `artistIdFromName`, `normalizeText`, `compareKeys` (`@cifras/chords`); `configurePdfWorker`/`getPdfjs` (`@cifras/pdf`).
- Produces:
  - `RequireRole({ roles: Role[], children })` (substitui `RequireAdmin`; `/pessoas` usa `roles={['admin']}`).
  - `SongSummary = { id, title, titleNormalized, artistId, artistName, keys: KeyName[], handmadeKeys: KeyName[] }`; `ArtistSummary = { id, name, songCount }`.
  - `CatalogApi = { subscribeSongs(cb: (songs: SongSummary[]) => void, onError: (e: unknown) => void): () => void; findSong(titleNormalized: string, artistId: string): Promise<SongSummary | null>; getArrangement(songId: string, key: KeyName): Promise<{ source: 'handmade' | 'generated' } | null>; uploadPdf(songId: string, key: KeyName, file: Blob): Promise<string /* storagePath */>; deleteFile(path: string): Promise<void>; createSongWithArrangement(input: NewSongInput): Promise<string /* songId */>; addArrangement(songId: string, input: NewArrangementInput): Promise<void>; replaceArrangement(songId: string, key: KeyName, storagePath: string, chordCount: number): Promise<void>; getPdfUrl(storagePath: string): Promise<string> }`; `createCatalogApi(services)` usando `doc(collection(db,'songs'))` para gerar id, `writeBatch`, `serverTimestamp()`, `uploadBytes(ref, file, { contentType: 'application/pdf', cacheControl: 'public, max-age=31536000, immutable' })`, `fileId = crypto.randomUUID()` sem hífens, `httpsCallable('replaceArrangement')`.
  - `saveUpload(api, plan: UploadPlan): Promise<{ songId: string; key: KeyName }>` — envia o arquivo, executa a ação (`new-song` | `add-key` | `replace-generated`); se a ação falhar depois do upload, apaga o arquivo e relança.
  - `useSongs(api)` → `{ status: 'loading' | 'ready' | 'error'; songs: SongSummary[] }`.
  - `filterSongs(songs, query)` (título ou cantor, normalizado, contém todas as palavras); `deriveArtists(songs): ArtistSummary[]` (A–Z por nome, `songCount`); `filterArtists(artists, query)`.
  - `pdfWorker.ts`: importa `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url` e chama `configurePdfWorker` uma vez.
- [ ] **Step 1:** Testes que falham: `filters songs by title or artist ignoring accents`; `derives artists with song counts sorted by name`; `filters artists by name only`; `saveUpload creates song and arrangement`; `saveUpload adds key to existing song`; `saveUpload replaces generated via callable`; `deletes uploaded file when saving fails`; `useSongs exposes loading, ready and error`; `RequireRole allows listed roles and redirects others`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** test, lint, typecheck, build, format → verde.
- [ ] **Step 5: Commit** — `feat(web): add catalog data layer with persistent cache`.

---

### Task 4: Busca, cantor e página da música

**Files:**
- Create: `apps/web/src/search/{HomePage.tsx,ArtistPage.tsx,SongPage.tsx,SongList.tsx,KeyChips.tsx}` (+ testes)
- Modify: `apps/web/src/App.tsx` (rotas `/`, `/cantores/:artistId`, `/musicas/:songId`), remove o `HomePage` placeholder, `styles.css`

**Interfaces:**
- Consumes: `useSongs`, `filterSongs`, `deriveArtists`, `filterArtists`, `CatalogApi.getArrangement/getPdfUrl`, `useAuth`, `canEdit`.
- Produces telas (mockups 1a–1c):
  - Início: campo `Buscar música ou cantor…` (aba Músicas) / `Buscar cantor…` (aba Cantores); abas `Músicas` | `Cantores` (estado na URL `?aba=cantores`); lista de músicas (título, cantor, chips dos tons → `/musicas/:id?tom=<slug>`); lista de cantores (`<n> músicas ›` / `1 música ›`); vazio: `Nenhuma cifra ainda.` / `Nada encontrado para “<q>”.`; botão flutuante `＋ Nova cifra` só para `member`/`admin` → `/nova`.
  - Cantor: `‹ <nome>`, `<n> músicas`, filtro `Filtrar músicas de <nome>…`, lista A–Z.
  - Música (provisória até a Fase 5): título, cantor, chips de tons (selecionado pelo `?tom`, padrão = primeiro tom feito à mão), botão `Abrir PDF` (abre a URL do Storage em nova aba); `Música não encontrada.` se id inválido.
- [ ] **Step 1:** Testes que falham (com `CatalogApi` falsa): `lists songs with key chips linking to the key`; `searches by artist`; `switches to Cantores tab and filters artists`; `shows Nova cifra only for editors`; `artist page lists that artist songs and filters`; `song page selects key from query and opens pdf`; `shows not found for unknown song`; `shows empty catalog message`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(web): add song and artist search with tabs`.

---

### Task 5: Nova cifra (upload)

**Files:**
- Create: `apps/web/src/upload/{decideUpload.ts,readPdfSuggestion.ts,UploadPage.tsx}` (+ testes)
- Modify: `App.tsx` (rota `/nova` com `React.lazy`, `RequireRole roles={['member','admin']}`)

**Interfaces:**
- Consumes: `readTextLines`, `getPdfjs` (`@cifras/pdf`), `findChords`, `findKeyIndicator`, `buildTransposePlan` (para `suspectSegments`, com `to = from`), `suggestMetadata`, `parseKey`, `KEY_OPTIONS`, `normalizeText`, `artistIdFromName` (`@cifras/chords`); `CatalogApi`, `saveUpload`, `deriveArtists`.
- Produces:
  - `decideUpload(existing: { song: SongSummary; arrangement: { source: string } | null } | null): 'new-song' | 'add-key' | 'replace-generated' | 'blocked'`.
  - `readPdfSuggestion(file: File, knownArtists: string[]): Promise<{ chordCount: number; suspects: string[][]; suggestion: MetadataSuggestion }>`.
  - `UploadPage({ api, readPdf })` (mockups 3a–3c): escolher PDF (`accept="application/pdf"`); estado lendo `Lendo PDF…`; sucesso `✓ <arquivo> · <n> acordes`; 0 acordes → `✕ Não encontramos acordes neste PDF.` + `Os acordes precisam estar em negrito, numa linha acima da letra. PDF escaneado ou imagem não funciona.` + `Escolher outro arquivo`; suspeitos → aviso `Confira: não reconhecemos <tokens> como acorde.`; campos Música / Cantor (com `datalist` dos cantores existentes) / Tom (select com `KEY_OPTIONS` do modo sugerido + alternância maior/menor), selo `· lido do PDF` quando veio do PDF; botão `⇄ inverter música/cantor`; ao mudar campos, recalcula a decisão (debounce 300 ms): `new-song` → botão `Salvar cifra`; `add-key` → aviso `Essa música já existe. Vamos adicionar o tom <K>.` + `Adicionar tom <K>`; `replace-generated` → `Essa música já existe. O tom <K> foi gerado pelo sistema. O seu PDF feito à mão vai substituir o gerado.` + `Substituir tom <K>`; `blocked` → `Essa música já tem um PDF feito à mão em <K>. Para trocar, peça a um admin para apagar o tom antes.` (botão desabilitado). Salvando: `Salvando…`; sucesso → navega para `/musicas/:id?tom=<slug>`; erro de doc já existente → `Esse tom acabou de ser salvo por outra pessoa.`; outros → `Não foi possível salvar. Tente de novo.`. Arquivo > 10 MB → `O PDF precisa ter até 10 MB.`
- [ ] **Step 1:** Testes que falham: `decideUpload` (4 casos); página com `readPdf` e `api` falsos: `prefills fields from the pdf`, `blocks pdf without chords`, `warns about suspect chords`, `swaps title and artist`, `offers add key for existing song`, `offers replace for generated key`, `blocks when handmade key exists`, `saves and navigates to the song`, `shows conflict message when key was just saved`, `rejects files over 10 MB`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (`readPdfSuggestion` real usa `file.arrayBuffer()` + `readTextLines`; importar `pdfWorker.ts` só dentro do módulo lazy). **Step 4:** verde; `npm run build -w @cifras/web` e conferir que o chunk do pdf.js não está no bundle inicial (`dist/assets` — o `index-*.js` não contém `pdfjs`).
- [ ] **Step 5: Commit** — `feat(web): upload chord pdfs with suggestions and duplicate handling`.

---

### Task 6: Smoke no Docker, docs e PR

**Files:** Create `scripts/smoke/upload.mjs`; Modify root `package.json` (`smoke:upload`), `README.md`

- [ ] **Step 1:** `scripts/smoke/upload.mjs` (Node 22, só `fetch`, contra os emuladores do compose): login IdP do emulador como `admin@cifras.local` (e-mail verificado) e como visitante; gera um PDF sintético mínimo (bytes embutidos via `pdf-lib` de `@cifras/pdf` devDeps ou um PDF em base64 de letra inventada); como admin: upload no Storage REST (`POST /v0/b/demo-church-cifras.appspot.com/o?name=…`), `commit` no Firestore REST com `song` + `arrangement` (`createdAt`/`updatedAt` com `REQUEST_TIME` transform); espera ≤ 30 s até `song.keys` conter o tom (gatilho); como visitante: tenta o mesmo `commit` → 403. Imprime `OK` e sai 0, ou o motivo e sai 1.
- [ ] **Step 2:** `docker compose up -d --build`, `npm run smoke:upload` → `OK`; `docker compose down`.
- [ ] **Step 3:** README: "Subir uma cifra localmente" (entrar como `admin@cifras.local`, Nova cifra, usar um PDF próprio).
- [ ] **Step 4: Commit** — `test(smoke): verify upload flow against emulators`.
- [ ] **Step 5 (orquestrador):** checks completos, push, PR para `develop`, CI verde, revisão final (code-reviewer), correções, comentário, merge.
