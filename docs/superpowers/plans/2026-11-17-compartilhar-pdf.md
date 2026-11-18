# Compartilhar PDF no visualizador — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Compartilhar" no visualizador que abre o compartilhamento nativo (WhatsApp etc.) com o PDF do tom exibido anexado.

**Architecture:** Um helper puro em `apps/web/src/viewer/sharePdf.ts` envolve a Web Share API (detecção, criação do `File`, tratamento de cancelamento). `ViewerPage` detecta suporte uma vez, esconde o botão sem suporte e, ao tocar, chama o helper com os bytes que já estão em memória (`current.bytes`), sem `await` antes do `share()` (exigência do iOS).

**Tech Stack:** React 19 + TypeScript strict, Vitest + Testing Library (jsdom), CSS em `apps/web/src/ui/styles.css`.

**Spec:** [docs/superpowers/specs/2026-11-17-compartilhar-pdf-design.md](../specs/2026-11-17-compartilhar-pdf-design.md)

## Global Constraints

- Texto de UI em pt-BR; identificadores de código em inglês.
- Nome do arquivo: `pdfFileName(song.title, song.artistName, displayed.key)` (mesmo do download).
- Tipo do arquivo: `application/pdf`.
- Botão escondido (não renderizado) quando o navegador não compartilha arquivo; nenhum fallback de download.
- Mesmos papéis do download: nenhum `canEdit`/`isAdmin` no botão.
- Nada novo é carregado: usar `current.bytes`; sem `await` antes de `navigator.share`.
- Conventional Commits em inglês, com o trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Implementação por subagente: `model: "sonnet"`, `effort: "medium"` (agente `frontend-dev`).
- Nunca commitar em `develop`/`main`; branch atual: `feat/share-pdf`.

## Review Focus

1. Toque duplo enquanto a folha de compartilhar está aberta: o navegador rejeita (`InvalidStateError`); o botão fica desabilitado durante o envio.
2. Usuário fecha a folha sem enviar (`AbortError`): silêncio, sem aviso, botão volta ao normal.
3. Navegador com `navigator.share` mas sem suporte a arquivos (`canShare({files})` falso): botão escondido.
4. Erro e depois sucesso: o aviso de erro some no próximo toque.
5. Em repertório, o membro passa para a próxima cifra com a folha aberta e o `share()` falha depois: o aviso da cifra anterior não aparece na nova.
6. Barra inferior em celular de 360 px com `PDF` + `Compartilhar` + `Mudar tom`: sem rolagem horizontal nem botão cortado.

---

### Task 1: Helper `sharePdf`

**Files:**
- Create: `apps/web/src/viewer/sharePdf.ts`
- Create: `apps/web/src/test/shareStub.ts`
- Test: `apps/web/src/viewer/sharePdf.test.ts`

**Interfaces:**
- Produces (`sharePdf.ts`):
  - `export type ShareResult = 'shared' | 'cancelled'`
  - `export function canSharePdf(): boolean` — `true` só se `navigator.share` e `navigator.canShare` são funções e `navigator.canShare({ files: [probe] })` é verdadeiro, com `probe = new File([], 'cifra.pdf', { type: 'application/pdf' })`. Qualquer exceção → `false`.
  - `export function pdfFile(bytes: Uint8Array, name: string): File`
  - `export async function sharePdf(file: File): Promise<ShareResult>` — chama `navigator.share({ files: [file] })`; `DOMException` com `name === 'AbortError'` → `'cancelled'`; qualquer outro erro é relançado.
- Produces (`shareStub.ts`): `export function stubShare(impl: { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean }): void` define as duas propriedades em `navigator` com `Object.defineProperty(..., { configurable: true })` (omitida = não definida); `export function unstubShare(): void` apaga ambas. Os testes chamam `unstubShare()` no `afterEach`.

