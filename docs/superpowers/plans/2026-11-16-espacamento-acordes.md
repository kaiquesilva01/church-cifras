# Espaçamento de acordes após transposição — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando um acorde transposto colide com o próximo acorde, deslocar o próximo para a direita até sobrarem dois espaços, em vez de só avisar.

**Architecture:** `plan.ts` informa se o token seguinte de cada acorde é acorde (`nextIsChord`). `overlayOps` (compartilhado por prévia e PDF) calcula um `x` efetivo por acorde, empurrando em cadeia o mínimo necessário, e substitui o `reflowPackedRuns`. Writer e prévia desenham todos os retângulos brancos antes de todos os textos.

**Tech Stack:** TypeScript strict, Vitest, pdf-lib, React/canvas, Playwright (e2e).

**Spec:** [docs/superpowers/specs/2026-11-16-espacamento-acordes-design.md](../specs/2026-11-16-espacamento-acordes-design.md)

## Global Constraints

- Gap alvo: exatamente `2 * spaceWidth` (do `Replacement`) entre o fim do acorde anterior e o início do deslocado.
- Nunca deslocar para a esquerda: `x efetivo = max(x original, fim do anterior + 2 * spaceWidth)`.
- Só desloca quando o anterior colide **e** `nextIsChord` é `true`.
- Identificadores em inglês; texto de UI e docs em pt-BR; Conventional Commits em inglês.
- Testes escritos antes do código. Lint, typecheck e testes verdes ao fim de cada tarefa.
- Nunca commitar PDFs reais nem `.superpowers/`.

## Review Focus

- Dois acordes seguidos que colidem encadeados (`A`, `B`, `C`): o deslocamento de `B` não pode deixar `C` colado.
- Vizinho que não é acorde (`(2x)`) entre dois acordes: o acorde seguinte NÃO se move e a colisão continua marcada.
- Deslocamento que ultrapassa a margem direita (`limitX` do último acorde): continua `collides = true`.
- Retângulo branco do acorde seguinte não pode apagar a ponta do acorde anterior (ordem de desenho).
- Acorde que não colide, mesmo depois de o vizinho ter sido movido, fica na posição original.

---

### Task 1: `nextIsChord` no plano

**Files:**
- Modify: `packages/chords/src/plan.ts` (interface `Replacement`, laço de `findChords`, `keyIndicator`)
- Test: `packages/chords/src/plan.test.ts`

**Interfaces:**
- Produces: `Replacement.nextIsChord: boolean` — `true` quando `occurrence.next` é o token de outra ocorrência retornada por `findChords` (comparar por identidade de `token`). O `keyIndicator` recebe `false`.

- [ ] **Step 1: Escrever os testes que falham** em `plan.test.ts`, reutilizando os helpers de linhas já usados em `'tight spacing collides'`: (a) duas linhas de acordes `C7  F` → `plan.chords.map((c) => c.nextIsChord)` é `[true, false]`; (b) `C7 (2x) F` na mesma linha → `[false, false]` (o token seguinte de `C7` é `(2x)`); (c) `plan.keyIndicator!.nextIsChord` é `false`.
- [ ] **Step 2:** `npm test -w @cifras/chords` — esperado: FAIL (propriedade não existe).
- [ ] **Step 3: Implementar** `nextIsChord` em `buildTransposePlan` (pré-computar o conjunto de tokens das ocorrências e testar `next !== null && tokens.has(next)`); atualizar quaisquer fábricas de `Replacement` em testes/fixtures que o typecheck apontar.
- [ ] **Step 4:** `npm test -w @cifras/chords && npm run typecheck` — esperado: PASS.
- [ ] **Step 5: Commit** — `feat(chords): flag whether the next token of a chord is a chord`

### Task 2: Deslocamento em `overlayOps`

**Files:**
- Modify: `packages/overlay/src/ops.ts` (remove `PACKED_GAP_SPACES`, `isPacked`, `reflow`, `reflowPackedRuns`; adiciona `spreadChords`)
- Test: `packages/overlay/test/ops.test.ts` (o helper `replacement()` ganha `nextIsChord: true` por padrão; o bloco `describe('packed runs')` é substituído pelo `describe('spacing')` abaixo)

**Interfaces:**
- Consumes: `Replacement.nextIsChord`, `spaceWidth`, `limitX`, `newWidth`, `width`, `x`, `page`, `y` (Task 1).
- Produces: `overlayOps(plan: TransposePlan): OverlayOp[]` com a mesma forma de hoje, mas com um op por acorde (nunca mais juntos em um só): `text.x` = x efetivo; `collides` recalculado com o x efetivo (`x efetivo + newWidth > limitX`); `rect` = união de `[x original, x original + width]` e `[x efetivo, x efetivo + newWidth]` com o `pad` atual. `countCollisions` não muda.

