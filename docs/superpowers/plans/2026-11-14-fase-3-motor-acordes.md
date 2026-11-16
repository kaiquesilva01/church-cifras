# Fase 3 — Motor de acordes e leitura de PDF: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dado um PDF de cifra (formato do acervo, spec §6.1), extrair as linhas de texto, reconhecer os acordes e o indicador de tom, e produzir um **TransposePlan** (o que trocar, onde, por quê) para qualquer tom de destino — além das sugestões de música/cantor/tom para o upload. Sem interface ainda; a prévia e o gerador de PDF vêm na Fase 5.

**Architecture:** Dois pacotes de workspace. `@cifras/chords` é **puro** (sem dependências): tons, acordes, transposição, grafia, classificação de linhas, plano e metadados; trabalha sobre um modelo neutro de linhas de texto. `@cifras/pdf` adapta o `pdfjs-dist` para esse modelo (`readTextLines`). Pacotes são consumidos como fonte TypeScript (Vite no site, tsup nas Functions com `noExternal`); **nunca** listados em `dependencies` das Functions.

**Tech Stack:** TypeScript strict, Vitest, `pdfjs-dist` (exato; build `legacy` em Node para testes), `pdf-lib` (exato, só em testes, para gerar PDFs sintéticos).

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§6.1, §6.2, §6.9 upload)

## Global Constraints

