# SDLC com agentes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Desenvolve a #N" leva a issue até produção com o roteiro `entregar-issue`, a seção "Análise Agêntica" na issue, travas no `git-guard` (merge na `develop` e na `main`, janela do culto, incidente, deploy só pelo release), checagem e volta automática no deploy, site de teste fixo e modelos novos nos agentes.

**Architecture:** As regras puras do `git-guard-rules.mjs` passam a receber os fatos do PR (`resolvePr`), o relógio (`now`) e os incidentes abertos (`openIncidents`) por injeção. O entrypoint `git-guard.mjs` busca esses dados com `gh` e, em comandos de merge, carrega as regras da `origin/develop`. O roteiro é uma skill do projeto. O único código que ele chama é `analise.mjs`, que grava a seção na issue sem tocar o texto original. Os workflows ganham checagem com Playwright, volta automática e o site de teste. Todos os textos estão em `docs/superpowers/specs/2026-11-20-sdlc-agentes-design.md`.

**Tech Stack:** Node 22 (`node --test`, ESM `.mjs`), `gh` CLI, GitHub Actions, Firebase Hosting (multi-site), Vite 7 (plugin `transformIndexHtml`), React 19, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-20-sdlc-agentes-design.md` (leia junto com este plano).

## Global Constraints

- Branch `chore/sdlc-agentes` (worktree `harpa`), PR para `develop`. Esta mudança mexe em `.claude/`, workflows e `AGENTS.md`, então **o merge na `develop` e o release são da pessoa** (spec §5.1 item 7 e §7).
- Documentação, mensagens de bloqueio e texto de UI em pt-BR; identificadores em inglês. Commits no estilo do repositório (`tipo(escopo): descrição em português`), terminando com `Co-Authored-By: <modelo que fez> <noreply@anthropic.com>`.
- **`git-guard-rules.mjs` continua autocontido** (sem `import`), porque o entrypoint o carrega da `origin/develop` num arquivo temporário.
- **Fail closed:** qualquer consulta ao `gh` ou ao `git` que falha numa regra de merge = bloqueio.
- Caminhos das travas (spec §5.1 item 7): `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md` e `CLAUDE.md`. Os quatro últimos são arquivos da raiz e só contam com o caminho exato.
- Caminhos de teste no celular (spec §5.6): `apps/web/src/viewer/`, `apps/web/src/setlists/` e `apps/web/src/pad/`.
- **Janela do culto:** quinta e domingo, das **16h30 às 23h59** em `America/Sao_Paulo`, para merge de release.
- **Etiquetas (nomes exatos):**
  - na issue: `em-andamento`, `aguardando-voce`, `incidente`;
  - no PR: `revisado`, `qa-ok`, `teste-celular-ok`, `no-site-teste`.
- **Marcador da seção (exato):** `<!-- analise-agentica: tudo abaixo é escrito pelos agentes; o texto acima nunca é alterado -->`, precedido por uma linha `---`.
- **Site de teste:** `louvor-hajaluz-teste` (`https://louvor-hajaluz-teste.web.app`). Workflow: `.github/workflows/site-teste.yml`.
- **Modelos (spec §5.3):**

  | Agente | Modelo | Effort |
  |---|---|---|
  | `product-owner` | sonnet | medium |
  | `designer` | sonnet | medium |
  | `tech-lead` | haiku | high |
  | `frontend-dev` | haiku | low |
  | `backend-dev` | haiku | low |
  | `qa` | haiku | low |
  | `code-reviewer` | sonnet | high |

  Nenhum agente em `opus`. Sessão do projeto: `model: sonnet`, `effortLevel: medium`.
- **Execução deste plano:**
  - implementadores em Haiku low;
  - conferência por tarefa em Haiku high;
  - correções em Haiku medium, que sobem para Sonnet high depois de 2 falhas;
  - revisão final em Sonnet high;
  - a Tarefa 11 fica com o `product-owner` em Sonnet medium.

## Review Focus

Cada linha tem o teste que a fixa na tarefa indicada.

1. **Comando de merge escrito de formas diferentes.** Merge de release dentro de `if ($?) { ... }`, por URL do PR ou com `-R dono/repo` precisa passar pelas mesmas travas que a forma simples (Tarefa 2).
2. **Bordas da janela.** Quinta 16h29 libera e 16h30 bloqueia. Domingo 23h59 bloqueia e segunda 00h00 libera. Quarta 20h00 libera. Sexta 02h00 UTC, que é quinta 23h00 em Brasília, bloqueia (Tarefa 2).
3. **CI que ainda não terminou ou não existe.** Check `IN_PROGRESS`, `StatusContext` com `PENDING`, lista vazia, `CANCELLED` e `FAILURE` não contam como verde (Tarefa 1).
4. **Corpo de issue fora do comum.** Corpo com CRLF, vazio, com linhas `---` no texto original ou que já tem a seção: o texto original sai idêntico, e gravar duas vezes dá o mesmo resultado que gravar uma (Tarefa 5).
5. **Caminhos parecidos.** `apps/web/src/viewer-old/x.ts` não conta como viewer. `docs/AGENTS.md` não conta como `AGENTS.md`. `.claude/` conta em qualquer profundidade. PR com mais de 100 arquivos lista todos os arquivos (Tarefas 1 e 4).

---

### Task 1: Merge na `develop` exige CI verde, etiquetas e o merge da pessoa nas travas

**Files:**
- Modify: `.claude/hooks/git-guard-rules.mjs` (`checkMerge`, `evaluateCommand`, novas exportações)
- Test: `.claude/hooks/git-guard-rules.test.mjs`

