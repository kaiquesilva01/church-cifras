# Fase 0 — Harness e Guard-rails: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o repositório pronto para o trabalho em equipe de agentes: regras do projeto (`AGENTS.md`), os 7 agentes, travas de Git que impõem o fluxo combinado e a proteção contra commit de PDFs reais — sem nenhum código de produto.

**Architecture:** As regras vivem em `AGENTS.md` (fonte única; `CLAUDE.md` só importa). As travas são um hook `PreToolUse` do Claude Code que roda um script Node sem dependências; a lógica de decisão fica num módulo puro testado com `node:test`. Os agentes são arquivos Markdown com frontmatter em `.claude/agents/`, validados por um teste.

**Tech Stack:** Node 24 (`node:test`, `node:assert`, `node:child_process`) — sem dependências npm nesta fase. Claude Code hooks e subagents.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§4 fluxo Git, §10 repositório, §12 harness)

## Global Constraints

- Nenhum commit direto em `main` ou `develop`. Features saem de `develop` e abrem PR para `develop`. Apenas `develop` abre PR para `main`.
- Sem proteção de branches no GitHub: a regra vive no `AGENTS.md` e é imposta aos agentes pelo hook.
- Atualização 2026-11-13: merge de PR para develop passou a ser feito pelo orquestrador após aprovação do code-reviewer; PR para main continua só humano (ver AGENTS.md).
- Repositório **público**: nunca commitar PDFs reais, credenciais, `.env`, service accounts, `.superpowers/`.
- Escrita de código: **Sonnet 5.5, effort `medium`** (`model: sonnet`, `effort: medium` nos agentes `frontend-dev`, `backend-dev`, `qa`).
- Mensagens de commit: Conventional Commits em inglês, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (ou o modelo que de fato escreveu).
- Identificadores de código em inglês; textos de interface e documentação em pt-BR.

## Review Focus

1. **Comandos encadeados** (`git checkout -b feat/x develop && git commit -m ...`): o hook deve avaliar o commit na branch nova, não bloquear — teste `allows commit after checkout -b in same command` (Task 2).
2. **`gh pr create` sem `--base`**: o padrão do GitHub é `main`; deve ser bloqueado pedindo `--base develop` — teste `blocks pr create without explicit base` (Task 2).
3. **Push sem refspec estando em `develop`** (`git push`, `git push -u origin HEAD`): deve bloquear — testes `blocks bare push on protected branch` e `blocks push HEAD on protected branch` (Task 2).
4. **Comandos PowerShell** separados por `;` e com aspas simples: mesma avaliação — teste `handles powershell separators and quotes` (Task 2).
5. **Falha do próprio hook** (git ausente, JSON inválido): não pode travar a sessão inteira — falha aberta com aviso em stderr — teste `fails open on invalid input` (Task 3).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `.gitignore` | Ignorar dependências, segredos, PDFs, dados do emulador, mockups |
| `AGENTS.md` | Regras do projeto para qualquer agente (fonte única) |
| `CLAUDE.md` | Apenas `@AGENTS.md` |
| `README.md` | Visão curta do projeto e link para o design |
| `.github/pull_request_template.md` | Checklist de PR |
| `.claude/hooks/git-guard-rules.mjs` | Módulo puro: decide se um comando shell é permitido |
| `.claude/hooks/git-guard-rules.test.mjs` | Testes do módulo |
| `.claude/hooks/git-guard.mjs` | Entrypoint do hook: lê stdin, consulta git, chama as regras, sai com 0/2 |
| `.claude/hooks/git-guard.test.mjs` | Testes do entrypoint (processo filho) |
| `.claude/settings.json` | Registro do hook `PreToolUse` |
| `.claude/agents/*.md` | 7 agentes |
| `.claude/agents/agents.test.mjs` | Valida frontmatter dos agentes |

---

### Task 1: Branch, regras do projeto e documentos base

**Files:**
- Create: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.github/pull_request_template.md`
- Commit (já existentes, não versionados): `docs/superpowers/specs/2026-11-13-church-cifras-design.md`, `docs/superpowers/plans/2026-11-13-fase-0-harness.md`

**Interfaces:**
- Produces: `AGENTS.md` com as seções que os agentes (Task 4) referenciam por nome: `## Fluxo Git`, `## Modelos e esforço`, `## Fluxo de trabalho`, `## Definição de pronto`, `## Nunca commitar`.

