# Fase 5 — Visualizador e Mudar tom: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abrir qualquer cifra no visualizador (PDF renderizado no navegador, tons salvos como atalhos, baixar PDF) e, para membros/admins, **Mudar tom** com prévia instantânea dos acordes trocados sobre o próprio PDF, avisos de colisão/acordes suspeitos e geração do novo PDF (sobreposição) salvo como tom `generated` — abrindo-o em seguida. Visitantes só veem e trocam entre tons salvos.

**Architecture:** Novo pacote `@cifras/overlay` (puro TS + `pdf-lib` + `@pdf-lib/fontkit`): escolhe a fonte substituta, mede texto com as métricas reais dela, gera **operações de desenho** (retângulo branco + texto) a partir do `TransposePlan` e escreve o PDF (`OverlayWriter`); `RewriteWriter` é só esqueleto atrás de flag. O site usa as **mesmas operações** para desenhar a prévia num canvas sobre a página renderizada pelo pdf.js — o que se vê é o que se salva. Bytes do PDF via `getBlob` (sem URL pública). A transposição parte sempre de um tom **feito à mão**.

**Tech Stack:** pdf.js 6.5.x (legacy, worker), pdf-lib 1.17.1, @pdf-lib/fontkit (exato), fontes livres TTF commitadas (Liberation Mono/Sans — SIL OFL 1.1; Roboto/Roboto Mono — Apache 2.0/OFL) com licenças, React 19, Firebase JS SDK 13.3.0.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§5.1 A/B, §6.3, §6.4, §6.9 Mudar tom, §6.10 telas 2a–2d, §6.11)

## Global Constraints

