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
- PRs para `develop`: revisados pelo agente `code-reviewer`; após aprovação, **somente o orquestrador** (sessão principal) faz o merge (`gh pr merge <n> --squash --delete-branch`). Subagentes nunca fazem merge. Isso é regra de conduta: o hook não distingue orquestrador de subagente, só impõe a base (`develop` permitido, `main` bloqueado, base indeterminada bloqueada). Informe sempre o número do PR (`gh pr merge <n> ...`); sem alvo explícito, com mais de um alvo, com `GH_REPO` ou mais de um merge por comando o hook bloqueia. `gh api` é só leitura (GET/graphql query); mutações (`-X` ≠ GET, `-f`/`-F`/`--input`, graphql `mutation`) são bloqueadas — para PRs use `gh pr ...`.
- PR para `main` (`develop → main`): só o humano aprova e faz o merge. O hook bloqueia `gh pr merge` de PR com base `main` ou com base indeterminada.

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
- Áudio (loops/sources do pad, `*.m4a`, `*.mp3`, `*.wav`): ficam em `fixtures/private/pads/` apenas local, enviados ao Storage por `scripts/pads/upload.mjs`.

## Design e Paper

- O padrão visual está em [docs/design-system.md](docs/design-system.md): tokens de cor (tema claro e escuro),
  tipografia, formas, componentes, regras de UX e acessibilidade. **Toda UI nova ou alterada segue esse padrão**;
  não invente cor, raio ou componente fora dele.
- O desenho vive no **Paper** (arquivo "Church - Cifras", id `01M7BN04NKJ00S1T4XVC8HRGRS`). **Mantenha o Paper
  atualizado com o que é desenvolvido**: mudou uma tela, o Paper muda no mesmo PR (escuro e, nas telas raiz, claro).
  Se o Paper MCP estiver indisponível, escreva "Paper pendente: <o que>" no PR e atualize assim que possível.
- Só tokens de cor (`styles.css`), nunca `#hex` solto; token novo entra nos dois temas e na tabela do documento.
- Padrão mudou? Atualize `docs/design-system.md` no mesmo PR (o teste `test:harness` confere que todo token está documentado).
- O `designer` especifica e atualiza o Paper; o `frontend-dev` implementa seguindo o documento; o `code-reviewer`
  barra PR de UI que fuja do padrão ou deixe o Paper desatualizado.

## Convenções

- Conventional Commits em inglês.
- Identificadores de código em inglês; texto de UI e documentação em pt-BR.
- TypeScript `strict` a partir da Fase 1.

## Comandos

- `docker compose up --build` — sobe web (5173), functions (build watch) e emuladores (UI 4000).
- `docker compose down` — encerra o ambiente local.
- Comandos npm no host exigem Node 22 + Java 21; ou rode dentro do contêiner. No Windows sem Java, os testes das rules: `docker compose run --rm --no-deps emulators npm run test:rules` (não use `exec`: conflita com as portas dos emuladores em execução).
- `npm test` — testes de todos os workspaces.
- `npm run lint` — ESLint.
- `npm run typecheck` — TypeScript.
- `npm run test:rules` — testes das Security Rules no emulador.
- `npm run test:harness` — testes do harness (`node --test ".claude/**/*.test.mjs"`).
- `npm run test:scripts` — testes dos scripts locais (`node --test "scripts/**/*.test.mjs"`, p.ex. produção dos loops do pad).