**Interfaces:**
- Produces:
  - `type PrFacts = { base: string; head: string; headSha: string; checks: Array<{ name: string; status?: string; conclusion?: string; state?: string }>; labels: string[]; files: string[]; body: string }` (JSDoc)
  - `export const GUARD_PATHS = ['.claude/', '.github/workflows/', 'firebase.json', 'cors.json', 'AGENTS.md', 'CLAUDE.md']`
  - `export const DEVICE_TEST_PATHS = ['apps/web/src/viewer/', 'apps/web/src/setlists/', 'apps/web/src/pad/']`
  - `export function touches(files: string[], prefixes: string[]): string[]`: devolve os arquivos que batem. Prefixo terminado em `/` compara com `startsWith`; os outros comparam igualdade.
  - `export function ciGreen(checks): boolean`: verde se houver ao menos um check e todos estiverem verdes. `CheckRun` conta quando `status === 'COMPLETED'` e `conclusion ∈ {SUCCESS, SKIPPED, NEUTRAL}`. `StatusContext` conta quando `state === 'SUCCESS'`.
  - `evaluateCommand({ command, branch, stagedFiles, resolvePr, now, openIncidents })`. Os padrões são `resolvePr = () => null`, `now = () => new Date()` e `openIncidents = () => null`. O parâmetro `resolvePrBase` sai das regras.

- [ ] **Step 1: Write the failing tests**

  Troque o helper `merge` por `merge(command, facts)`, que passa `resolvePr: (t, repo) => facts`. Use um `facts` base `{ base: 'develop', head: 'feat/95-x', headSha: 'abc', checks: [{ name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' }], labels: ['revisado', 'qa-ok'], files: ['apps/web/src/stats/StatsPage.tsx'], body: '' }`. Testes:

  - `allows develop merge with green CI and both labels`: `gh pr merge 2 --squash --delete-branch` → `allow: true`. O resolver recebe `'2'`.
  - `blocks develop merge when CI is not green`: um teste com cada caso, `IN_PROGRESS`, `[]`, `CANCELLED`, `FAILURE` e `{ __typename: 'StatusContext', state: 'PENDING' }`. A `reason` inclui `CI`.
  - `blocks develop merge without revisado or qa-ok`: cada etiqueta ausente → a `reason` inclui o nome da etiqueta que falta.
  - `requires teste-celular-ok when the PR touches viewer, setlists or pad`: com `files: ['apps/web/src/pad/PadPage.tsx']` e sem a etiqueta → bloqueia com `teste-celular-ok`. Com a etiqueta → libera. Com `apps/web/src/viewer-old/x.ts` → libera.
  - `blocks develop merge of PRs that change the guards`: `.claude/hooks/x.mjs`, `.github/workflows/ci.yml`, `firebase.json`, `cors.json`, `AGENTS.md` e `CLAUDE.md` → bloqueia, e a `reason` inclui `merge é da pessoa`. `docs/AGENTS.md` → libera.
  - `blocks develop merge when facts are unavailable`: o resolver devolve `null` → a `reason` inclui `gh pr view`.
  - `touches` e `ciGreen`: testes unitários com os casos acima.
  - Atualize os testes existentes de merge (`allows merge when base is develop`, `passes repo to resolver`, `skips flag values…`, `url, branch…`, `redirects…`, `star redirect…`, `glued -R repo`) para o novo helper. A semântica é a mesma: o alvo e o repositório chegam ao resolver.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: FAIL nos testes novos (`resolvePr` ainda não é usado).

- [ ] **Step 3: Implement in `git-guard-rules.mjs`**

  `checkMerge` resolve `facts = state.resolvePr(target, repo ?? leadingRepo)`. Se `facts` for `null`, bloqueia com a mensagem atual de base desconhecida. Com `base === 'develop'`, aplica esta ordem e para no primeiro bloqueio:

  1. travas (`touches(files, GUARD_PATHS)`);
  2. `ciGreen`;
  3. etiquetas `revisado` e `qa-ok`;
  4. `teste-celular-ok` quando `touches(files, DEVICE_TEST_PATHS)` não estiver vazio.

  Mensagens em pt-BR, com o número do PR:
  - travas: "O PR #N altera as travas ou o processo (<arquivos>): o merge é da pessoa responsável.";
  - CI: "CI não está verde no PR #N (<checks>): espere o CI (`gh pr checks N --watch`).";
  - etiquetas: "Faltam as etiquetas <lista> no PR #N: o merge na develop exige revisão (`revisado`) e QA (`qa-ok`).";
  - celular: "O PR #N mexe em cifra, repertório ou pad: precisa do teste no celular (`teste-celular-ok`).".

  A base `main` continua bloqueada nesta tarefa e passa a ter regras na Tarefa 2.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: PASS, todos.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): merge na develop exige CI verde, revisado, qa-ok e merge humano nas travas"`

---

### Task 2: Release `develop → main` liberado com travas: merge commit, SHA, CI, janela e incidente

**Files:**
- Modify: `.claude/hooks/git-guard-rules.mjs`
- Test: `.claude/hooks/git-guard-rules.test.mjs`

**Interfaces:**
- Consumes: `PrFacts`, `ciGreen` e o helper `merge` (Tarefa 1).
- Produces:
  - `export function isFreezeWindow(date: Date): boolean`: `true` quando, em `America/Sao_Paulo`, o dia for quinta ou domingo e o horário for `>= 16:30`. Use `Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })`.
  - `export function closingRefs(body: string): number[]`: números depois de `close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved` + `#N`, sem diferenciar maiúsculas, sem repetição.
  - `parseMergeArgs` devolve também `flags: string[]` e `matchHead: string | null`.