- [ ] **Step 1: Criar a branch a partir de `develop`**

Run: `git fetch origin && git checkout -b chore/harness origin/develop`
Expected: `Switched to a new branch 'chore/harness'`

- [ ] **Step 2: Escrever `.gitignore`**

Deve conter (uma linha cada): `node_modules/`, `dist/`, `coverage/`, `.env`, `.env.*` (com exceção `!.env.example`), `*.log`, `firebase-debug.log*`, `firestore-debug.log*`, `ui-debug.log*`, `.firebase/`, `emulator-data/`, `service-account*.json`, `*-credentials.json`, `.superpowers/`, `fixtures/private/`, `*.pdf`, `.DS_Store`, `Thumbs.db`, `playwright-report/`, `test-results/`.

- [ ] **Step 3: Verificar o `.gitignore`**

Run: `git check-ignore -v fixtures/private/a.pdf x.pdf .env .superpowers/x service-account-prod.json emulator-data/x`
Expected: as 6 linhas aparecem, cada uma com a regra que a ignorou. E `git check-ignore .env.example` não imprime nada (exit 1).

- [ ] **Step 4: Escrever `AGENTS.md` (pt-BR)**

Seções e conteúdo obrigatório:
- `# Church Cifras` — 2 linhas do propósito + link para o spec.
- `## Fluxo Git` — as regras de Global Constraints, os comandos exatos (`git checkout -b <tipo>/<nome> origin/develop`, `gh pr create --base develop`), prefixos de branch `feat/ fix/ chore/ docs/ test/ refactor/`, e: "merge de PR é decisão humana — agentes nunca rodam `gh pr merge`". Avisar que um hook bloqueia violações.
- `## Modelos e esforço` — escrita de código em Sonnet 5.5 effort medium; ao despachar implementação via subagente, passar `model: "sonnet"`, `effort: "medium"`; design/plano/revisão podem usar Opus.
- `## Fluxo de trabalho` — ordem das skills do superpowers: brainstorming → writing-plans → subagent-driven-development (ou executing-plans) com test-driven-development → requesting-code-review → verification-before-completion → finishing-a-development-branch. Um plano por fase da §11 do spec. Tabela de quem faz o quê com os 7 agentes (nome → responsabilidade em uma linha).
- `## Definição de pronto` — testes novos escritos antes do código e passando; lint/typecheck/test verdes; revisão do `code-reviewer` sem pendências críticas; PR para `develop` com template preenchido.
- `## Nunca commitar` — PDFs reais (letras têm direitos autorais; usar `fixtures/private/` local e PDFs sintéticos na CI), credenciais, `.env`, service accounts, `.superpowers/`.
- `## Convenções` — as duas últimas linhas de Global Constraints + TypeScript `strict` a partir da Fase 1.
- `## Comandos` — `node --test .claude/` (testes do harness). Nota: "a Fase 1 adiciona os comandos do monorepo aqui".

- [ ] **Step 5: Escrever `CLAUDE.md`, `README.md` e o template de PR**