- [ ] **Step 1: Write the failing tests** in `sharePdf.test.ts` (importa `stubShare`/`unstubShare`)
  - `canSharePdf is false when navigator.share is missing` (sem stub).
  - `canSharePdf is false when canShare rejects files` (`share` definido, `canShare: () => false`).
  - `canSharePdf is false when canShare throws` (`canShare` lança).
  - `canSharePdf is true when canShare accepts a pdf file` — o `canShare` recebe `{ files: [File] }` com `files[0].type === 'application/pdf'`.
  - `pdfFile builds a pdf File` — `pdfFile(new Uint8Array([1, 2, 3]), 'A - B (G).pdf')` tem `name`, `type: 'application/pdf'`, `size: 3`.
  - `sharePdf passes the file and resolves 'shared'` — `share` chamado uma vez com `{ files: [file] }`.
  - `sharePdf resolves 'cancelled' on AbortError` — `share` rejeita com `new DOMException('x', 'AbortError')`.
  - `sharePdf rethrows other errors` — rejeita com `new DOMException('x', 'NotAllowedError')`; `await expect(...).rejects.toMatchObject({ name: 'NotAllowedError' })`.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w apps/web -- sharePdf`
Expected: FAIL (módulo `./sharePdf` não existe).

- [ ] **Step 3: Implement `sharePdf.ts` and `shareStub.ts`** conforme o bloco Interfaces. `pdfFile` usa `new File([bytes as BlobPart], name, { type: 'application/pdf' })` (mesmo cast do `download` em `ViewerPage.tsx`).

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w apps/web -- sharePdf`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/viewer/sharePdf.ts apps/web/src/viewer/sharePdf.test.ts apps/web/src/test/shareStub.ts
git commit -m "feat(web): add Web Share helper for PDFs"
```

---

### Task 2: Designer define a posição e o visual (sem código)

**Agente:** `designer` (não `frontend-dev`). Deliverable: seção **"Layout"** acrescentada ao spec `docs/superpowers/specs/2026-11-17-compartilhar-pdf-design.md`, commitada.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-17-compartilhar-pdf-design.md` (nova seção `## Layout`)

**Interfaces:**
- Produces: para a Task 3, a decisão de (a) ordem dos botões na `.viewer-bar`, (b) rótulo: texto + ícone ou só ícone, (c) como `PDF` + `Compartilhar` + `Mudar tom` cabem em 360 px sem rolagem horizontal (hoje a barra não quebra linha fora de repertório; o teste `viewerLayoutCss.test.ts` exige que `.viewer-bar` **não** tenha `flex-wrap` e que só `.viewer.has-setlist .viewer-bar` tenha), (d) tokens/classes CSS a usar (reaproveitar `.btn`, `.btn-icon` etc.), (e) estados: normal, desabilitado (PDF carregando), enviando, erro. O nome acessível do botão é sempre "Compartilhar", mesmo se só tiver ícone (`aria-label`).