- [ ] **Step 1: Write the failing tests**

  `release` é o `facts` com `base: 'main'`, `head: 'develop'`, `headSha: 'abc123'`, CI verde e `labels: []`. O relógio fixo é `now: () => new Date('2026-11-25T15:00:00Z')`, uma quarta. Testes:

  - `allows the release merge with --merge and the current head`: `gh pr merge 99 --merge --match-head-commit abc123`, com `openIncidents: () => []` → `allow: true`.
  - `the release merge goes through the same guards in any command form`: `if ($?) { gh pr merge https://github.com/o/r/pull/99 --merge --match-head-commit abc123 }` e `gh -R o/r pr merge 99 -m --match-head-commit abc123` → liberado. A mesma forma dentro da janela → bloqueado (Review Focus 1).
  - `blocks release merge without --merge or with squash, rebase, auto or admin`: `--squash`, `-s`, `--rebase`, `-r`, `--auto`, `--admin` e a ausência de `--merge`/`-m` → bloqueia, e a `reason` inclui `--merge`.
  - `blocks release merge without --match-head-commit or with another sha`: a `reason` inclui `--match-head-commit`.
  - `blocks release from a head other than develop`: `head: 'feat/x'` → a `reason` inclui `develop`.
  - `blocks release merge when CI is not green`: igual à Tarefa 1.
  - `blocks release merge in the worship window`: as bordas do Review Focus 2 em UTC:
    - `2026-11-26T19:29:00Z` (qui 16h29) libera;
    - `2026-11-26T19:30:00Z` (qui 16h30) bloqueia;
    - `2026-11-30T02:59:00Z` (dom 23h59) bloqueia;
    - `2026-11-30T03:00:00Z` (seg 00h00) libera;
    - `2026-11-25T23:00:00Z` (qua 20h00) libera;
    - `2026-11-27T02:00:00Z` (sex 02h00 UTC = qui 23h00 BRT) bloqueia.

    Quando bloqueia, a `reason` inclui `janela do culto`.
  - `blocks release while an incident is open unless the PR closes it`: `openIncidents: () => [120]` com corpo vazio → bloqueia (`incidente`). Com corpo `Closes #120` → libera. `openIncidents: () => null` → bloqueia.
  - `blocks --auto on any base`: base `develop` com tudo verde mais `--auto` → bloqueia.
  - `closingRefs`: `'Closes #95\nresolves #96, Parte de #85'` → `[95, 96]`.
  - Atualize `blocks merge when base is main` e `blocks merge with -R when base main` para o novo motivo (sem `--merge` → `reason` inclui `--merge`).

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: FAIL nos testes de release.

- [ ] **Step 3: Implement**

  Com `base === 'main'`, aplica nesta ordem:

  1. `head === 'develop'`;
  2. flags (`--merge`/`-m` presente; `--squash`/`-s`, `--rebase`/`-r`, `--auto` e `--admin` ausentes);
  3. `matchHead === facts.headSha`;
  4. `ciGreen`;
  5. `!isFreezeWindow(state.now())`;
  6. incidentes: `openIncidents()` diferente de `null` e todo número contido em `closingRefs(facts.body)`.

  O `--auto` bloqueia em qualquer base, depois de resolver o alvo. Mensagens em pt-BR:
  - janela: "Janela do culto (quinta e domingo, a partir das 16h30 em Brasília): o release espera a janela passar.";
  - incidente: "Há incidente aberto (#N): o próximo release precisa fechá-lo (`Closes #N`).".

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): release develop -> main pelo agente com merge commit, SHA, CI, janela do culto e incidente"`

---

### Task 3: Deploy de produção só pelo release

**Files:**
- Modify: `.claude/hooks/git-guard-rules.mjs` (`evaluateSegments`, `checkGh`, `programName`)
- Test: `.claude/hooks/git-guard-rules.test.mjs`

**Interfaces:**
- Produces:
  - `checkWorkflowRun(args)` (interno). Bloqueia `gh workflow run <wf>` quando `<wf>` bate com `/^deploy(\.ya?ml)?$/i` ou é numérico. Bloqueia `site-teste.yml` com `--ref`/`-r` diferente de `main`.
  - `checkFirebase(tokens)` (interno). Bloqueia `firebase` (também `firebase.cmd` e `npx firebase`/`npx firebase-tools[@v]`) quando algum token depois dele for `deploy` ou terminar em `:deploy`.
  - `programName` também remove `.cmd`.

- [ ] **Step 1: Write the failing tests** (na tabela `cases`)

  - Bloqueia, com a `reason` incluindo `release`:
    - `gh workflow run deploy.yml`;
    - `gh workflow run Deploy`;
    - `gh workflow run 123456`;
    - `npx firebase deploy --only hosting`;
    - `firebase.cmd deploy`;
    - `npx firebase-tools@15 hosting:channel:deploy x`;
    - `npm ci; npx firebase deploy`.
  - Libera:
    - `gh workflow run site-teste.yml -f branch=feat/95-x -f issue=95`;
    - `gh workflow run site-teste.yml --ref main -f branch=feat/95-x -f issue=95`;
    - `npx firebase emulators:start`;
    - `firebase --version`.
  - Bloqueia `gh workflow run site-teste.yml --ref feat/95-x`, com a `reason` incluindo `--ref main`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: FAIL nos casos novos.

- [ ] **Step 3: Implement**

  - Mensagem do deploy: "O agente não publica produção: ela sai pelo merge do release, e o site de teste pelo workflow `site-teste.yml` (disparado com `--ref main`)."
  - Acrescente um teste que lê o próprio `git-guard-rules.mjs` e confere que ele não tem linha começando com `import ` (Global Constraints).

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): agente nao dispara deploy de producao nem firebase deploy"`

---

### Task 4: Entrypoint do hook com os dados reais do PR e as regras da `origin/develop`

**Files:**
- Modify: `.claude/hooks/git-guard.mjs`
- Test: `.claude/hooks/git-guard.test.mjs`