- [ ] **Step 1: Escrever os testes que falham** (`spaceWidth: 6`, `newWidth` e `x` explícitos; mesma página e `y: 700`):
  - `pushes the next chord to two spaces after a colliding chord`: `D` em x=100 com `newWidth: 24`, `collides: true`, `limitX: 118`; `Bm` em x=118 → `ops[1].text.x` é `100 + 24 + 12 = 136`; `ops[0].collides` passa a `false` (o vizinho saiu de baixo) e `ops[1].collides` é `false`.
  - `chains: a pushed chord that now collides pushes the following one`.
  - `does not move a chord whose predecessor does not collide`: `text.x` igual ao `x` original.
  - `never moves left`: fim do anterior + 12 < x original → `text.x === x original`.
  - `does not move the neighbour when the next token is not a chord`: primeiro com `nextIsChord: false`, `collides: true` → segundo mantém x e primeiro continua `collides: true`.
  - `stays colliding when the push would pass the margin`: último acorde deslocado com `x efetivo + newWidth > limitX` → `collides: true`.
  - `rect covers the original and the new position of a pushed chord`.
  - `only chords of the same page and baseline interact` (outra `y` ou `page`: sem deslocamento).
  - Atualizar `countCollisions` tests para o novo comportamento.
- [ ] **Step 2:** `npm test -w @cifras/overlay -- ops` — esperado: FAIL.
- [ ] **Step 3: Implementar** `spreadChords(chords: Replacement[]): Array<{ r: Replacement; x: number; collides: boolean }>` e usá-lo em `overlayOps`; `toOp` passa a receber o `x` efetivo e o `collides` efetivo. Agrupar por `page` + `y` (diferença de `y` menor que 0.5 conta como a mesma linha; essa tolerância é decisão do implementador) e ordenar por `x` original dentro do grupo. O indicador de tom segue pelo `toOp` sem deslocamento.
- [ ] **Step 4:** `npm test -w @cifras/overlay && npm run typecheck && npm run lint` — esperado: PASS.
- [ ] **Step 5: Commit** — `feat(overlay): push colliding chords two spaces apart`

### Task 3: Retângulos antes dos textos

**Files:**
- Modify: `packages/overlay/src/overlayWriter.ts` (laço `for (const op of ops)`), `apps/web/src/viewer/PreviewLayer.tsx` (função `draw`)
- Test: `packages/overlay/test/writer.test.ts`, `apps/web/src/viewer/PreviewLayer.test.tsx`

**Interfaces:**
- Consumes: `overlayOps` da Task 2.
- Produces: no PDF e no canvas, todos os retângulos brancos da página são desenhados antes de qualquer texto.

- [ ] **Step 1: Escrever os testes que falham**: (a) no `PreviewLayer.test.tsx`, com dois ops cujos retângulos se sobrepõem, a ordem de chamadas no `ctx` mock é `fillRect, fillRect, fillText, fillText` (usar `mock.invocationCallOrder`); (b) no `writer.test.ts`, escrever um plano com dois acordes sobrepostos e verificar que o texto do primeiro continua no PDF (o teste de round-trip existente mostra como extrair texto).
- [ ] **Step 2:** `npm test -w @cifras/overlay -w @cifras/web` (nomes dos workspaces conforme `package.json`) — esperado: FAIL.
- [ ] **Step 3: Implementar** dois laços em cada arquivo: primeiro retângulos (e o traço vermelho da colisão na prévia), depois textos.
- [ ] **Step 4:** testes, typecheck e lint verdes.
- [ ] **Step 5: Commit** — `fix(overlay): draw all cover rectangles before the new chords`

### Task 4: E2E e documentação

**Files:**
- Modify: `e2e/fixtures/pdf.ts` (`COLLIDING_LINES` e o comentário), `e2e/transpose.spec.ts` (teste do aviso), `README.md:51`, `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§6.2, uma linha de "Atualização 2026-11-16")
- Test: `e2e/transpose.spec.ts`

- [ ] **Step 1:** Com `COLLIDING_LINES` atual (`C7` + `F` na mesma linha), `C#7` agora é resolvido por deslocamento: adicionar teste e2e `Mudar tom spreads colliding chords instead of warning` (C → C#, sem texto `/encostar no vizinho/`) e mudar a fixture usada pelo teste do aviso para uma colisão não resolvível (acorde seguido de um token que não é acorde, por exemplo `(2x)`, ou acorde encostado na margem direita); o aviso esperado continua `'⚠ 1 acorde pode encostar no vizinho (em vermelho)'`. Ver o teste falhar contra o código antigo não é possível aqui (o código novo já existe): confirmar que o e2e do aviso só passa com a fixture nova.
- [ ] **Step 2:** `npm run test:e2e` (exige Java 21; no Windows sem Java, ver AGENTS.md para rodar no contêiner) — esperado: PASS.
- [ ] **Step 3:** Atualizar o README (acordes que colidem são afastados para dois espaços; vermelho só para o que não coube) e a linha no spec.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test` — esperado: PASS.
- [ ] **Step 5: Commit** — `test(e2e): cover chord spreading and keep an unresolvable warning`; `docs: describe chord spreading`