- [ ] **Step 1:** Despachar o `designer` com o spec e os mockups existentes; ele escreve a seção `## Layout` (com a decisão acima, mobile-first, conferida contra os tokens de `styles.css`).
- [ ] **Step 2:** Ler a seção e confirmar que cobre (a) a (e) e a linha 6 do Review Focus.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-11-17-compartilhar-pdf-design.md
git commit -m "docs: define share button layout"
```

---

### Task 3: Botão no `ViewerPage`

**Files:**
- Modify: `apps/web/src/viewer/ViewerPage.tsx` (barra em torno de `className="viewer-bar"`; estado junto dos demais `useState` do componente; reset na troca de cifra em `if (stateSongId !== songId)`)
- Modify: `apps/web/src/ui/styles.css` (somente o que a seção Layout da Task 2 pedir)
- Modify (se a Task 2 pedir regra nova de CSS): `apps/web/src/ui/viewerLayoutCss.test.ts`
- Test: `apps/web/src/viewer/ViewerPage.test.tsx`

**Interfaces:**
- Consumes: `canSharePdf`, `pdfFile`, `sharePdf` (Task 1); `stubShare`/`unstubShare`; `pdfFileName` (já importado); seção Layout (Task 2).
- Produces: botão com nome acessível `Compartilhar`; aviso `role="alert"` com o texto `Não foi possível compartilhar. Tente de novo.`

**Comportamento:**
- `const [canShare] = useState(canSharePdf)` junto dos demais hooks, **antes** dos `return` antecipados (regra dos hooks). Sem suporte, o botão não renderiza.
- Estados `sharing: boolean` e `shareError: boolean`.
- Desabilitado quando `current?.status !== 'ready'` ou `sharing`.
- `const share = async (): Promise<void>`, definido ao lado de `download`: sai se `current?.status !== 'ready' || !displayed`; `setShareError(false)`, `setSharing(true)`; chama `sharePdf(pdfFile(current.bytes, pdfFileName(...)))` **sem `await` antes**; `'cancelled'` e `'shared'` não fazem nada; erro → `setShareError(true)` **só se** `alive.current && songIdRef.current === songId` (mesma guarda de `confirm`); `finally` → `setSharing(false)` com a mesma guarda.
- Aviso de erro: `<p role="alert" className="error">` no corpo, logo abaixo de `<SetlistNotices … />`.
- `setShareError(false)` e `setSharing(false)` no bloco de troca de cifra (`stateSongId !== songId`).

- [ ] **Step 1: Write the failing tests** em `ViewerPage.test.tsx` (usar `renderViewer`, `stubShare`, `afterEach(unstubShare)`; para um `share` que não resolve, uma `Promise` com `resolve` externo)
  - `hides the share button when the browser cannot share files` (sem stub): após `findByTestId('pdf-pages')`, `queryByRole('button', { name: 'Compartilhar' })` é `null`.
  - `disables share until the pdf has loaded` (stub com suporte): logo após `renderViewer`, o botão está `disabled`; após `findByTestId('pdf-pages')`, habilitado.
  - `shares the pdf with a friendly file name` (`?tom=G`): clique → `share` chamado uma vez com `{ files: [file] }`, `file.name === 'Sonda-me - Aline Barros (G).pdf'`, `file.type === 'application/pdf'`.
  - `stays silent when the user dismisses the share sheet`: `share` rejeita com `new DOMException('x', 'AbortError')`; nenhum `alert`; botão habilitado.
  - `shows an error when sharing fails, and clears it on the next try`: 1º `share` rejeita com `new Error('boom')` → `findByRole('alert')` com `Não foi possível compartilhar. Tente de novo.`; 2º clique com `share` resolvendo → alerta some.
  - `ignores a second tap while sharing`: `share` pendente; botão `disabled`; segundo `fireEvent.click` não chama `share` de novo (`toHaveBeenCalledTimes(1)`); ao resolver, volta a habilitar.
  - Em `ViewerPage.setlist.test.tsx` (reaproveitar o helper de "próxima cifra" já usado lá): `share` pendente → ir para a próxima cifra → `share` rejeita com `Error` → nenhum `alert` de compartilhar.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -w apps/web -- ViewerPage`
Expected: FAIL nos 7 testes novos (botão não existe); os antigos continuam passando.

- [ ] **Step 3: Implement** o botão, o estado e o aviso conforme o Comportamento, na posição e com o visual da seção Layout. Texto: ícone `↗` com `aria-hidden="true"` mais "Compartilhar" (ou `aria-label="Compartilhar"` se a Task 2 decidir só ícone).

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -w apps/web -- ViewerPage viewerLayoutCss`
Expected: PASS, incluindo os testes antigos de download, repertório e layout.

- [ ] **Step 5: Lint, typecheck e suíte do web**

Run: `npm run lint && npm run typecheck && npm test -w apps/web`
Expected: sem erros, tudo verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/viewer/ViewerPage.tsx apps/web/src/viewer/ViewerPage.test.tsx apps/web/src/viewer/ViewerPage.setlist.test.tsx apps/web/src/ui
git commit -m "feat(web): share the PDF from the viewer"
```

---

### Task 4: Verificação e PR

- [ ] **Step 1:** `superpowers:verification-before-completion`: `npm run lint`, `npm run typecheck`, `npm test` limpos. O e2e Playwright não cobre este botão (a folha de compartilhar é do sistema operacional); registrar no PR que o teste em aparelho real (Android e iPhone com WhatsApp) é manual e ainda não foi feito.
- [ ] **Step 2:** `git push -u origin feat/share-pdf` e `gh pr create --base develop` com o template preenchido.
- [ ] **Step 3:** Agente `code-reviewer` revisa o PR; depois da aprovação, só o orquestrador faz `gh pr merge <n> --squash --delete-branch`.

---

## Self-review

- **Spec:** botão ao lado de `PDF` (Task 2/3), arquivo com nome do download (Task 3), todos os papéis (nenhuma guarda de papel), escondido sem suporte (Tasks 1 e 3), cancelamento silencioso e erro curto (Tasks 1 e 3), testes com share simulado (Tasks 1 e 3), posição pelo `designer` (Task 2).
- **Tipos:** `canSharePdf`, `pdfFile`, `sharePdf`, `ShareResult`, `stubShare`/`unstubShare` têm os mesmos nomes nas Tasks 1 e 3.
- **Proporção:** o plano descreve decisões, sem corpo de função.