**Interfaces:**
- Consumes: `evaluateCommand({ command, branch, stagedFiles, resolvePr, now, openIncidents })` (Tarefas 1 e 2).
- Produces:
  - `resolvePr(target, repo)`:
    - chama `gh pr view <target> [-R repo] --json baseRefName,headRefName,headRefOid,statusCheckRollup,labels,body` e mapeia para `PrFacts` (`labels` com os `.name`);
    - pega os `files` de `gh pr diff <target> [-R repo] --name-only` (todos os arquivos, sem o limite de 100);
    - devolve `null` se der qualquer erro.
  - `openIncidents()`: `gh issue list --label incidente --state open --json number` → `number[]`, ou `null` se der erro.
  - Origem das regras: quando o comando tem `gh` e `merge`, lê `git show origin/develop:.claude/hooks/git-guard-rules.mjs`, grava num `mkdtempSync(tmpdir())` e importa com `pathToFileURL`. Se falhar, bloqueia com a mensagem: "Não consegui carregar as regras da origin/develop (rode `git fetch origin develop`); merge bloqueado.". Os outros comandos usam o módulo local.
  - O pré-filtro passa de `\b(git|gh)\b` para `\b(git|gh|firebase)\b`.
  - Passa também `resolvePrBase`, que devolve `facts?.base ?? null`. Na transição, a `origin/develop` ainda tem as regras antigas, e elas esperam esse parâmetro.

- [ ] **Step 1: Write the failing tests**

  - `blocks gh pr merge when origin/develop is missing`: num repositório temporário sem remote → `status 2`, e o stderr bate com `/origin\/develop/`. Esse teste substitui `blocks gh pr merge when base cannot be resolved`.
  - `loads the rules from origin/develop for merges`:
    - crie um remote bare com uma branch `develop` contendo `.claude/hooks/git-guard-rules.mjs` que exporta `evaluateCommand = () => ({ allow: false, reason: 'REGRAS-DA-DEVELOP' })`;
    - rode `git fetch` e depois `gh pr merge 1 --squash`;
    - Expected: `status 2`, com o stderr contendo `REGRAS-DA-DEVELOP`.
  - `evaluates firebase deploy`: `npx firebase deploy` → `status 2`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/hooks/git-guard.test.mjs`
  Expected: FAIL nos três.

- [ ] **Step 3: Implement**

  Use top-level `await import(...)` no entrypoint, que já é ESM. Apague o diretório temporário no `finally`. Os timeouts do `gh` ficam em 15000 ms, como hoje.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/hooks/git-guard.test.mjs .claude/hooks/git-guard-rules.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): git-guard consulta CI, etiquetas, arquivos e incidentes e usa as regras da develop no merge"`

---

### Task 5: Gravar a "Análise Agêntica" sem tocar no texto original

**Files:**
- Create: `.claude/skills/entregar-issue/analise.mjs`
- Test: `.claude/skills/entregar-issue/analise.test.mjs`

**Interfaces:**
- Produces:
  - `export const MARKER`: o marcador exato das Global Constraints.
  - `export function originalText(body: string): string`: tudo antes da linha `---` que precede o `MARKER`, sem espaços finais. Sem marcador, devolve `body` sem espaços finais.
  - `export function spliceAnalysis(body: string, section: string): string`: devolve `${originalText(body)}\n\n---\n${MARKER}\n${section.trim()}\n`. Com corpo vazio, a saída começa em `---`. Se passar de 65536 caracteres, lança `Error('Análise Agêntica passa do limite de 65.536 caracteres; resuma o Histórico')`.
  - CLI: `node .claude/skills/entregar-issue/analise.mjs <issue> <arquivo.md>`. Lê `gh issue view <issue> --json body -q .body`, aplica `spliceAnalysis`, grava num arquivo temporário e roda `gh issue edit <issue> --body-file <tmp>`. Sai com código 1 e mensagem em pt-BR se der erro. Use a mesma detecção de execução direta de `release-pr.mjs` (`isMain`).

- [ ] **Step 1: Write the failing tests** (Review Focus 4)

  - `keeps the original text byte for byte`:
    - para cada corpo, `originalText(spliceAnalysis(b, '## Análise Agêntica\nx')) === b.trimEnd()`;
    - corpos: `'A notificação…\nlinha 2'`, `'a\r\nb\r\n'`, `'texto\n\n---\n\nmais texto'`, `''`.
  - `replaces an existing section instead of appending`: gravar duas vezes com seções diferentes → o resultado contém o `MARKER` uma vez só e só a segunda seção.
  - `is idempotent`: `spliceAnalysis(spliceAnalysis(b, s), s) === spliceAnalysis(b, s)`.
  - `throws past the GitHub body limit`: uma seção de 70000 caracteres → lança com `65.536`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/skills/entregar-issue/analise.test.mjs`
  Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement `analise.mjs`**

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/skills/entregar-issue/analise.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): script que grava a Analise Agentica abaixo do texto original da issue"`

---

### Task 6: O roteiro `entregar-issue`

**Files:**
- Create: `.claude/skills/entregar-issue/SKILL.md`
- Test: `.claude/skills/entregar-issue/skill.test.mjs`

**Interfaces:**
- Consumes: `MARKER` e o CLI de `analise.mjs` (Tarefa 5); as regras do hook (Tarefas 1–4).
- Produces: a skill `entregar-issue`, citada pelo `AGENTS.md` (Tarefa 12).

