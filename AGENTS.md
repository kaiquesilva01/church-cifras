# Church Cifras

Site de cifras (partituras de acordes) para o ministério de louvor de uma igreja: cadastro, transposição de tom e geração de PDF.
Stack: React + Node + Firebase, em monorepo. Documento de design: [docs/superpowers/specs/2026-11-13-church-cifras-design.md](docs/superpowers/specs/2026-11-13-church-cifras-design.md).

## Fluxo Git

- Nunca commitar direto em `main` nem em `develop`.
- Toda feature sai de `develop` e volta por PR para `develop`.
- Só `develop` abre PR para `main`.
- Não há proteção de branch no GitHub: as regras vivem aqui e um hook bloqueia violações cometidas por agentes.
- Criar branch: `git checkout -b <tipo>/<nome> origin/develop`
- Abrir PR: `gh pr create --base develop`
- `--base` é obrigatório em `gh pr create`; o hook bloqueia PR sem base explícita.
- Release: `gh pr create --base main --head develop`.
- Após `git checkout <branch>` (sem `-b`), rode commit/push em outro comando — o hook bloqueia na mesma linha. `git checkout -b` / `git switch -c` podem ser encadeados com commit/push.
- Prefixos de branch: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`.
- Merge de PR é decisão humana — agentes nunca rodam `gh pr merge`.

## Modelos e esforço

- Escrita de código: Sonnet 5.5 com effort medium.
- Ao despachar implementação via subagente, passar `model: "sonnet"` e `effort: "medium"`.
- Design, plano e revisão podem usar Opus.

## Fluxo de trabalho

Ordem das skills do superpowers:

1. `brainstorming`
2. `writing-plans`
3. `subagent-driven-development` (ou `executing-plans`), com `test-driven-development`
4. `requesting-code-review`
5. `verification-before-completion`
6. `finishing-a-development-branch`

Um plano por fase da §11 do spec.

| Agente | Responsabilidade |
| --- | --- |
| `product-owner` | Guarda o spec e os critérios de aceite |
| `designer` | Fidelidade aos mockups, tokens e estados de tela |
| `tech-lead` | Planos por fase, interfaces e divisão de tarefas |
| `frontend-dev` | React/TS em `apps/web` |
| `backend-dev` | Functions, Security Rules, `packages/chords`, Docker/emuladores |
| `qa` | E2E Playwright, PDFs sintéticos, anti-objetivos |
| `code-reviewer` | Revisa cada PR, não edita código |

## Definição de pronto

- Testes novos escritos antes do código e passando.
- Lint, typecheck e testes verdes.
- Revisão do `code-reviewer` sem pendências críticas.
- PR para `develop` com o template preenchido.

## Nunca commitar

- PDFs reais: as letras têm direitos autorais. Usar `fixtures/private/` apenas local e PDFs sintéticos na CI.
- Credenciais, `.env` e service accounts.
- `.superpowers/`.

## Convenções

- Conventional Commits em inglês.
- Identificadores de código em inglês; texto de UI e documentação em pt-BR.
- TypeScript `strict` a partir da Fase 1.

## Comandos

- `node --test ".claude/**/*.test.mjs"` — testes do harness.

A Fase 1 adiciona os comandos do monorepo aqui.