`CLAUDE.md` contém exatamente uma linha: `@AGENTS.md`.
`README.md`: título, 3 linhas sobre o produto, link para o spec, link para `AGENTS.md`, aviso "Rodar localmente: disponível a partir da Fase 1".
`.github/pull_request_template.md`: seções `## O quê`, `## Por quê`, `## Como testar localmente`, e checklist: `- [ ] Branch saiu de develop e o PR aponta para develop (ou é develop → main)`, `- [ ] Testes escritos antes do código e passando`, `- [ ] Nenhum PDF real, credencial ou .env no diff`, `- [ ] Revisado pelo code-reviewer`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore AGENTS.md CLAUDE.md README.md .github/pull_request_template.md docs/superpowers/specs/2026-11-13-church-cifras-design.md docs/superpowers/plans/2026-11-13-fase-0-harness.md
git commit -m "docs: add design spec, phase 0 plan and project rules"
```

---

### Task 2: Regras do guard de Git (módulo puro, TDD)

**Files:**
- Create: `.claude/hooks/git-guard-rules.mjs`
- Test: `.claude/hooks/git-guard-rules.test.mjs`

**Interfaces:**
- Produces:
  - `evaluateCommand({ command: string, branch: string, stagedFiles: string[] }): { allow: true } | { allow: false, reason: string }`
  - `PROTECTED_BRANCHES = ['main', 'develop']`
  - `reason` sempre em pt-BR e sempre inclui o comando correto a usar.

- [ ] **Step 1: Escrever os testes que falham**

Cada caso é `assert.deepEqual(evaluateCommand({...}).allow, <esperado>)`. Nos bloqueios, assert também que `reason` contém o trecho indicado.

| Teste | command | branch | staged | allow | reason contém |
|---|---|---|---|---|---|
| `blocks commit on main` | `git commit -m "x"` | `main` | `[]` | false | `origin/develop` |
| `blocks commit on develop` | `git commit -am "x"` | `develop` | `[]` | false | `origin/develop` |
| `allows commit on feature branch` | `git commit -m "x"` | `feat/a` | `[]` | true | |
| `allows commit after checkout -b in same command` | `git checkout -b feat/x origin/develop && git commit -m "x"` | `develop` | `[]` | true | |
| `allows commit after switch -c in same command` | `git switch -c fix/y && git commit -m y` | `main` | `[]` | true | |
| `blocks commit with staged pdf` | `git commit -m x` | `feat/a` | `['fixtures/a.pdf']` | false | `PDF` |
| `blocks pdf case-insensitively` | `git commit -m x` | `feat/a` | `['A.PDF']` | false | `PDF` |
| `blocks push to main refspec` | `git push origin main` | `feat/a` | `[]` | false | `develop` |
| `blocks push HEAD:develop` | `git push origin HEAD:develop` | `feat/a` | `[]` | false | `develop` |
| `blocks push refs/heads/main` | `git push origin feat/a:refs/heads/main` | `feat/a` | `[]` | false | `develop` |
| `blocks bare push on protected branch` | `git push` | `develop` | `[]` | false | `develop` |
| `blocks push HEAD on protected branch` | `git push -u origin HEAD` | `develop` | `[]` | false | `develop` |
| `allows push of feature branch` | `git push -u origin feat/a` | `feat/a` | `[]` | true | |
| `blocks force push to protected` | `git push --force origin develop` | `feat/a` | `[]` | false | `develop` |
| `blocks pr create without explicit base` | `gh pr create --title t --body b` | `feat/a` | `[]` | false | `--base develop` |
| `allows pr create to develop` | `gh pr create --base develop --title t` | `feat/a` | `[]` | true | |
| `allows pr create with -B develop` | `gh pr create -B develop -t t` | `feat/a` | `[]` | true | |
| `blocks pr to main from feature` | `gh pr create --base main` | `feat/a` | `[]` | false | `develop` |
| `blocks pr to main with --head feature` | `gh pr create --base=main --head feat/a` | `develop` | `[]` | false | `develop` |
| `allows pr develop to main` | `gh pr create --base main --head develop` | `feat/a` | `[]` | true | |
| `allows pr to main when on develop` | `gh pr create --base main` | `develop` | `[]` | true | |
| `blocks gh pr merge` | `gh pr merge 12 --squash` | `feat/a` | `[]` | false | `humana` |
| `handles powershell separators and quotes` | `git add .; git commit -m 'msg; with semicolon'` | `main` | `[]` | false | `origin/develop` |
| `ignores git words inside quoted text` | `echo "git commit on main" && ls` | `main` | `[]` | true | |
| `allows unrelated commands` | `npm test` | `main` | `[]` | true | |

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
Expected: FAIL — `Cannot find module` / `evaluateCommand is not a function`.

- [ ] **Step 3: Implementar `evaluateCommand` em `.claude/hooks/git-guard-rules.mjs`**

Abordagem: tokenizar respeitando aspas simples e duplas; dividir em segmentos em `&&`, `||`, `;`, `|` e quebras de linha **fora de aspas**; percorrer os segmentos mantendo `effectiveBranch` (começa em `branch`; `git checkout -b|-B <n>`, `git switch -c|-C <n>`, `git checkout <n>`, `git switch <n>` atualizam). Para cada segmento: `git commit` → regra de branch protegida + PDFs staged (`/\.pdf$/i`); `git push` → refspecs posicionais após o remote (destino = parte após `:`, sem `refs/heads/`), ou `effectiveBranch` se não houver refspec / refspec `HEAD`; `gh pr create` → `--base|-B` (aceitar `--base=x`), `--head|-H` ou `effectiveBranch`; `gh pr merge` → sempre bloqueia. Primeiro bloqueio encontrado vence.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test .claude/hooks/git-guard-rules.test.mjs`
Expected: PASS — 25 testes, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/git-guard-rules.mjs .claude/hooks/git-guard-rules.test.mjs
git commit -m "feat(harness): add git guard rules for branch flow and pdf protection"
```

---

### Task 3: Entrypoint do hook e registro no Claude Code

**Files:**
- Create: `.claude/hooks/git-guard.mjs`, `.claude/settings.json`
- Test: `.claude/hooks/git-guard.test.mjs`

**Interfaces:**
- Consumes: `evaluateCommand` (Task 2).
- Produces: hook `PreToolUse` com matcher `Bash|PowerShell`. Contrato do Claude Code: recebe JSON no stdin com `tool_input.command` e `cwd`; **exit 2 + motivo em stderr** bloqueia; exit 0 permite.

- [ ] **Step 1: Escrever os testes que falham**

Os testes executam o script como processo filho (`spawnSync('node', [script], { input, cwd })`) dentro de um repositório git temporário criado no teste (`git init -b main`, commit vazio).

- `blocks commit on main via stdin`: input `{"tool_input":{"command":"git commit -m x"},"cwd":<tmp>}` → `status === 2`, `stderr` contém `origin/develop`.
- `allows commit on feature branch via stdin`: após `git checkout -b feat/a` no tmp → `status === 0`.
- `blocks staged pdf via stdin`: em `feat/a`, criar `a.pdf`, `git add -f a.pdf` → `status === 2`, `stderr` contém `PDF`.
- `fails open on invalid input`: input `not json` → `status === 0`, `stderr` contém `git-guard`.
- `allows non-git commands`: `{"tool_input":{"command":"ls"}}` → `status === 0`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test .claude/hooks/git-guard.test.mjs`
Expected: FAIL — script não existe.