- [ ] **Step 1: Write the failing test**

  `skill.test.mjs` lê o `SKILL.md` e confere:

  - **Frontmatter:**
    - `name: entregar-issue`;
    - `description` com `desenvolve a #`, `continua a #` e `publica a #`.
  - **Corpo, com estes textos:**
    - o `MARKER` importado de `analise.mjs` e `analise.mjs` (como ele é chamado);
    - os 7 gatilhos de parada: `dado novo sobre pessoas`, `papel`, `custo`, `passo manual`, `não-objetivo`, `sem volta`, `travas`;
    - as etiquetas `revisado`, `qa-ok`, `teste-celular-ok`, `no-site-teste`, `aguardando-voce`, `em-andamento` e `incidente`;
    - `16h30`, `--match-head-commit`, `site-teste.yml`, `--ref main`, `PushNotification` e `docs/sistema.md`;
    - a frase `Só o orquestrador escreve na issue`;
    - uma linha da tabela de modelos para cada papel do spec §5.3, com o modelo e o effort.

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test .claude/skills/entregar-issue/skill.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Write `SKILL.md`**

  Conteúdo do spec, nesta ordem:

  1. Quando usar (disparos, de §5.4).
  2. Precedência sobre o `brainstorming` com humano (§5.4).
  3. Etapa 0: release pendente, incidente e retomada.
  4. Etapas 1 a 9 (§5.4), cada uma com o agente, o `model`/`effort` que devem ir na chamada ao `Agent` (§5.3) e o que ela grava na seção.
  5. Gatilhos e como parar (§5.1): no máximo 3 perguntas, etiqueta `aguardando-voce` e `PushNotification`.
  6. A Análise Agêntica: o esqueleto de §5.5, como gravar (`node .claude/skills/entregar-issue/analise.mjs <n> <arquivo>`) e o que vai nas sub-issues.
  7. O Git de cada entrega (§5.2), com os comandos exatos:
     - `gh pr merge <n> --squash --delete-branch`;
     - `gh pr checks <n> --watch`;
     - `gh pr merge <n> --merge --match-head-commit <sha>`;
     - `gh run watch`.
  8. O teste no celular (§5.6): a vez pela etiqueta `no-site-teste` e `gh workflow run site-teste.yml --ref main -f branch=<branch> -f issue=<n>`.
  9. A janela do culto (§5.7).
  10. A produção e o incidente (§5.8): o release sem deploy, o revert `fix/<incidente>-reverte-<slug>` e a issue reaberta.
  11. O fechamento: a mensagem final e as lições.

  O texto é instrução para o orquestrador, em pt-BR, e deve ficar abaixo de 300 linhas.

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test .claude/skills/entregar-issue/skill.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): roteiro entregar-issue (da issue a producao)"`

---

### Task 7: Modelos dos agentes e da sessão

**Files:**
- Modify: `.claude/agents/{product-owner,designer,tech-lead,frontend-dev,backend-dev,qa,code-reviewer}.md`
- Modify: `.claude/settings.json`
- Test: `.claude/agents/agents.test.mjs`, `.claude/hooks/settings.test.mjs`

- [ ] **Step 1: Write the failing tests**

  - **`agents.test.mjs`.** Troque `implementers run on haiku medium` por estes testes:
    - `every agent runs on the model and effort of the SDLC table`: tabela da Global Constraints;
    - `no agent runs on opus`;
    - `every agent leaves the issue to the orchestrator`: o corpo de cada agente inclui `orquestrador escreve na issue`;
    - `every agent knows its step in entregar-issue`: o corpo inclui `entregar-issue`.
  - **`settings.test.mjs`:**
    - `the project session opens on sonnet medium`: `settings.model === 'sonnet'`, `settings.effortLevel === 'medium'` e `settings.modelSettings['claude-sonnet-5-5'].effortLevel === 'medium'`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/agents/agents.test.mjs .claude/hooks/settings.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Update the agents and `settings.json`**

  - Frontmatter conforme a tabela.
  - Em cada agente, uma seção `## No roteiro entregar-issue` com o papel do agente no spec §5.4:
    - PO: Proposta e consolidação;
    - designer: crítica de experiência, Paper e conferência visual;
    - tech-lead: crítica de viabilidade e plano;
    - devs: pré-voo e implementação;
    - qa: E2E dos critérios;
    - code-reviewer: revisão final, cobrar `docs/sistema.md` e apontar como crítico qualquer mudança nas travas que não espere a pessoa.
  - Em todos, a regra "Só o orquestrador escreve na issue; devolva o texto a ele."
  - A linha "merge é do orquestrador para develop e do humano para main" passa a ser "subagentes nunca fazem merge; o orquestrador faz o merge com as travas do git-guard, e mudanças nas travas ficam com a pessoa".
  - `settings.json` ganha `"model": "sonnet"`, `"effortLevel": "medium"` e `"modelSettings": { "claude-sonnet-5-5": { "effortLevel": "medium" } }` (a pessoa tem Sonnet em `high` nas configurações de usuário).

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npm run test:harness`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "chore(harness): modelos do SDLC nos agentes e sessao do projeto em Sonnet medium"`

---

### Task 8: PR de release com `Closes` e sem pedir aprovação humana

**Files:**
- Modify: `.claude/hooks/release-pr.mjs`
- Test: `.claude/hooks/release-pr.test.mjs`

**Interfaces:**
- Produces:
  - `export function prNumbers(subjects: string[]): number[]`: o `(#N)` no fim de cada assunto.
  - `export function resolvedIssues(body: string): number[]`: as mesmas palavras-chave de `closingRefs`. "Parte de #N" **não** conta.
  - `buildReleaseBody(subjects: string[], closes: number[] = [])`.
  - `checkRelease` roda `gh pr view <N> --json body -q .body` para cada PR de `prNumbers(subjects)` e passa a união ordenada a `buildReleaseBody`. Se uma dessas consultas falhar, ela é ignorada.