- Nomes de tom canônicos: maiores `C C# D Eb E F F# G Ab A Bb B`; menores com sufixo `m` (`Cm C#m Dm Ebm Em Fm F#m Gm G#m Am Bbm Bm`). Entrada aceita sinônimos (`A#`→`Bb`, `Db`→`C#`, `D#`→`Eb`, `Gb`→`F#`, `G#`→`Ab` (só tons maiores), e os menores correspondentes, ex.: `Abm`→`G#m`).
- **Grafia** [decisão nossa, refina a §6.2 do spec]: tons com preferência por **bemol**: `F Bb Eb Ab` e menores `Dm Gm Cm Fm Bbm Ebm`; demais preferem **sustenido**. Cada nota (raiz e baixo) é nomeada pelo **grau em relação à tônica maior de referência** (para tom menor, a relativa maior): graus cromáticos ♭II, ♭III, ♭VI, ♭VII (deslocamentos 1, 3, 8, 10 semitons) usam a tabela de **bemóis**; os demais usam a tabela da preferência do tom. Tabelas: sustenidos `C C# D D# E F F# G G# A A# B`; bemóis `C Db D Eb E F Gb G Ab A Bb B`. (Ex.: em C, ♭VII = `Bb`; em E, `C#m`, `F#`.)
- Gramática de acorde: raiz `[A-G]`, acidente opcional `#`/`b` logo após a letra, qualidade composta de `maj|min|dim|aug|sus|add|m|M|[0-9]|/[0-9]|[°º+ø#b()\-]` (zero ou mais; `/` só vale dentro da qualidade se seguida de dígito: `E7/9`, `G6/9`, `F#m7/5-`), baixo opcional `/[A-G][#b]?` no fim; o token pode vir entre parênteses `(A9)` ou colchetes `[Am]`, `[Intro:Am`, `G]` (a pontuação é preservada na troca). Qualidade é preservada literalmente.
- Rótulos permitidos numa linha de acordes (acorde vence rótulo; `[Am]` é acorde): termina com `:` (`Intro:`), `[...]` que não seja acorde (`[Refrão]`), `\d+x`, `x\d+`, `(\d+x)`, `(`, `)`, `-`, `–`, `|`, `/`.
- Linha de acordes = **todos** os tokens em negrito do segmento são acordes ou rótulos e há ≥ 1 acorde. Texto não-negrito é ignorado.
- Páginas rotacionadas (`/Rotate`) não são suportadas: posições em espaço de usuário sem rotação.
- Segmentação: runs da mesma página com `|Δy| ≤ 1pt` formam uma linha; uma linha é quebrada em segmentos onde o espaço entre runs consecutivos é maior que **1/3 da largura da página**.
- Fragmentos adjacentes (espaço entre runs < 0,1 × tamanho da fonte, ambos em negrito) são unidos antes de tokenizar (`B`+`m`+`7` → `Bm7`).
- Posição de um token dentro de um run: `x = run.x + run.width × (índiceDoCaractere / run.text.length)` (exato em fonte monoespaçada; aproximação aceita em proporcional).
- Colisão: largura do acorde novo (via `measure`) + 1 caractere médio > espaço até o próximo token do mesmo segmento.
- Identificadores em inglês, comentários mínimos; versões exatas; TS strict; Conventional Commits + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add`/`git commit` separados.
- PDFs reais ficam só em `fixtures/private/` (ignorado pelo Git); CI usa PDFs sintéticos com letra inventada.

## Review Focus

1. **Palavra em maiúsculas que parece acorde** (“E”, “A” num título ou rótulo em negrito) — teste `ignores bold title even when it contains chord-like words` (Task 3).
2. **Acorde com baixo e qualidade complexa** (`Gm7/F`, `A#/D`, `C7(b9)`, `F#m7(b5)`, `D°`, `G7M`, `(A9)`) transposto sem perder a qualidade — testes da Task 2.
3. **Tom menor** (`Am` → `Cm`): seletor e grafia usam a relativa maior — teste `transposes minor key using relative major spelling` (Task 2).
4. **Acorde crescendo e encostando no vizinho** (`E` → `F#m7` em espaço curto) — teste `flags collision when new chord overflows the gap` (Task 3).
5. **PDF sem indicador de tom e título fora do padrão** (“João 20 + Pra Sempre – Josué Freitas”, sem `Tom:`) — teste de metadados `infers key from chords when no indicator` e o teste de fixtures reais (Task 5).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/chords/src/keys.ts` | `KeyName`, `parseKey`, `KEY_OPTIONS`, `prefersFlats`, `relativeMajor` |
| `packages/chords/src/notes.ts` | `pitchClass`, `noteName(pc, key)` (regra de grafia) |
| `packages/chords/src/chord.ts` | `parseChord`, `formatChord`, `transposeChord`, `semitonesBetween` |
| `packages/chords/src/lines.ts` | Modelo `TextRun`/`TextLine`, `segmentLine`, `tokenizeSegment`, `classifySegment`, `isLabel` |
| `packages/chords/src/keyIndicator.ts` | `findKeyIndicator` |
| `packages/chords/src/plan.ts` | `buildTransposePlan` |
| `packages/chords/src/metadata.ts` | `normalizeText`, `suggestMetadata` |
| `packages/chords/src/index.ts` | Exports públicos |
| `packages/pdf/src/readTextLines.ts` | `readTextLines(bytes): Promise<TextLine[]>` (pdfjs) |
| `packages/pdf/test/synthetic.ts` | `buildSyntheticPdf(spec)` com pdf-lib (só testes) |
| `tests/config/workspace-deps.test.ts` | Garante que `apps/functions` não declara `@cifras/*` |

---

### Task 1: Pacote `@cifras/chords`, empacotamento e tons

**Files:**
- Create: `packages/chords/{package.json,tsconfig.json,vitest.config.mts}`, `packages/chords/src/{index.ts,keys.ts,notes.ts}`, `tests/config/workspace-deps.test.ts`
- Modify: `docker/dev.Dockerfile` (COPY `packages/chords/package.json` e `packages/pdf/package.json` — criar placeholder do segundo só na Task 5; nesta task apenas `chords`), `docker-compose.yml` (volume do cache do emulador movido para o anchor `x-dev`; volume anônimo `/app/packages/chords/node_modules` no anchor; remover a lista duplicada de volumes do serviço `emulators`)
- Test: `packages/chords/src/keys.test.ts`, `packages/chords/src/notes.test.ts`

**Interfaces:**
- Produces: workspace `@cifras/chords` com `"main": "src/index.ts"`, `"types": "src/index.ts"`, scripts `test`, `typecheck`.
  - `type KeyName = string` canônico (ex.: `'Bb'`, `'F#m'`); `interface Key { tonicPc: number; minor: boolean; name: KeyName }`.
  - `parseKey(input: string): Key | null` — aceita sinônimos e espaços; `'A#'` → `{ name: 'Bb' }`; `'Dbm'` → `'C#m'`; inválido → `null`.
  - `KEY_OPTIONS: { major: KeyName[]; minor: KeyName[] }` (ordem das Global Constraints).
  - `relativeMajorPc(key: Key): number`; `prefersFlats(key: Key): boolean`.
  - `pitchClass(letter: string, accidental: '' | '#' | 'b'): number`; `noteName(pc: number, key: Key): string`.

- [ ] **Step 1: Testes que falham.**
  - `parses canonical and synonym keys` — `parseKey('A#').name === 'Bb'`, `parseKey('D#m').name === 'Ebm'`, `parseKey(' g ')?.name === 'G'`, `parseKey('H') === null`.
  - `lists key options` — `KEY_OPTIONS.major` igual à lista das Global Constraints; `KEY_OPTIONS.minor[0] === 'Cm'`.
  - `prefers flats only for flat keys` — `F Bb Eb Ab Dm Gm Cm Fm Bbm Ebm` → true; `C G D A E B F# C# Am Em` → false.
  - `names notes by degree` (pc: C=0, C#=1, …, B=11) — em `C`: 10 → `Bb`, 3 → `Eb`, 6 → `F#`; em `E`: 1 → `C#`, 6 → `F#`, 8 → `G#`, 10 → `A#`, 0 → `C`; em `Bb`: 3 → `Eb`, 10 → `Bb`; em `Am` (relativa C): 10 → `Bb`; em `F#`: 5 → `F`; em `C#`: 2 (♭II) → `D`.
  - `workspace-deps.test.ts`: `functions does not declare workspace packages as dependencies` (nenhuma chave `@cifras/*` em `dependencies`/`devDependencies` de `apps/functions/package.json`).
- [ ] **Step 2:** `npm test -w @cifras/chords` e `npm test -w @cifras/tests` → FAIL.
- [ ] **Step 3:** Implementar; ajustar Dockerfile/compose; `npm install` para registrar o workspace.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check` → verde; `docker compose config` sem erros.
- [ ] **Step 5: Commit** — `feat(chords): add chords package with keys and degree-based note spelling`.

---

### Task 2: Acordes e transposição

**Files:**
- Create: `packages/chords/src/chord.ts`; Test: `packages/chords/src/chord.test.ts`

**Interfaces:**
- Consumes: `Key`, `parseKey`, `pitchClass`, `noteName` (Task 1).
- Produces:
  - `interface Chord { rootPc: number; quality: string; bassPc: number | null; wrapped: boolean; raw: string }`.
  - `parseChord(token: string): Chord | null`.
  - `semitonesBetween(from: Key, to: Key): number` (0–11; tons de modos diferentes → erro).
  - `transposeChord(chord: Chord, semitones: number, target: Key): string` — formata raiz/baixo com `noteName(…, target)`, preserva `quality` e parênteses.

- [ ] **Step 1: Testes que falham.**
  - `parses chords with quality and bass` — `'Gm7/F'`, `'A#/D'`, `'C7(b9)'`, `'F#m7(b5)'`, `'D°'`, `'G7M'`, `'Dm7'`, `'A9'`, `'Bb'`, `'E4'`, `'(A9)'` → não nulos; `quality` de `'C7(b9)'` = `'7(b9)'`; `bassPc` de `'A#/D'` = 2.
  - `rejects non chords` — `'Intro:'`, `'Senhor'`, `'2x'`, `'H7'`, `'Am7/X'`, `''` → `null`.
  - `transposes the sample from Bb to D` — tokens do PDF de exemplo `A# F/A Gm Gm7/F D# A#/D Cm D#9 F/D# Dm7 D#/G` com +4 semitons, alvo `D` → `D A/C# Bm Bm7/A G D/F# Em G9 A/G F#m7 G/B`.
  - `uses flats for flat target` — `'C'` de `C` para `Bb` (−2 → 10): `'Bb'`; `'G7'` → `'F7'`; `'A#m'` de `C` para `F` → `'Ebm'`.
  - `uses flat names for chromatic degrees in sharp keys` — em alvo `C`, pc 10 → `'Bb'`; em alvo `G`, pc 3 (♭VI de G = Eb) → `'Eb'`.
  - `transposes minor key using relative major spelling` — `'Am'`,`'G'`,`'F'`,`'E7'` de `Am` para `Cm` → `'Cm'`,`'Bb'`,`'Ab'`,`'G7'`.
  - `keeps parentheses` — `'(A9)'` de `A` para `B` → `'(B9)'`.
  - `semitonesBetween throws on mixed modes` — `C`→`Am` lança.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** testes, lint, typecheck, format → verde.
- [ ] **Step 5: Commit** — `feat(chords): parse and transpose chords preserving quality and bass`.

---

### Task 3: Linhas, indicador de tom e TransposePlan

**Files:**
- Create: `packages/chords/src/{lines.ts,keyIndicator.ts,plan.ts}`; Test: `lines.test.ts`, `keyIndicator.test.ts`, `plan.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `interface TextRun { text: string; x: number; y: number; width: number; fontSize: number; fontName: string; bold: boolean }`; `interface TextLine { page: number; y: number; pageWidth: number; runs: TextRun[] }` (runs ordenados por `x`).
  - `segmentLine(line: TextLine): TextRun[][]`; `mergeFragments(runs: TextRun[]): TextRun[]`.
  - `interface Token { text: string; x: number; width: number; run: TextRun }`; `tokenizeSegment(runs: TextRun[]): Token[]` (só runs em negrito; x por proporção do índice do caractere).
  - `isLabel(token: string): boolean`; `classifySegment(tokens: Token[]): 'chords' | 'other'`.
  - `interface KeyIndicator { page: number; y: number; kind: 'title' | 'tom'; token: Token; key: Key }`; `findKeyIndicator(lines: TextLine[]): KeyIndicator | null` — `(X)` no fim do texto de um run (qualquer peso) ou `Tom:` seguido do tom no mesmo segmento (o tom pode estar em outro run, qualquer peso); primeiro encontrado em ordem de página/linha.
  - `type Measure = (text: string, fontName: string, fontSize: number) => number`.
  - `interface Replacement { page: number; x: number; y: number; width: number; fontSize: number; fontName: string; original: string; replacement: string; newWidth: number; collides: boolean }`.
  - `interface TransposePlan { from: Key; to: Key; chords: Replacement[]; keyIndicator: Replacement | null; chordCount: number; collisions: number }`.
  - `buildTransposePlan(input: { lines: TextLine[]; from: Key; to: Key; measure: Measure }): TransposePlan` — `from === to` → plano sem trocas (chords vazio) mas `chordCount` preenchido.

- [ ] **Step 1: Testes que falham** (construir `TextLine`s à mão; `measure` mono = `text.length × 0.6 × fontSize`).
  - `merges adjacent bold fragments` (`B`,`m`,`7` colados → `Bm7`).
  - `splits a line into segments at large gaps` (gap > pageWidth/3).
  - `tokenizes multi-chord run with positions` (`'Intro: A# F/A'` em x=28, largura mono → `A#` em x = 28 + 7×6).
  - `classifies chord lines with labels` (`Intro:`, `[Refrão]`, `2x`, `(2x)`, `|`) → `chords`; `ignores bold title even when it contains chord-like words` (`MEU PRAZER E` → `other`); segmento só com rótulos → `other`.
  - `finds key in title parentheses` e `finds Tom: indicator in separate run`; `returns null without indicator`.
  - `plans replacements at original positions` (Bb→D na linha do exemplo: `x` preservado, `replacement` correto, `chordCount`).
  - `flags collision when new chord overflows the gap` (`E` → `F#m7` com vizinho a 3 caracteres) e `collisions` conta.
  - `replaces key indicator` (`(Bb)` → `(D)`, `Tom: E` → `Tom: F#`: só o token do tom é trocado).
  - `same key yields no replacements`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(chords): detect chord lines and build transpose plans`.

---

### Task 4: Normalização e sugestões de metadados

**Files:**
- Create: `packages/chords/src/metadata.ts`; Test: `metadata.test.ts`

**Interfaces:**
- Consumes: `parseKey`, `KeyIndicator`, `TextLine`, `classifySegment` etc.
- Produces:
  - `normalizeText(s: string): string` — minúsculas, sem acentos (NFD), pontuação → espaço, espaços colapsados, `trim`.
  - `interface MetadataSuggestion { title: string; artist: string; key: KeyName | null; keySource: 'indicator' | 'filename' | 'chords' | null; swapped: boolean }`.
  - `suggestMetadata(input: { lines: TextLine[]; fileName: string; knownArtists: string[]; indicator: KeyIndicator | null; firstChord: string | null; lastChord: string | null }): MetadataSuggestion`.
  - Regras: título = texto do primeiro segmento não-acorde em negrito da 1ª página (ou o maior `fontSize`), sem o `(X)` final; se vazio, usa o nome do arquivo sem extensão nem sufixos `-2`/` - G`. Separadores de cantor (primeira ocorrência): ` - `, ` – `, ` | ` (com espaços). Lado direito = cantor por padrão; se o lado esquerdo casar (normalizado) com um cantor conhecido e o direito não, inverte (`swapped: true`). `+` não separa (medley). Tom: indicador → nome do arquivo (`/[\s_-]([A-G][#b]?m?)(?:-\d+)?\.pdf$/i`) → acordes (último acorde, senão primeiro; tônica do acorde, modo pela qualidade `m` não seguido de `aj`).

- [ ] **Step 1: Testes que falham.**
  - `normalizes text` — `'  Sonda-me,   Usá-me! '` → `'sonda me usa me'`.
  - `splits title and artist` — `'Sonda-me, Usa-me - Aline Barros (Bb)'` → título `Sonda-me, Usa-me`, cantor `Aline Barros`, tom `Bb` (indicator).
  - `swaps when left side is a known artist` — `'Gabriela Rocha - Agnus Dei'` com `knownArtists: ['Gabriela Rocha']` → título `Agnus Dei`, `swapped: true`.
  - `keeps medley plus in title` — `'DEUS DOS DEUSES + HÁ UMA SAÍDA | DAMARIS ANDRADE'` → título com `+`, cantor `DAMARIS ANDRADE`.
  - `uses en dash separator` — `'João 20 + Pra Sempre – Josué Freitas'`.
  - `reads key from filename` — `'Renova-me - G.pdf'` sem indicador → `G`, `keySource: 'filename'`; `'MEU PRAZER E-3.pdf'` → `E`.
  - `infers key from chords when no indicator` — último acorde `Em` → `Em`, `keySource: 'chords'`.
  - `falls back to file name when no title`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(chords): suggest title, artist and key from pdf text`.

---

### Task 5: Pacote `@cifras/pdf` (leitura com pdf.js) e fixtures

**Files:**
- Create: `packages/pdf/{package.json,tsconfig.json,vitest.config.mts}`, `packages/pdf/src/{index.ts,readTextLines.ts}`, `packages/pdf/test/{synthetic.ts,readTextLines.test.ts,realFixtures.test.ts}`
- Modify: `docker/dev.Dockerfile` (COPY `packages/pdf/package.json`), `docker-compose.yml` (volume `/app/packages/pdf/node_modules` no anchor)

**Interfaces:**
- Consumes: `TextLine`, `TextRun`, `buildTransposePlan`, `findKeyIndicator`, `parseKey` de `@cifras/chords`.
- Produces: `readTextLines(data: Uint8Array): Promise<TextLine[]>` — para cada página: `getTextContent()`, nome real da fonte via `page.commonObjs` após `getOperatorList()` (remove prefixo de subset `ABCDEF+`), `bold = /bold|black|heavy/i.test(nomeReal)`, `fontSize = |transform[0]|` (ou hipotenusa de `[0],[1]`), `x = transform[4]`, `y = transform[5]`, ignora itens vazios; agrupa em linhas (`|Δy| ≤ 1`), ordena runs por `x`, `pageWidth` do viewport. Em Node usa `pdfjs-dist/legacy/build/pdf.mjs`; o pacote exporta uma função `configurePdfWorker(src: string)` para o navegador (Fase 4).

- [ ] **Step 1: Testes que falham.**
  - `synthetic.ts`: `buildSyntheticPdf({ title, keyStyle: 'paren' | 'tom' | 'none', chordFont: 'CourierBold' | 'HelveticaBold', lyricFont, lines: Array<{ chords?: Array<[x: number, chord: string]>; lyric?: string }>, twoColumns?: boolean, splitChord?: string }): Promise<Uint8Array>` com letra inventada.
  - `reads runs with bold detection and positions` (Courier-Bold → `bold: true`; Courier → false; x e fontSize corretos ±0,5).
  - `end to end: synthetic mono pdf transposes Bb to D` (plano com trocas esperadas e indicador `(Bb)`).
  - `end to end: proportional font with Tom indicator` (HelveticaBold, `Tom: E` → `F#`).
  - `merges split chord fragments from pdf` (`splitChord: 'Bm7'` desenhado em 3 pedaços).
  - `realFixtures.test.ts` — **pula** (`describe.skipIf`) quando `fixtures/private/` não existe ou está vazio. Para cada PDF: `chordCount > 0`, todos os `original` de `plan.chords` passam em `parseChord`, nenhum `original` vem de linha cujo texto contém letras minúsculas fora de qualidade de acorde; indicador esperado: `Sonda-me…-2.pdf` → `Bb` (title), `DEUS DOS DEUSES…` → `B` (tom), `Gabriela Rocha - Agnus Dei` → `F`, `O Medo Não Vai Me Parar` → `C`, `Renova-me - G` → `G`, `MEU PRAZER E-3` → `E`, `Espírito…` e `João 20` → `null`. Imprimir (no relatório, não no teste) a contagem de acordes por arquivo.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** `npm test` (inclui fixtures reais localmente), lint, typecheck, format, build → verde; `docker compose build` sem erro.
- [ ] **Step 5: Commit** — `feat(pdf): read pdf text lines with pdfjs and validate on fixtures`.

---

### Task 6: PR, revisão e merge (orquestrador)

- [ ] Checks completos locais (inclui fixtures reais) e CI verde (sem fixtures).
- [ ] Revisão final (code-reviewer) → correções → comentário no PR → `gh pr merge <n> --squash`.