- [ ] **Step 3: Implementar `.claude/hooks/git-guard.mjs`**

Ler todo o stdin; `JSON.parse`; se o comando não contém `git` nem `gh` → exit 0 sem consultar o git. Senão obter `branch` com `git rev-parse --abbrev-ref HEAD` e `stagedFiles` com `git diff --cached --name-only` (ambos com `cwd` do input, ou `process.cwd()`); chamar `evaluateCommand`; bloqueio → `process.stderr.write('[git-guard] ' + reason)` e exit 2. Qualquer exceção → stderr `[git-guard] aviso: não foi possível avaliar (<erro>); comando permitido` e exit 0.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test .claude/hooks/`
Expected: PASS — testes das Tasks 2 e 3, 0 falhas.

- [ ] **Step 5: Registrar o hook em `.claude/settings.json`**

Consultar a skill `update-config` para o formato atual. Conteúdo esperado:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/git-guard.mjs\"" }]
      }
    ]
  }
}
```

- [ ] **Step 6: Verificar o hook na sessão real**

Abrir `/hooks` para confirmar o registro (ou reiniciar a sessão). Depois, estando em `chore/harness`, pedir ao agente que rode `git push origin develop --dry-run`.
Expected: a ferramenta é bloqueada com `[git-guard] ...develop...`. Se `$CLAUDE_PROJECT_DIR` não expandir no Windows, trocar para caminho relativo `node .claude/hooks/git-guard.mjs` e repetir.

- [ ] **Step 7: Commit**

```bash
git add .claude/hooks/git-guard.mjs .claude/hooks/git-guard.test.mjs .claude/settings.json
git commit -m "feat(harness): enforce git flow via PreToolUse hook"
```

---

### Task 4: Os 7 agentes

**Files:**
- Create: `.claude/agents/product-owner.md`, `designer.md`, `tech-lead.md`, `frontend-dev.md`, `backend-dev.md`, `qa.md`, `code-reviewer.md`
- Test: `.claude/agents/agents.test.mjs`

**Interfaces:**
- Consumes: seções do `AGENTS.md` (Task 1).
- Produces: tipos de subagente `product-owner`, `designer`, `tech-lead`, `frontend-dev`, `backend-dev`, `qa`, `code-reviewer`, usados pelos planos das fases seguintes.