- [ ] **Step 1: Write the failing tests**

  - `prNumbers(['feat(web): x (#97)', 'chore: y'])` → `[97]`.
  - `resolvedIssues('Resolve #95\nParte de #85')` → `[95]`.
  - `buildReleaseBody(['a'], [95, 96])` contém `Closes #95` e `Closes #96`, contém `--match-head-commit` e `janela do culto` e **não** contém `Antes de aprovar`.
  - `checkRelease` com `fakeRun` (log `T1\tfeat: x (#97)`, rota `gh pr view 97` → `ok('Resolve #95\nParte de #85')`) cria o PR com corpo contendo `Closes #95` e sem `Closes #85`.
  - Atualize os testes existentes que procuram `Antes de aprovar`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `node --test .claude/hooks/release-pr.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - `REVIEW_NOTE` passa a ser: "O agente faz o merge (`gh pr merge <n> --merge --match-head-commit <sha>`) depois de: CI verde, revisão e QA de cada entrega, fora da janela do culto (quinta e domingo a partir das 16h30) e sem incidente aberto. Mudanças nas travas já passaram pelo merge da pessoa na develop."
  - Seção `## Fecha` com as linhas `Closes #N`, só quando houver alguma.
  - O título da seção do checklist passa a ser `## Travas`.
  - `MERGE_NOTE` fica como está.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `node --test .claude/hooks/release-pr.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(harness): PR de release fecha as issues entregues e descreve as travas do merge pelo agente"`

---

### Task 9: Versão no build, checagem depois do deploy e volta automática

**Files:**
- Create: `apps/web/build/appVersion.ts`, `apps/web/build/appVersion.test.ts`
- Modify: `apps/web/vite.config.ts`
- Create: `e2e/smoke/playwright.smoke.config.ts`, `e2e/smoke/prod.smoke.ts`
- Modify: `e2e/package.json` (script `smoke`)
- Modify: `.github/workflows/deploy.yml`
- Test: `.claude/hooks/settings.test.mjs` (asserções de texto sobre o `deploy.yml`)

**Interfaces:**
- Produces:
  - `appVersionPlugin(version: string): Plugin`: o `transformIndexHtml` devolve `[{ tag: 'meta', attrs: { name: 'app-version', content: version }, injectTo: 'head' }]`. O `vite.config.ts` usa `appVersionPlugin(process.env.VITE_APP_VERSION || 'dev')`.
  - `npm run smoke -w @cifras/e2e`, que lê `SMOKE_URL` (obrigatória) e `EXPECTED_VERSION` (opcional).

- [ ] **Step 1: Write the failing tests**

  - `appVersion.test.ts`: `appVersionPlugin('abc').transformIndexHtml('<html></html>')` devolve o descritor acima.
  - `settings.test.mjs`, `deploy checks the new version and rolls back on failure`. O `deploy.yml` contém:
    - `VITE_APP_VERSION: ${{ github.sha }}`;
    - `EXPECTED_VERSION: ${{ github.sha }}`;
    - `npm run smoke -w @cifras/e2e`;
    - `github.event.before`;
    - `--label incidente`;
    - `issues: write`;
    - `--only hosting:louvor-hajaluz,hosting:cifras-louvor-5dd50,functions,firestore,storage`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm test -w @cifras/web -- appVersion` e `node --test .claude/hooks/settings.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement the plugin and the smoke check**

  `prod.smoke.ts` contém um teste, `o site está no ar e é a versão esperada`:

  - registra `page.on('pageerror')`;
  - se `EXPECTED_VERSION` estiver definida, faz `expect.poll` (recarrega `/` e lê `meta[name="app-version"]`) até bater, com `timeout: 180_000` e `intervals: [10_000]`;
  - confere que o botão `Entrar com Google` aparece;
  - confere que a lista de erros de página está vazia.

  A config usa `testMatch: '*.smoke.ts'`, `baseURL: process.env.SMOKE_URL`, `retries: 0`, `serviceWorkers: 'block'`, `locale: 'pt-BR'` e não sobe servidor. O nome `*.smoke.ts` deixa a checagem fora da suíte E2E normal, que usa `*.spec.ts`.

- [ ] **Step 4: Verify the smoke check against production now (read-only)**

  Run: `SMOKE_URL=https://louvor-hajaluz.web.app npm run smoke -w @cifras/e2e`
  Expected: 1 passed.

  Sem `EXPECTED_VERSION`, só confere que o site carrega sem erro.

- [ ] **Step 5: Update `deploy.yml`**

  - `permissions` ganha `issues: write`.
  - O build ganha `VITE_APP_VERSION: ${{ github.sha }}`.
  - O deploy usa `--only hosting:louvor-hajaluz,hosting:cifras-louvor-5dd50,functions,firestore,storage`, para nunca publicar o build de produção no site de teste.
  - Depois do deploy, dois passos: `npx playwright install --with-deps chromium` e o passo `smoke` (`npm run smoke -w @cifras/e2e`, com `SMOKE_URL=https://louvor-hajaluz.web.app` e `EXPECTED_VERSION=${{ github.sha }}`).
  - Volta automática, com `if: failure() && steps.smoke.outcome == 'failure' && github.event_name == 'push'`:
    - checkout de `${{ github.event.before }}` em `rollback/`;
    - `npm ci`, build com `VITE_APP_VERSION=${{ github.event.before }}` e o mesmo `firebase deploy --only ...`, rodando de dentro de `rollback/`;
    - antes do deploy, grava de novo `apps/functions/.env.$FIREBASE_PROJECT_ID` dentro de `rollback/`, como faz o passo de deploy normal.
  - Incidente, com `if: failure()`: `gh issue create --label incidente --title "Incidente: deploy de ${{ github.sha }} falhou" --body "<link da execução; se houve volta automática, para qual commit>"` com `GH_TOKEN: ${{ github.token }}`.
  - Todos os passos novos mantêm o `if: steps.config.outputs.configured == 'true'`.

