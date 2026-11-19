# Busca por letra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Busca acha músicas pelo texto da letra (Tudo, Músicas e Harpa; nunca em Cantores), mostrando um trecho com a frase destacada.

**Architecture:** A letra é extraída do PDF no navegador, no upload, e gravada em `songLyrics/{songId}` (Firestore) no mesmo `writeBatch` da música nova. Um provider assina `songLyrics` em segundo plano depois que `songs` está pronta, e a `BuscaPage` filtra tudo em memória. Músicas antigas são preenchidas por um script único (Admin SDK).

**Tech Stack:** TypeScript, React 19, Firebase (Firestore rules, Cloud Functions v2, Admin SDK), pdf.js via `@cifras/pdf`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-19-busca-por-letra-design.md` (telas Paper 03b e 03c).

## Global Constraints

- Escopo: só `BuscaPage` (`/busca`). Não mexer na busca da Home nem na do `AddSongSheet`.
- A seção se chama **Na letra**; o campo de busca da Busca passa a dizer `Buscar música, cantor ou letra…` (placeholder e `aria-label`).
- **Cantores** não busca letra. **Tudo**, **Músicas** e **Harpa** buscam. Em Músicas só músicas comuns; em Harpa só hinos.
- Letra só é consultada com a busca de **3 ou mais caracteres** normalizados (`normalizeText`).
- Letra: no máximo **20.000 caracteres** (`MAX_LYRICS_CHARS`); texto legível (com acento, linhas separadas por `\n`), sem linhas de acorde.
- Trecho de **~120 caracteres**, com palavras buscadas destacadas.
- Nunca abrir PDF na hora de buscar. A assinatura de `songLyrics` só começa quando `songs` está `ready`.
- Só o envio de **música nova** grava a letra; `add-key` e `replace-generated` não.
- Sem letra (PDF escaneado): o envio funciona, nenhum `songLyrics` é criado.
- Erro ao carregar letras: a seção **Na letra** não aparece; título/cantor seguem funcionando.
- Textos da interface em português; seguir os tokens e classes existentes (`redesign.css`, `styles.css`).
- Node 22; `npm run lint`, `npm run typecheck` e `npm test` verdes antes de cada commit de tarefa.

## Review Focus

- Busca de 1–2 caracteres ou só pontuação ("a", "é", "—"): nenhuma letra consultada, sem erro (Tarefa 4 e 6).
- PDF sem texto: salvar funciona e não grava `songLyrics` (Tarefa 3).
- Música antiga sem documento de letra: aparece por título normalmente, nunca quebra (Tarefa 6).
- Letra com mais de 20.000 caracteres: é cortada no cliente e o `create` não é negado pelas regras (Tarefa 3).
- Letras ainda carregando com resultados por título: o título aparece na hora e "Nada encontrado" não pisca (Tarefa 6).

## File Structure

Criar:
- `packages/chords/src/lyrics.ts` (+ `lyrics.test.ts`): `extractLyrics`.
- `apps/web/src/catalog/lyricsSearch.ts` (+ teste): `searchLyrics`, constantes e tipos do trecho.
- `apps/web/src/catalog/useLyrics.ts`, `LyricsProvider.tsx` (+ testes): assinatura das letras.
- `apps/functions/src/lyrics/backfill.ts` (+ teste), `backfillCli.ts`, `apps/functions/tsup.backfill.config.ts`: preenchimento das músicas antigas.
- `e2e/lyrics.spec.ts`.

Modificar: `packages/chords/src/index.ts`, `firestore.rules`, `tests/rules/firestore.rules.test.ts`, `apps/functions/src/songs/adminSongs.ts` (+ teste), `apps/functions/src/index.ts`, `apps/web/src/upload/readPdfSuggestion.ts` (+ teste), `apps/web/src/catalog/types.ts`, `catalogApi.ts`, `apps/web/src/test/fakeCatalogApi.ts`, `apps/web/src/upload/UploadPage.tsx`, `apps/web/src/import/batch.ts`, `ImportPage.tsx`, `apps/web/src/App.tsx`, `apps/web/src/search/BuscaPage.tsx`, `SongList.tsx` (+ testes), `apps/web/src/ui/redesign.css`, `docs/deploy.md`.

---

### Task 1: `extractLyrics` em `@cifras/chords`

**Files:**
- Create: `packages/chords/src/lyrics.ts`, `packages/chords/src/lyrics.test.ts`
- Modify: `packages/chords/src/index.ts`

**Interfaces:**
- Produces: `extractLyrics(lines: TextLine[], options?: { indicator?: KeyIndicator | null; measure?: Measure }): string` (exportada de `@cifras/chords`).

- [ ] **Step 1: Write the failing tests** em `lyrics.test.ts` (use o helper `run`/`line` como em `findChords.test.ts`):
  - `drops chord lines and keeps lyric lines`: linha de acordes (`G`, `D` em negrito) + `Sonda-me, Senhor` (não negrito) → `'Sonda-me, Senhor'`.
  - `drops the line that holds the key indicator`: linha título `Sonda-me - Aline Barros (G)` com `indicator` apontando para ela → fora do resultado.
  - `keeps a bold non-chord line` (ex.: refrão em negrito `Santo é o Senhor`) → presente.
  - `joins runs of one line with a space only when there is a gap`: runs `Son` (x=40, width 18) e `da` (x=58, colada) → `'Sonda'`; as mesmas runs com folga de `0.3 * fontSize` entre elas → `'Son da'`.
  - `treats each wide-gap segment as its own line` (duas colunas: gap > `pageWidth / 3`) → duas linhas.
  - `returns '' for no lyric text` e `collapses blank lines`.
- [ ] **Step 2: Run** `npm test -w @cifras/chords -- lyrics` → FAIL (`extractLyrics` não existe).
- [ ] **Step 3: Implement** `extractLyrics` em `lyrics.ts`. Por linha: se `indicator` está na mesma `page` e `y` da linha, pule a linha. Para cada segmento (`segmentLine`): `analyzeSegment(tokenizeSegment(segment, measure))`; se `unknown.length === 0 && chords.length > 0` é linha de acorde, pule (mesma regra de `scanSegments`). Texto do segmento: runs ordenadas por `x`, unidas com `''` quando `next.x - (prev.x + prev.width) <= 0.15 * prev.fontSize` e com `' '` caso contrário; espaços colapsados e aparado. Segmentos vazios são descartados; resultado = segmentos unidos por `\n`. `indicator` ausente nas opções → `findKeyIndicator(lines, measure)` (como em `findChords`). Exportar em `index.ts`.
- [ ] **Step 4: Run** `npm test -w @cifras/chords` → PASS.
- [ ] **Step 5: Commit** `feat(chords): extractLyrics`.

---

### Task 2: Regras do Firestore e exclusão da letra

**Files:**
- Modify: `firestore.rules`, `tests/rules/firestore.rules.test.ts`, `apps/functions/src/songs/adminSongs.ts`, `apps/functions/src/songs/adminSongs.test.ts`, `apps/functions/src/index.ts`

**Interfaces:**
- Produces: regra `songLyrics/{songId}`; `AdminDeps.deleteLyricsDoc(songId: string): Promise<void>`.

- [ ] **Step 1: Write the failing rules tests** (padrão de `firestore.rules.test.ts`, `memberDb()`, `writeBatch`):
  - `member creates songLyrics together with the song` (batch: `songs/s9` válido + `songLyrics/s9` com `{ text, createdBy: 'm1', createdAt: serverTimestamp() }`) → `assertSucceeds`.
  - Negados: `viewer creates`; `without the song in the same write`; `extra field`; `empty text`; `text of 20001 characters`; `createdBy of another user`; `createdAt not serverTimestamp`; `update`; `delete`.
  - Permitidos/negados de leitura: `signed-in reads songLyrics`, `anonymous cannot read`.
  - `text of exactly 20000 characters is accepted`.
- [ ] **Step 2: Run** `npm run test:rules` → FAIL.
- [ ] **Step 3: Implement** em `firestore.rules`: função `validLyrics(data, songId)` (`validId(songId)`, `data.keys().hasOnly(['text','createdBy','createdAt'])` e `hasAll`, `data.text is string && data.text.size() >= 1 && data.text.size() <= 20000`, `data.createdBy == request.auth.uid`, `data.createdAt == request.time`) e `match /songLyrics/{songId}`: `allow read: if signedIn();` `allow create: if isEditor() && existsAfter(/databases/$(database)/documents/songs/$(songId)) && validLyrics(request.resource.data, songId);` `allow update, delete: if false;`.
- [ ] **Step 4: Run** `npm run test:rules` → PASS.
- [ ] **Step 5: Write the failing function test** em `adminSongs.test.ts`: `deleteSong also deletes the lyrics doc` (o `log` contém `lyrics:s1`, depois de apagar os arranjos e antes ou junto do `song:s1`) e `deleteSong is idempotent when there is no lyrics doc`. Adicione `deleteLyricsDoc` aos `deps` do `setup`.
- [ ] **Step 6: Implement** `deleteLyricsDoc` em `AdminDeps`; `deleteSong` o chama antes de `deleteSongDoc`. Em `index.ts`, `deleteLyricsDoc: async (songId) => { await getFirestore().doc(\`songLyrics/${songId}\`).delete(); }` (apagar doc inexistente não falha no Admin SDK).
- [ ] **Step 7: Run** `npm test -w @cifras/functions` e `npm run typecheck` → PASS.
- [ ] **Step 8: Commit** `feat(rules,functions): songLyrics e exclusão da letra`.

---

### Task 3: Capturar e gravar a letra no envio

**Files:**
- Modify: `apps/web/src/upload/readPdfSuggestion.ts` (+ `.test.ts`), `apps/web/src/catalog/types.ts`, `catalogApi.ts` (+ testes), `apps/web/src/test/fakeCatalogApi.ts`, `apps/web/src/upload/UploadPage.tsx`, `apps/web/src/import/batch.ts`, `apps/web/src/import/ImportPage.tsx`

**Interfaces:**
- Consumes: `extractLyrics` (Tarefa 1).
- Produces: `PdfSuggestion.lyrics: string`; `NewSongInput.lyrics: string`; variante `new-song` de `UploadPlan` com `lyrics: string`; `BatchRow.lyrics: string`; novo arquivo `apps/web/src/catalog/lyricsLimits.ts` com `export const MAX_LYRICS_CHARS = 20_000;` (a Tarefa 4 acrescenta `MIN_LYRICS_QUERY` ao mesmo arquivo).

- [ ] **Step 1: Write the failing tests:**
  - `readPdfSuggestion.test.ts`: `returns the lyrics without chord lines` (mesmo mock de `readTextLines`; `result.lyrics` contém `Sonda-me, Senhor` e não contém `G D`).
  - `catalogApi.test.ts`/`catalogApi.firebase.test.ts` (siga o padrão do arquivo): `createSongWithArrangement writes songLyrics in the same batch` (inclui `text`, `createdBy`, `createdAt`); `does not write songLyrics when lyrics is blank`; `cuts lyrics at 20000 characters` (entrada de 25.000 → `text.length === 20000`); `saveUpload passes the plan lyrics for a new song` e `does not pass lyrics for add-key`.
  - `UploadPage.test.tsx`: `saves a new song with the lyrics read from the PDF` (o `readPdf` falso devolve `lyrics`, `saveUpload`/`createSongWithArrangement` recebe `lyrics`).
  - `ImportPage.test.tsx`: `imports a new song with the row lyrics`.
- [ ] **Step 2: Run** `npm test -w @cifras/web -- readPdfSuggestion catalogApi UploadPage ImportPage` → FAIL.
- [ ] **Step 3: Implement.** `readPdfSuggestion` devolve `lyrics: extractLyrics(lines, { indicator, measure })`. `types.ts`: campos acima. `createSongWithArrangement`: se `input.lyrics.trim() !== ''`, `batch.set(doc(db, 'songLyrics', input.songId), { text: input.lyrics.slice(0, MAX_LYRICS_CHARS), createdBy, createdAt: serverTimestamp() })`. `saveUpload` repassa `plan.lyrics` só no ramo `new-song`. `UploadPage` guarda `lyrics` no estado ao ler o PDF e inclui no plano `new-song`; `batch.ts`/`ImportPage` guardam `lyrics` na linha (linhas ilegíveis ou grandes demais usam `''`) e a incluem no plano `new-song`. Corrija os mocks/fábricas de teste que o compilador apontar.
- [ ] **Step 4: Run** `npm test -w @cifras/web` e `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): gravar a letra ao enviar música nova`.

---

### Task 4: Casamento e trecho (`searchLyrics`)

**Files:**
- Create: `apps/web/src/catalog/lyricsSearch.ts`, `apps/web/src/catalog/lyricsSearch.test.ts`
- Modify: `apps/web/src/catalog/lyricsLimits.ts`

**Interfaces:**
- Consumes: `normalizeText` (`@cifras/chords`), `compareTitles` (`catalog/search.ts`), `SongSummary`.
- Produces:
  - `MIN_LYRICS_QUERY = 3`, adicionada a `apps/web/src/catalog/lyricsLimits.ts` (onde a Tarefa 3 já definiu `MAX_LYRICS_CHARS`)
  - `interface SnippetPart { text: string; match: boolean }`
  - `interface LyricHit { song: SongSummary; snippet: SnippetPart[]; phrase: boolean }`
  - `searchLyrics(songs: SongSummary[], lyrics: ReadonlyMap<string, string>, query: string, exclude?: ReadonlySet<string>): LyricHit[]`

- [ ] **Step 1: Write the failing tests:**
  - `finds a song when every word is in the lyrics` (letra com acento, busca sem acento e em maiúsculas).
  - `returns nothing for queries under 3 normalized characters` (`'a'`, `'é'`, `'—'`, `'  '`).
  - `ignores songs without a lyrics entry` e `skips excluded song ids`.
  - `marks phrase=true only when the words appear together in order` e ordena `phrase` primeiro, depois por título (`compareTitles`).
  - `highlights the matched words with their original accents` (`'Senhor Deus todo poderoso'` → partes com `match: true`).
  - `snippet is about 120 characters, cut on word boundaries, with … only on the cut sides` (match no começo → sem `…` à esquerda; no fim → sem `…` à direita).
  - `matches inside a word like the title search does` (`pod` → `poderoso`).
  - `centers on the first phrase occurrence, else on the first matching word`.
- [ ] **Step 2: Run** `npm test -w @cifras/web -- lyricsSearch` → FAIL.
- [ ] **Step 3: Implement** `searchLyrics`. Palavras da busca = `normalizeText(query).split(' ')`; abaixo de `MIN_LYRICS_QUERY` caracteres → `[]`. Uma música casa se todas as palavras estão em `normalizeText(texto)` (mesma regra de `matchesAll`). O trecho é montado por palavras do texto original (cada palavra normalizada na hora, sem mapear posições): `phrase` = existe uma sequência de palavras consecutivas em que a palavra k contém a palavra k da busca; âncora = início da primeira sequência, senão a primeira palavra que contém alguma palavra da busca; janela expandida em palavras até ~120 caracteres; `match: true` nas palavras da sequência (ou, sem frase, nas que contêm alguma palavra da busca dentro da janela). Quebras de linha viram espaço.
- [ ] **Step 4: Run** `npm test -w @cifras/web -- lyricsSearch` → PASS.
- [ ] **Step 5: Commit** `feat(web): busca por letra em memória`.

---

### Task 5: Assinatura das letras em segundo plano

**Files:**
- Create: `apps/web/src/catalog/useLyrics.ts`, `LyricsProvider.tsx` (+ `.test.ts(x)`)
- Modify: `apps/web/src/catalog/catalogApi.ts`, `apps/web/src/test/fakeCatalogApi.ts`, `apps/web/src/App.tsx`

**Interfaces:**
- Produces:
  - `CatalogApi.subscribeLyrics(cb: (lyrics: Map<string, string>) => void, onError: (e: unknown) => void): () => void` (`onSnapshot` em `songLyrics`; ignora documentos sem `text` string não vazio).
  - `interface LyricsState { status: 'idle' | 'loading' | 'ready' | 'error'; lyrics: ReadonlyMap<string, string> }`
  - `useLyrics(api: CatalogApi, enabled: boolean): LyricsState` (`idle` enquanto `enabled` é falso; depois `loading` → `ready`/`error`).
  - `LyricsProvider({ api, children })` (usa `useSongsContext().status === 'ready'` como `enabled`) e `useLyricsContext(): LyricsState` (lança fora do provider, como `useSongsContext`).
  - `fakeCatalogApi` ganha `subscribeLyrics` padrão que entrega `new Map()` na hora.

- [ ] **Step 1: Write the failing tests:** `useLyrics` fica `idle` e não assina com `enabled=false`; vira `loading` e depois `ready` com o mapa; vai a `error` quando `onError` dispara e mantém o último mapa; cancela a assinatura ao desmontar. `LyricsProvider` só assina depois que `songs` está `ready` (use `fakeCatalogApi` com `subscribeSongs` controlado). `catalogApi.firebase.test.ts`: `subscribeLyrics` converte docs em `Map`.
- [ ] **Step 2: Run** `npm test -w @cifras/web -- useLyrics LyricsProvider catalogApi` → FAIL.
- [ ] **Step 3: Implement** os itens acima; em `App.tsx` envolva as rotas com `<LyricsProvider api={catalogApi}>` dentro do `SongsProvider`.
- [ ] **Step 4: Run** `npm test -w @cifras/web` e `npm run typecheck` → PASS (os testes de `App`/rotas continuam usando `fakeCatalogApi`).
- [ ] **Step 5: Commit** `feat(web): assinar letras em segundo plano`.

---

### Task 6: Seção "Na letra" na Busca

**Files:**
- Modify: `apps/web/src/search/BuscaPage.tsx` (+ `BuscaPage.test.tsx`), `apps/web/src/search/SongList.tsx` (+ `SongList.test.tsx`), `apps/web/src/ui/redesign.css`, `apps/web/src/routes/routes.test.tsx` (nome acessível novo)

**Interfaces:**
- Consumes: `searchLyrics`, `MIN_LYRICS_QUERY` (de `lyricsLimits.ts`), `LyricHit`, `SnippetPart` (Tarefa 4); `useLyricsContext` (Tarefa 5).
- Produces: `SongList` aceita `snippets?: ReadonlyMap<string, SnippetPart[]>` e, quando há trecho da música, renderiza abaixo do link um bloco `.lyric-snippet` com `<mark class="lyric-hit">` nas partes com `match`.

- [ ] **Step 1: Write the failing tests** (`BuscaPage.test.tsx`, `fakeCatalogApi(songs, { subscribeLyrics })` com letras de exemplo; `renderBusca('/busca?q=...')`):
  - `shows a "Na letra" section with the snippet and the highlighted words` (heading `Na letra`, `mark` com o texto buscado, contador `1 música`).
  - `does not repeat a song already listed by title` (música que casa por título e por letra só em Músicas).
  - `hides "Na letra" under the Cantores filter`; `shows it under Tudo, Músicas and Harpa` e `Músicas` só com músicas comuns, `Harpa` só com hinos (use um `makeSong` com `artistName: 'Harpa'`).
  - `shows skeleton cards while lyrics load` (`subscribeLyrics` que não responde): heading `Na letra`, `aria-busy`, e os resultados por título já visíveis.
  - `does not show "Nada encontrado" while lyrics are loading` e `shows it when lyrics are ready and nothing matched`.
  - `shows nothing in "Na letra" when lyrics fail` (`onError`), título segue funcionando.
  - `does not search lyrics for queries under 3 characters`.
  - `song without a lyrics entry still shows up by title`.
  - Placeholder/`aria-label` `Buscar música, cantor ou letra…`.
  - `SongList.test.tsx`: renderiza o trecho com `mark` quando `snippets` tem a música; sem `snippets` nada muda.
- [ ] **Step 2: Run** `npm test -w @cifras/web -- BuscaPage SongList routes` → FAIL.
- [ ] **Step 3: Implement** em `BuscaPage`: candidatos = `splitHarpa(songs)` conforme o filtro (`Tudo`: todas; `Músicas`: `regular`; `Harpa`: `harpa`; `Cantores`: nenhuma); `exclude` = ids de `matches` e `harpaMatches`; seção **Na letra** depois de **Harpa** (cartões via `SongList` com `snippets`); com `status` `idle`/`loading` e busca ≥ `MIN_LYRICS_QUERY`, heading + 2 cartões de esqueleto (`aria-busy="true"`, sem texto); `error` não renderiza a seção; `nothing` só quando as letras não estão carregando. CSS em `redesign.css` seguindo o Paper 03b/03c: bloco do trecho com `border-top: 1px solid var(--color-border)`, `padding-top: 10px`, texto 13px/19px `--color-text-muted`; `.lyric-hit` com `color: var(--color-amber)` (tema claro: `--color-light-amber-text`), `font-weight: 700`, sem fundo; esqueleto com `--color-elevated`. Atualize os testes de `routes.test.tsx` para o novo nome acessível.
- [ ] **Step 4: Run** `npm test -w @cifras/web`, `npm run lint`, `npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(web): seção "Na letra" na Busca`.

---

### Task 7: Preenchimento das músicas antigas

**Files:**
- Create: `apps/functions/src/lyrics/backfill.ts`, `backfill.test.ts`, `backfillCli.ts`, `apps/functions/tsup.backfill.config.ts`
- Modify: `apps/functions/package.json` (script), `docs/deploy.md`

**Interfaces:**
- Consumes: `extractLyrics`, `findKeyIndicator` (`@cifras/chords`), `readTextLines` (`@cifras/pdf`).
- Produces:
  ```ts
  interface BackfillDeps {
    listSongIds(): Promise<string[]>;
    hasLyrics(songId: string): Promise<boolean>;
    handmadeStoragePath(songId: string): Promise<string | null>;
    readPdf(storagePath: string): Promise<Uint8Array>;
    lyricsFromPdf(pdf: Uint8Array): Promise<string>;
    writeLyrics(songId: string, text: string): Promise<boolean>; // create-only; false se já existe
  }
  interface BackfillReport { written: number; existing: number; noPdf: string[]; noText: string[];
    failed: Array<{ songId: string; error: string }>; samples: Array<{ songId: string; text: string }> }
  backfillLyrics(deps: BackfillDeps, options: { dryRun: boolean; samples?: number }): Promise<BackfillReport>
  ```

- [ ] **Step 1: Write the failing tests** (`backfill.test.ts`, deps falsas): grava a letra de música sem documento; pula quem já tem (`existing`); `noPdf` quando `handmadeStoragePath` é `null`; `noText` quando a letra extraída é vazia (nada gravado); erro em uma música vai para `failed` e não interrompe as outras; `dryRun` não chama `writeLyrics` mas conta o que gravaria e preenche `samples` (até `samples`, padrão 3); texto maior que 20.000 caracteres é cortado; rodar duas vezes não grava de novo (`writeLyrics` devolve `false`).
- [ ] **Step 2: Run** `npm test -w @cifras/functions -- backfill` → FAIL.
- [ ] **Step 3: Implement** `backfillLyrics` (sequencial, uma música por vez). `backfillCli.ts`: `parseArgs` com `--bucket` (obrigatório), `--dry-run`, `--samples`; `initializeApp({ storageBucket })` com credenciais ADC; deps reais (Firestore `songs`, `songs/{id}/arrangements` com `source == 'handmade'`, `bucket.file(path).download()`, `writeLyrics` com `doc.create({ text, createdBy: 'backfill', createdAt: FieldValue.serverTimestamp() })` tratando `ALREADY_EXISTS` como `false`); imprime o relatório (contagens, ids de `noPdf`/`noText`/`failed` e as amostras com as primeiras linhas) e sai com código 1 se houver `failed`. `tsup.backfill.config.ts`: entrada `src/lyrics/backfillCli.ts`, formato ESM, `outDir: 'lib'`, `noExternal: [/^@cifras\//]`, `pdfjs-dist` e `firebase-admin` externos; **não** entra no `index.ts` das functions (o bundle publicado não pode carregar pdf.js). Script `"lyrics:backfill": "tsup --config tsup.backfill.config.ts && node lib/backfillCli.js"` no `apps/functions` e um atalho `npm run lyrics:backfill -- --bucket <b> [--dry-run]` na raiz (`npm run lyrics:backfill -w @cifras/functions --`).
- [ ] **Step 4: Verify manualmente contra o emulador:** com `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` e `FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199`, semeie uma música com um PDF sintético (o de `e2e/fixtures/pdf.ts`) e rode `--dry-run` (esperado: 1 a gravar, amostra com a letra e sem acordes) e depois sem `--dry-run` (esperado: `songLyrics/<id>` criado); rodar de novo → `existing: 1`.
- [ ] **Step 5: Docs:** em `docs/deploy.md`, seção "Preencher as letras das músicas já enviadas" (rodar depois do deploy, no Cloud Shell com `gcloud auth application-default login` quando fora dele, primeiro com `--dry-run`, conferir as amostras, depois sem; bucket = `VITE_FIREBASE_STORAGE_BUCKET`).
- [ ] **Step 6: Run** `npm test -w @cifras/functions`, `npm run typecheck`, `npm run lint` → PASS.
- [ ] **Step 7: Commit** `feat(functions): preencher letras das músicas já enviadas`.

---

### Task 8: E2E

**Files:**
- Create: `e2e/lyrics.spec.ts`

- [ ] **Step 1: Write the test** (padrão de `e2e/upload.spec.ts`: `signInAs(page, ADMIN, 'Admin')`, `syntheticPdf`, `lettersTag`): admin envia um PDF sintético novo (título único) e salva; vai à Busca, digita `campo verde` (verso de `LYRICS` em `e2e/fixtures/pdf.ts`); espera o heading `Na letra`, o cartão com o título da música e um `mark` com `campo verde`; ao escolher **Cantores**, a seção some; ao buscar `ab`, a seção não aparece.
- [ ] **Step 2: Run** `npm run test:e2e` (inclui a nova spec) → PASS.
- [ ] **Step 3: Commit** `test(e2e): busca por letra`.

---

## Self-review

- Cobertura do spec: dados e regras (T2), extração (T1), gravação só em música nova + sem letra (T3), `deleteSong` (T2), assinatura em segundo plano (T5), casamento/trecho/ordem/exclusão de duplicadas/3 caracteres (T4), filtros, esqueleto, erro e "nada encontrado" (T6), preenchimento (T7), e2e e lançamento (T7/T8, `docs/deploy.md`).
- Nomes consistentes entre tarefas: `extractLyrics`, `searchLyrics`, `LyricHit`, `SnippetPart`, `subscribeLyrics`, `useLyrics`, `LyricsProvider`, `useLyricsContext`, `MAX_LYRICS_CHARS`, `MIN_LYRICS_QUERY`, `deleteLyricsDoc`.
- Ordem: T1 e T2 independentes; T3 depende de T1 e do `MAX_LYRICS_CHARS` (T4 completa o arquivo); T5 antes de T6; T7 depende de T1; T8 por último.