- **Fonte de origem da transposição** [decidido]: o tom aberto se for `handmade`; senão o `derivedFromKey` dele, se ainda existir e for `handmade`; senão o primeiro `handmade` (ordem `compareKeys`). Sem `handmade` → "Mudar tom" desabilitado com `Não há PDF feito à mão para transpor.`
- **Escolha da fonte substituta** a partir do nome da fonte original + `bold`: contém `Courier` → Liberation Mono (Bold/Regular); `Roboto Mono`/`RobotoMono` → Roboto Mono; `Roboto` → Roboto; `Arial`/`Helvetica`/`Liberation Sans`/`Verdana` → Liberation Sans; desconhecida → Liberation Sans. Variante regular quando `bold` é falso.
- **Operações de sobreposição** (por `Replacement`, incluindo o indicador de tom): retângulo branco `x - pad`, `y + descent × fontSize - pad`, largura `max(width, newWidth) + 2·pad`, altura `(ascent - descent) × fontSize + 2·pad`, `pad = 0.04 × fontSize`; texto `replacement` em `(x, y)` (baseline) no `fontSize` original, cor preta. Coordenadas no espaço do usuário do PDF (origem embaixo-esquerda).
- `measure` do plano = largura real na fonte substituta (`font.widthOfTextAtSize`) — a mesma usada na prévia e no PDF.
- **Prévia**: mesmas operações desenhadas num canvas sobre cada página; acordes alterados com fundo amarelo `#fff1a8` (só na prévia); colisões com fundo `#ffd5d5` + contorno `#e5484d`. Troca de tom na prévia **não** re-renderiza a página (só a camada).
- **Salvar tom gerado**: upload (`uploadedBy`) em `songs/{songId}/{slug}-{fileId}.pdf` → `create` de `arrangements/{slug}` com `source: 'generated'`, `writer: 'overlay'`, `derivedFromKey: <tom de origem>`, `chordCount`, `collisions`; conflito (já existe) → descartar o arquivo (`discardUpload`) e abrir o existente; outra falha → descartar e mostrar erro.
- **Regras**: criar `generated` exige que `arrangements/{slug(derivedFromKey)}` exista, seja `handmade`, e tenha o **mesmo modo** (ambos maiores ou ambos menores).
- **Tela** (mockups 2a–2d): celular — barra inferior fixa com `⬇ PDF` e `♪ Mudar tom` (só membro/admin); painel que sobe de baixo; ≥ 900 px de largura — painel lateral fixo à direita. Painel: título `Mudar tom · original <K>`, legenda `▢ salvo`, grade 6×2 (celular) / 4×3 (lateral) com os 12 tons do modo, tons salvos com contorno verde, selecionado em `--color-accent`, `−½` / `+½`, `Cancelar` / `Confirmar <K>` (ou `Abrir <K>` quando já salvo). Avisos: `⚠ <n> acorde(s) pode(m) encostar no vizinho (em vermelho)`; suspeitos: `Confira: não reconhecemos <tokens> como acorde.`
- PDF sempre por `getBlob` + `URL.createObjectURL`; baixar com nome `<título> - <cantor> (<tom>).pdf`.
- `VITE_CHORD_WRITER=overlay|rewrite` (padrão `overlay`); `rewrite` mostra `Modo de reescrita ainda não disponível.` e não salva.
- Limitação conhecida (documentar na tela de ajuda/README): o texto antigo fica escondido sob o novo (copiar texto do PDF traz o acorde antigo).
- UI pt-BR; identificadores em inglês; versões exatas; TS strict; Conventional Commits + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add`/`git commit` separados.

## Review Focus

1. **Acorde novo mais largo que o antigo** → retângulo cobre o maior dos dois — teste `rect covers the wider of old and new text` (Task 2).
2. **Prévia diferente do PDF salvo** → mesmas operações; teste que gera o PDF, relê com `readTextLines` e confere texto/posição iguais às operações (Task 2).
3. **Abrir/gerar a partir de um tom gerado** → sempre volta ao feito à mão — testes de `pickTransposeSource` (Task 3).
4. **Dois membros gerando o mesmo tom** → o segundo abre o existente e o arquivo dele é descartado — teste `opens existing key on conflict and discards upload` (Task 3).
5. **Fonte desconhecida/regular no indicador de tom** (`Tom: E` em Arial regular) → variante regular — teste em `chooseFont` (Task 2).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `firestore.rules`, `tests/rules/*` | Regra de `generated` |
| `apps/functions/src/songs/replaceArrangement.ts` | Exigir `uploadedBy` do arquivo novo + checagem pós-transação |
| `packages/overlay/fonts/*.ttf`, `fonts/LICENSES/*` | Fontes substitutas e licenças |
| `packages/overlay/src/{fonts.ts,measure.ts,ops.ts,overlayWriter.ts,rewriteWriter.ts,index.ts}` | Escolha de fonte, medida, operações, escrita |
| `apps/web/src/catalog/SongsProvider.tsx` | Assinatura única de `songs` |
| `apps/web/src/viewer/{transposeSource.ts,loadFonts.ts,useSongArrangements.ts,saveGenerated.ts}` | Regras de negócio do visualizador |
| `apps/web/src/viewer/{ViewerRoute.tsx,PdfPages.tsx,PreviewLayer.tsx,KeyPanel.tsx,ViewerPage.tsx}` | Telas (rota lazy) |

---

### Task 1: Regras e endurecimento das Functions (backend-dev)

**Files:** Modify `firestore.rules`, `tests/rules/firestore.rules.test.ts`, `apps/functions/src/songs/replaceArrangement.ts` (+ test), `apps/functions/src/index.ts`

**Interfaces:**
- Produces: regra de `generated` (Global Constraints); `ReplaceDeps.getFileOwner(path): Promise<string | null>` — `replaceArrangement` rejeita (`permission-denied`) quando o dono do arquivo novo ≠ chamador; após a transação, confere `fileExists(storagePath)` e só loga se sumiu.
- [ ] **Step 1:** Testes que falham: regras — `allows generated derived from an existing handmade of the same mode`, `denies generated derived from a generated key`, `denies generated derived from a missing key`, `denies generated with a different mode`; functions — `rejects replacing with someone else's file`, `logs when the new file vanished after the transaction`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (no índice, `getFileOwner` lê `metadata.metadata.uploadedBy` do arquivo). **Step 4:** `npm run test:rules`, `npm test`, lint, typecheck, build → verde.
- [ ] **Step 5: Commit** — `feat(rules): require handmade source of same mode for generated keys`.

---

### Task 2: Pacote `@cifras/overlay` (backend-dev)

**Files:**
- Create: `packages/overlay/{package.json,tsconfig.json,vitest.config.mts}`, `packages/overlay/fonts/` (TTFs: LiberationMono-Bold/Regular, LiberationSans-Bold/Regular, Roboto-Bold/Regular, RobotoMono-Bold/Regular) + `fonts/LICENSES/` (texto integral de cada licença) + `fonts/README.md` (origem e versão de cada arquivo), `packages/overlay/src/*`, `packages/overlay/test/*`
- Modify: `docker/dev.Dockerfile` (COPY manifest), `docker-compose.yml` (volume node_modules), `tests/config/workspace-deps.test.ts` (se checar manifests)

**Interfaces:**
- Consumes: `TransposePlan`, `Replacement` (`@cifras/chords`); `readTextLines` (`@cifras/pdf`, só nos testes).
- Produces:
  - `type FontId = 'mono-bold' | 'mono-regular' | 'sans-bold' | 'sans-regular' | 'roboto-bold' | 'roboto-regular' | 'robotomono-bold' | 'robotomono-regular'`; `chooseFont(fontName: string, bold: boolean): FontId`; `FONT_FILES: Record<FontId, string>` (nome do arquivo).
  - `type FontBytesLoader = (id: FontId) => Promise<Uint8Array>`.
  - `createMeasure(fonts: LoadedFonts): Measure` — `LoadedFonts = Map<FontId, fontkit Font>`; `measure(text, fontName, fontSize)` usa `chooseFont(fontName, /bold|black|heavy/i)`. (O `Replacement` já traz `bold`; a medida do plano usa o nome.)
  - `interface OverlayOp { page: number; rect: { x: number; y: number; width: number; height: number }; text: { value: string; x: number; y: number; fontId: FontId; fontSize: number }; kind: 'chord' | 'key'; collides: boolean }`; `overlayOps(plan: TransposePlan): OverlayOp[]` (regras das Global Constraints).
  - `interface ChordWriter { write(pdfBytes: Uint8Array, plan: TransposePlan): Promise<Uint8Array> }`; `createOverlayWriter(loadFont: FontBytesLoader): ChordWriter` (pdf-lib + fontkit, `embedFont(bytes, { subset: true })`, cor `rgb(1,1,1)` para o retângulo e `rgb(0,0,0)` para o texto); `createRewriteWriter(): ChordWriter` lança `Error('Modo de reescrita ainda não disponível.')`.
- [ ] **Step 1:** Testes que falham: `chooses substitute fonts by family and weight` (Courier New Bold → mono-bold; `Roboto Mono,Bold` → robotomono-bold; `Arial-BoldMT` → sans-bold; `ArialMT` → sans-regular; `Verdana-Bold` → sans-bold; `XYZ` → sans-regular/bold); `measures with real font metrics` (Liberation Mono: 3 chars a 10pt = 18 ± 0,01); `rect covers the wider of old and new text`; `rect height uses ascent and descent`; `emits ops for key indicator`; `round-trip: written pdf contains new chords at the planned positions` (PDF sintético → plano Bb→D → `write` → `readTextLines` acha `D`, `A/C#`… em x ± 0,5 com as fontes substitutas); `rewrite writer is not available`; real fixtures (pula sem a pasta): gera `fixtures/private/out/<arquivo> → D.pdf` para os 8 PDFs (para inspeção visual do controlador) e confere round-trip de contagem de acordes.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar; obter TTFs de fontes oficiais (releases do liberation-fonts no GitHub; Google Fonts/repo oficial Roboto e Roboto Mono), registrar URL+versão em `fonts/README.md`. **Step 4:** `npm test`, lint, typecheck, format, `docker compose build` → verde.
- [ ] **Step 5: Commit** — `feat(overlay): repaint transposed chords with matching substitute fonts`.

---

### Task 3: Dados do visualizador (frontend-dev)

**Files:**
- Create: `apps/web/src/catalog/SongsProvider.tsx`, `apps/web/src/viewer/{transposeSource.ts,useSongArrangements.ts,saveGenerated.ts,loadFonts.ts,fileName.ts}` (+ testes)
- Modify: `apps/web/src/catalog/catalogApi.ts` (`getPdfBytes(path): Promise<Uint8Array>` via `getBlob`; `createGeneratedArrangement(songId, input)`), `App.tsx` (SongsProvider no topo; Home/Cantor usam o contexto)

**Interfaces:**
- Consumes: `CatalogApi` (subscribeArrangements, uploadPdf, deleteFile/discardUpload, getArrangement), `keySlug`, `compareKeys`, `parseKey`, `FONT_FILES`/`FontId`.
- Produces:
  - `SongsProvider` + `useSongsContext()` (mesmo formato de `useSongs`, uma assinatura só).
  - `ArrangementView = { key: KeyName; slug: string; source: 'handmade' | 'generated'; storagePath: string; derivedFromKey: KeyName | null; collisions: number }`; `useSongArrangements(api, songId | null)` (assina só quando há `songId` de música existente) → `{ status; arrangements: ArrangementView[] }` ordenados.
  - `pickTransposeSource(arrangements, openKey: KeyName | null): ArrangementView | null` (regra das Global Constraints).
  - `saveGenerated(api, input: { songId; key; bytes: Uint8Array; derivedFromKey; chordCount; collisions; uid }): Promise<{ key: KeyName; status: 'created' | 'existing' }>` — upload; `create`; em `ArrangementExistsError`/permission-denied com arrangement existente → `discardUpload` e `status: 'existing'`; outro erro → `discardUpload` e relança.
  - `loadFontBytes(id: FontId): Promise<Uint8Array>` — `import(...?url)` dos TTFs + `fetch`, com cache em memória.
  - `pdfFileName(title, artist, key)` → `"<título> - <cantor> (<tom>).pdf"` sem caracteres inválidos (`\/:*?"<>|`).
- [ ] **Step 1:** Testes que falham: `pickTransposeSource` (aberto handmade; aberto generated → derivedFrom; derivedFrom ausente → primeiro handmade; nenhum handmade → null); `saveGenerated creates generated arrangement`; `opens existing key on conflict and discards upload`; `discards upload and rethrows on other failures`; `useSongArrangements does not subscribe without song`; `SongsProvider shares one subscription` (dois consumidores → 1 chamada); `pdfFileName sanitizes`; `getPdfBytes uses getBlob` (mock).
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde.
- [ ] **Step 5: Commit** — `feat(web): viewer data with shared songs, transpose source and generated saves`.

---

### Task 4: Visualizador (frontend-dev)

**Files:**
- Create: `apps/web/src/viewer/{ViewerRoute.tsx,ViewerPage.tsx,PdfPages.tsx,PreviewLayer.tsx}` (+ testes); Modify `App.tsx` (rota `/musicas/:songId` → `ViewerRoute` lazy com ErrorBoundary; remove `search/SongPage.tsx` e testes)

**Interfaces:**
- Consumes: Task 3; `getPdfjs`, `readTextLinesFromDocument` (`@cifras/pdf`); `overlayOps`, `createMeasure` (`@cifras/overlay`); `buildTransposePlan`, `findKeyIndicator`, `semitonesBetween`.
- Produces:
  - `PdfPages({ doc, overlays })` — renderiza cada página do `PDFDocumentProxy` num canvas ajustado à largura do contêiner (`devicePixelRatio`, re-render em resize com debounce), com uma camada `PreviewLayer` por página.
  - `PreviewLayer({ page, viewport, ops, highlight })` — desenha os `OverlayOp` da página convertendo coordenadas PDF → canvas (`viewport.convertToViewportPoint`), retângulo branco, texto com `FontFace` carregada dos mesmos TTFs; com `highlight`, fundo amarelo nos trocados e vermelho nas colisões.
  - `ViewerPage({ api, songId, tomSlug })` (mockups 2a/2b/2d): cabeçalho `‹ <título>` + cantor; chips dos tons salvos (selecionado = `?tom` ou primeiro handmade; troca com `replace`); `Carregando cifra…`; PDF do tom aberto renderizado; `⬇ PDF` (download com `pdfFileName`); estados `Música não encontrada.` / `Não foi possível abrir o PDF.`
- [ ] **Step 1:** Testes que falham (pdf.js e canvas mockados — `PdfPages` recebe um `doc` falso; `PreviewLayer` testado via função pura `toCanvasOps(ops, viewport)`): `renders saved key chips and selects the query key`; `defaults to first handmade key`; `downloads with a friendly file name`; `shows not found for unknown song`; `toCanvasOps converts pdf coordinates to canvas`; `highlights changed and colliding chords only in preview`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (pdf.js só no chunk lazy; `PDFDocumentProxy` aberto com `fontExtraProperties: true`; reutiliza o mesmo `doc` para renderizar e para `readTextLinesFromDocument`). **Step 4:** verde; build: pdf.js e fontes fora do chunk principal.
- [ ] **Step 5: Commit** — `feat(web): render chord pdfs in the viewer`.

---

### Task 5: Mudar tom (frontend-dev)

**Files:** Create `apps/web/src/viewer/{KeyPanel.tsx,useTranspose.ts}` (+ testes); Modify `ViewerPage.tsx`, `styles.css`

**Interfaces:**
- Consumes: Tasks 3–4; `KEY_OPTIONS`, `parseKey`, `semitonesBetween`, `buildTransposePlan`, `createMeasure`, `overlayOps`, `createOverlayWriter`/`createRewriteWriter`, `saveGenerated`, `useAuth`/`canEdit`.
- Produces:
  - `useTranspose({ sourceLines, sourceKey, fonts })` → `{ target, setTarget, plan, ops, collisions, suspects }` (plano recalculado em memória a cada tom; < 100 ms).
  - `KeyPanel({ sourceKey, savedKeys, target, onTarget, onCancel, onConfirm, collisions, suspects, busy, layout: 'sheet' | 'side' })` (Global Constraints, mockups 2c/2d).
  - Fluxo: `♪ Mudar tom` abre o painel e carrega o tom de origem (`pickTransposeSource`) se diferente do aberto (mostra `Preparando…`); tocar num tom → prévia sobre a página (se o tom de origem é o exibido) — quando o aberto é `generated`, o visualizador passa a exibir o de origem durante a prévia; tom já salvo → botão `Abrir <K>` (navega); `Confirmar <K>` → `Gerando PDF…` → `saveGenerated` → navega para `?tom=<slug>`; `status: 'existing'` → abre o existente com aviso `Esse tom já tinha sido salvo. Abrimos o existente.`; erro → `Não foi possível gerar o PDF. Tente de novo.`; `Cancelar` volta ao tom aberto sem prévia. Visitante não vê o botão. `rewrite` → mensagem de indisponível.
- [ ] **Step 1:** Testes que falham: `visitor does not see Mudar tom`; `opens panel with source key title`; `selecting a key shows preview with changed chords`; `saved key shows Abrir and navigates`; `confirm generates, saves and navigates`; `shows existing notice on conflict`; `shows collision warning`; `shows suspect warning`; `semitone buttons step the target`; `minor song shows minor keys`; `disabled when there is no handmade source`; `rewrite mode shows unavailable message`.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** verde; medir no teste que trocar de tom recalcula plano+ops sem re-render da página.
- [ ] **Step 5: Commit** — `feat(web): change key with instant preview and generated pdf`.

---

### Task 6: Smoke, verificação visual e PR (qa + orquestrador)

- [ ] **Step 1 (qa):** estender `scripts/smoke/upload.mjs`: criar `generated` a partir de handmade (OK), a partir de `generated` (403), de modo diferente (403); `replaceArrangement` com arquivo de outro usuário (PERMISSION_DENIED). Docker up → `npm run smoke:upload` → `OK` → down. Commit `test(smoke): cover generated keys and foreign files`.
- [ ] **Step 2 (orquestrador):** inspecionar visualmente os PDFs gerados em `fixtures/private/out/` (acordes alinhados, fonte compatível, nada além dos acordes/tom alterado).
- [ ] **Step 3 (orquestrador):** checks completos, PR para `develop`, CI verde, revisão final (code-reviewer), correções, comentário, merge.