- [ ] **Step 6: Run tests to verify they pass**

  Run: `npm test -w @cifras/web -- appVersion` e `npm run test:harness`
  Expected: PASS.

- [ ] **Step 7: Commit**

  `git commit -m "feat(deploy): versao no build, checagem do site apos o deploy e volta automatica com incidente"`

---

### Task 10: Site de teste fixo

**Files:**
- Modify: `firebase.json` (terceiro site do Hosting)
- Create: `.github/workflows/site-teste.yml`
- Create: `apps/web/src/ui/TestBanner.tsx`, `apps/web/src/ui/TestBanner.test.tsx`
- Modify: `apps/web/src/bootstrap.tsx`, `apps/web/src/vite-env.d.ts`, `apps/web/src/ui/redesign.css`
- Modify: `cors.json`, `docs/deploy.md`, `docs/design-system.md`
- Test: `.claude/hooks/settings.test.mjs` (asserções de texto)

**Interfaces:**
- Consumes: `appVersionPlugin` / `VITE_APP_VERSION` (Tarefa 9).
- Produces:
  - `TestBanner({ label }: { label?: string }): JSX.Element | null`: renderiza `<div className="test-banner" role="status">{label}</div>` quando `label` não está vazio, e nada quando está.
  - Workflow `site-teste.yml` com as entradas `branch` e `issue`.

- [ ] **Step 1: Write the failing tests**

  - `TestBanner.test.tsx`:
    - `label="TESTE · #95"` → `getByRole('status')` com o texto `TESTE · #95`;
    - `label=""` e sem `label` → `queryByRole('status')` nulo.
  - `settings.test.mjs`, `test site is deployed only from main, with the build job holding no secrets`:
    - o `firebase.json` tem um site `louvor-hajaluz-teste` com `public: apps/web/dist`;
    - o `site-teste.yml` contém `workflow_dispatch`, `github.ref == 'refs/heads/main'`, `hosting:louvor-hajaluz-teste` e `VITE_TEST_BANNER`;
    - o trecho do job `build:` até o job `deploy:` não contém `secrets.`;
    - o `cors.json` contém `https://louvor-hajaluz-teste.web.app`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm test -w @cifras/web -- TestBanner` e `node --test .claude/hooks/settings.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Implement**

  - **`firebase.json`:** o site novo copia `public`, `ignore`, `rewrites` e `headers` do `louvor-hajaluz`.
  - **`bootstrap.tsx`:** renderiza `<TestBanner label={import.meta.env.VITE_TEST_BANNER} />` antes de `<App>`. O `vite-env.d.ts` declara `VITE_TEST_BANNER?: string`.
  - **CSS `.test-banner`:**
    - só tokens: `--color-warn-soft` no fundo e `--color-warn` no texto;
    - fixo no topo, acima do conteúdo, respeitando `env(safe-area-inset-top)`;
    - texto de 12–13 px, alto o bastante para não cobrir controles.
  - **`docs/design-system.md`:** seção "Faixa de teste".
  - **`site-teste.yml`:**
    - `concurrency: { group: site-teste, cancel-in-progress: false }` e `permissions: contents: read`.
    - **Job `build`** (`environment: production`, só `vars`, nenhum `secrets.`):
      - valida as entradas via `env` (`BRANCH` com `^[a-z]+/[0-9]+-[a-z0-9-]+$`, `ISSUE` com `^[0-9]+$`) e sai com 1 se não baterem; nunca interpola `inputs` direto num `run`;
      - faz checkout de `inputs.branch`, `npm ci` e build com as `VITE_FIREBASE_*` de produção, mais `VITE_TEST_BANNER: "TESTE · #<issue>"` e `VITE_APP_VERSION` (SHA da branch);
      - faz `upload-artifact` de `apps/web/dist`.
    - **Job `deploy`** (`needs: build`, `environment: production`):
      - checkout da `main` e `npm ci`;
      - `download-artifact` para `apps/web/dist`;
      - `google-github-actions/auth` com o mesmo pin do `deploy.yml`;
      - `npx firebase deploy --only hosting:louvor-hajaluz-teste --project "$FIREBASE_PROJECT_ID" --non-interactive`.
    - Os dois jobs têm `if: github.ref == 'refs/heads/main'`.
  - **`cors.json`:** acrescenta a origem.
  - **`docs/deploy.md`:** nova seção "13. Site de teste" com os passos 1 a 4 do spec §6 (criar o site, domínio autorizado, aplicar o `cors.json`, restrição da chave de API).

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npm test -w @cifras/web -- TestBanner`, `npm run test:harness` e `npm run typecheck`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "feat(deploy): site de teste fixo com faixa TESTE e workflow disparado da main"`

---

### Task 11: Mapa do sistema (`docs/sistema.md`)

Executar com o agente `product-owner` (Sonnet medium).

**Files:**
- Create: `docs/sistema.md`
- Test: `.claude/agents/sistema.test.mjs`