| Agente | model | effort | tools | Responsabilidade (corpo do arquivo) |
|---|---|---|---|---|
| `product-owner` | opus | — | Read, Grep, Glob, Write, Edit | Guarda o spec; transforma fases em critérios de aceite verificáveis; responde dúvidas de escopo citando o spec; recusa escopo fora dos objetivos/não-objetivos |
| `designer` | opus | — | (herda todas, inclui Paper MCP) | Fiel aos mockups aprovados (§6.10); mobile-first; define tokens (cor, tipo, espaço) e estados (vazio, carregando, erro); entrega especificação de tela, não código de produto |
| `tech-lead` | opus | — | Read, Grep, Glob, Bash, Write, Edit | Escreve/ajusta planos por fase; decide interfaces entre pacotes; divide tarefas paralelas entre `frontend-dev` e `backend-dev`; guarda arquitetura do spec §5–§9 |
| `frontend-dev` | sonnet | medium | Read, Grep, Glob, Bash, Write, Edit | React + TS em `apps/web`; TDD com Vitest/Testing Library; lazy-load de pdf.js/pdf-lib; segue o designer |
| `backend-dev` | sonnet | medium | Read, Grep, Glob, Bash, Write, Edit | Functions em `apps/functions`, Security Rules, `packages/chords`, Docker/emuladores; TDD; rules-unit-testing |
| `qa` | sonnet | medium | Read, Grep, Glob, Bash, Write, Edit | Playwright E2E contra emuladores; PDFs sintéticos; testa os anti-objetivos do spec §3; reporta com passos de reprodução |
| `code-reviewer` | opus | — | Read, Grep, Glob, Bash | Revisa cada PR contra spec, plano e `AGENTS.md`; prioriza correção, segurança (rules), performance, legibilidade; não edita código; classifica achados (crítico/importante/sugestão) |

Todo corpo começa com: "Leia `AGENTS.md` antes de qualquer ação." e termina com a "Definição de pronto" do papel em 3–5 itens.

- [ ] **Step 1: Escrever o teste que falha**

`.claude/agents/agents.test.mjs` (`node:test`), com parser de frontmatter simples (`---` … `---`, linhas `chave: valor`):
- `has the seven agents`: os 7 arquivos existem.
- `every agent has name matching file and a description`: `name === basename` e `description.length >= 40`.
- `implementers run on sonnet medium`: para `frontend-dev`, `backend-dev`, `qa` → `model === 'sonnet'` e `effort === 'medium'`.
- `every agent points to AGENTS.md`: o corpo contém `AGENTS.md`.
- `reviewer cannot edit`: `code-reviewer.tools` não contém `Write` nem `Edit`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test .claude/agents/agents.test.mjs`
Expected: FAIL — arquivos não existem.

- [ ] **Step 3: Escrever os 7 arquivos conforme a tabela**

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test .claude/`
Expected: PASS — todos os testes do harness, 0 falhas.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/
git commit -m "feat(harness): add product, design, tech lead, dev, qa and reviewer agents"
```

---

### Task 5: Revisão e PR para `develop`

**Files:** nenhum novo.

- [ ] **Step 1: Verificação final**

Run: `node --test .claude/` → PASS, 0 falhas.
Run: `git ls-files | grep -iE "\.pdf$|\.env$|service-account|\.superpowers"` → nenhuma saída.

- [ ] **Step 2: Revisão pelo `code-reviewer`**

Despachar o agente `code-reviewer` sobre `git diff origin/develop...HEAD`. Corrigir achados críticos/importantes (commits `fix(harness): ...`).

- [ ] **Step 3: Push e PR**

```bash
git push -u origin chore/harness
gh pr create --base develop --title "chore: harness, guard-rails e agentes (Fase 0)" --body-file <corpo preenchido a partir do template>
```
Expected: URL do PR apontando para `develop`. O merge fica com o dono do projeto.

---

## Próximos planos (um por fase, escritos após o merge da anterior)

1. Esqueleto do monorepo, Docker/emuladores, CI, deploy preparado
2. Auth + papéis
3. `packages/chords`
4. Upload + busca
5. Visualizador + Mudar tom
6. Administração + importação em lote
7. PWA, performance, E2E