- [ ] **Step 1: Write the failing test**

  `docs/sistema.md` existe, tem no máximo 350 linhas e contém estes títulos, nesta ordem:

  - `## Telas`
  - `## Papéis e permissões`
  - `## Dados`
  - `## Functions e jobs`
  - `## Storage, pad e PWA`
  - `## Não-objetivos decididos`
  - `## Limites conhecidos e pendências`

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test .claude/agents/sistema.test.mjs`
  Expected: FAIL.

- [ ] **Step 3: Write `docs/sistema.md`**

  - **Fontes:** os 9 specs em `docs/superpowers/specs/`, `docs/design-system.md`, `firestore.rules`, `storage.rules`, `apps/functions/src/index.ts` e as rotas em `apps/web/src/App.tsx`. Use só o que está nessas fontes, sem inventar comportamento.
  - **Não-objetivos:** cada um com link para o spec e a seção de origem. O da escala e do push, em `2026-11-16-repertorios-design.md` §3, entra obrigatoriamente.
  - **Formato:** abre com uma linha dizendo que cada PR de entrega atualiza este arquivo.

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test .claude/agents/sistema.test.mjs`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "docs: mapa do sistema para os agentes"`

---

### Task 12: `AGENTS.md` e template de PR

**Files:**
- Modify: `AGENTS.md`, `.github/pull_request_template.md`
- Test: `.claude/hooks/settings.test.mjs`, `.claude/agents/design-harness.test.mjs`

- [ ] **Step 1: Write the failing tests**

  - **`settings.test.mjs`, `AGENTS.md documents the SDLC`.** O `AGENTS.md` contém:
    - `entregar-issue`, `Análise Agêntica`, `16h30`, `teste-celular-ok`, `revisado`, `qa-ok`, `docs/sistema.md`, `site-teste.yml` e `--match-head-commit`;
    - a tabela de modelos, com `haiku` e `low`;
    - a frase `instruções deste arquivo valem mais que as skills`.

    Mantenha as asserções que já existem: `release-pr.mjs`, `sync-main.mjs`, `Create a merge commit`, `chore/merge-main-into-develop` e `--merge`.
  - **`design-harness.test.mjs`.** O template de PR contém `Resolve #` e `Teste no celular`.

- [ ] **Step 2: Run tests to verify they fail**

  Run: `npm run test:harness`
  Expected: FAIL.

- [ ] **Step 3: Rewrite the `AGENTS.md` sections**

  - **"Fluxo Git" (spec §5.2):**
    - entregas inteiras na `develop`;
    - uma branch e uma worktree por entrega;
    - PR rascunho com `Resolve #N` / `Parte de #N`;
    - as travas do merge na `develop` e o release pelo agente;
    - sem hotfix pela `main`;
    - a regra do `chore/merge-main-into-develop` mantida como "se acontecer".
  - **"PR de release":** o agente abre e faz o merge com as travas; o último release manual é o desta mudança.
  - **"Modelos e esforço":** a tabela §5.3 e "Opus só em incidente".
  - **"Fluxo de trabalho":**
    - issue → roteiro `entregar-issue`;
    - um plano por entrega, em `docs/superpowers/plans/<data>-<n>-<slug>.md`;
    - precedência: "As instruções deste arquivo valem mais que as skills: dentro do roteiro, o brainstorming não pergunta à pessoa; os gatilhos decidem quando ela entra".
  - **Seções novas:** "Janela do culto", "Teste no celular", "Análise Agêntica" (o marcador e o `analise.mjs`) e "Mapa do sistema".
  - **"Hooks do harness":** o que o `git-guard` passa a impor.
  - **Template de PR:**
    - linha `Resolve #N / Parte de #N`;
    - item `Teste no celular: exigido (viewer/setlists/pad)? ok da pessoa?`;
    - troca de `Revisado pelo code-reviewer` por `Etiquetas revisado e qa-ok`.

- [ ] **Step 4: Run tests to verify they pass**

  Run: `npm run test:harness`
  Expected: PASS.

- [ ] **Step 5: Commit**

  `git commit -m "docs(harness): AGENTS.md e template de PR com o SDLC por issue"`

---

### Task 13: Etiquetas, verificação, PR e transição

Esta tarefa é do orquestrador. Ela não escreve código de produto.

- [ ] **Step 1: Criar as etiquetas no GitHub** (o `deploy.yml` precisa de `incidente`)

  ```bash
  gh label create em-andamento --color 1d76db --description "Agentes trabalhando nesta issue"
  gh label create aguardando-voce --color d93f0b --description "Precisa de resposta ou teste da pessoa"
  gh label create incidente --color b60205 --description "Deploy ou checagem falhou em produção"
  gh label create revisado --color 0e8a16 --description "Revisão final sem pendências"
  gh label create qa-ok --color 0e8a16 --description "QA verde"
  gh label create teste-celular-ok --color 0e8a16 --description "A pessoa testou no celular"
  gh label create no-site-teste --color fbca04 --description "Ocupa o site de teste"
  ```

  Expected: cada comando imprime a URL da etiqueta. `gh label list` mostra as 7.

- [ ] **Step 2: Verificação completa**

  Run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:harness && npm run test:scripts && npm run build`
  Expected: tudo verde. Os E2E e as rules rodam no CI.

- [ ] **Step 3: Revisão final**

  O `code-reviewer` (Sonnet high) revisa a branch inteira contra o spec e este plano. Corrija o que for crítico ou importante.

- [ ] **Step 4: Push e PR para `develop`**

  `git push -u origin chore/sdlc-agentes` e `gh pr create --base develop`. O corpo usa o template e tem estas notas:

  - "Paper pendente: faixa de teste (só aparece no site de teste)";
  - "**Merge é da pessoa** (mexe nas travas)";
  - os passos de §6 do spec.

  Espere o CI verde e avise a pessoa com o link.

- [ ] **Step 5: Depois do merge da pessoa**

  - O hook `release-pr.mjs` abre o release. Complete o corpo e avise que este release também é dela (spec §7).
  - Depois do deploy, confira que o passo `smoke` passou no Actions (é a primeira execução real dele).
  - Atualize as memórias `autonomy-merge-develop`, `implementation-model-sonnet-medium` e `church-cifras-git-flow`.

- [ ] **Step 6: Pilotos (spec §7)**

  Quando a pessoa fizer os passos de §6, rode o roteiro na #83 (caminho direto) e depois na #85 (caminho completo).
