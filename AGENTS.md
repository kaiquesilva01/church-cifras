# Church Cifras

Site de cifras (partituras de acordes) para o ministério de louvor de uma igreja: cadastro, transposição de tom e geração de PDF.
Stack: React + Node + Firebase, em monorepo. Documento de design: [docs/superpowers/specs/2026-11-13-church-cifras-design.md](docs/superpowers/specs/2026-11-13-church-cifras-design.md). Fluxo da issue até a produção: [docs/superpowers/specs/2026-11-20-sdlc-agentes-design.md](docs/superpowers/specs/2026-11-20-sdlc-agentes-design.md).

## Fluxo Git

- Nunca commitar direto em `main` nem em `develop`.
- A `develop` só recebe entregas inteiras, por isso está sempre pronta para produção. Só `develop` abre PR para `main`.
- Não há proteção de branch no GitHub: as regras vivem aqui e no hook `git-guard`, que bloqueia violações cometidas por agentes.
- Uma branch e uma worktree por entrega, sempre a partir de `origin/develop`. Branch `<tipo>/<n>-<slug>` (ex.: `feat/95-hora-ensaio`):
  `git fetch origin` e depois `git worktree add -b <tipo>/<n>-<slug> ../<n>-<slug> origin/develop`.
- Prefixos de branch: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `refactor/`.
- Após `git checkout <branch>` (sem `-b`), rode commit/push em outro comando — o hook bloqueia na mesma linha. `git checkout -b` / `git switch -c` podem ser encadeados com commit/push.
- Primeiro push: `git push -u origin <branch>` e PR rascunho para a develop: `gh pr create --base develop --draft --title "<título>" --body-file <arquivo>`. `--base` é obrigatório; o hook bloqueia PR sem base explícita. O corpo segue `.github/pull_request_template.md`, com `Resolve #N` e, em sub-issue, `Parte de #<mãe>`. O CI roda a cada push.
- Antes de entrar na develop: atualizar a branch com `origin/develop` (merge, sem force push e sem rebase); CI verde no head; etiquetas `revisado` e `qa-ok`; `teste-celular-ok` quando a entrega exige. Depois, `gh pr merge <n> --squash --delete-branch`.
- Travas do merge na develop, lidas da `origin/develop` (um PR não afrouxa o próprio hook): CI verde, `revisado`, `qa-ok`, `teste-celular-ok` para viewer, setlists e pad, e nenhuma alteração nas travas (`.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`). Sem uma delas, o merge é bloqueado.
- PR que altera as travas não é mergeado pelo agente: o merge na develop é da pessoa. O agente marca `aguardando-voce` e avisa.
- Subagentes nunca fazem merge. O merge na develop e o release são do orquestrador (a sessão principal).
- Sem hotfix a partir da `main`: correção urgente também entra pela develop, como reversão do squash da entrega culpada (§ Produção e incidente, no roteiro).
- **Merge do release com merge commit** (_Create a merge commit_ / `gh pr merge <n> --merge`), nunca squash nem rebase: com squash a `main` fica com um commit que a `develop` não tem e cada release seguinte exigiu um `chore: merge main into develop` (8 vezes até 2026-11-20). Se acontecer (release com squash ou alteração direta na main), traga a `main` para a `develop` por PR (`chore/merge-main-into-develop`) e faça o merge desse PR com `gh pr merge <n> --merge` (squash não resolve: a `main` continuaria fora do histórico da `develop`) antes do próximo release.

## PR de release (develop → main)

O orquestrador abre o PR e faz o merge, com as travas. O hook de Stop `.claude/hooks/release-pr.mjs` pode já ter aberto o PR; nesse caso o orquestrador completa o corpo. Antes, confira:

- A entrega está **concluída**: todos os PRs dela estão mergeados na `develop`.
- **Testada e validada:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` e `npm run test:harness` verdes; `npm run test:rules` quando mexeu em Rules ou Functions; E2E do CI verde.
- **Revisada:** `code-reviewer` sem pendência crítica nem importante em cada PR; em UI, Paper atualizado e design system respeitado.
- Corpo em pt-BR: `Closes #N` de cada sub-issue e da mãe (esta só no release da última entrega) e de cada `incidente` que o release corrige; o que muda para a pessoa; o que ela deve conferir na produção (passos de teste manual, risco, rollback, mudanças em Rules, índices ou variáveis, ou "nenhuma"); o que ficou de fora; e que o merge é `--merge`, com as travas.
- Merge: espere o CI no head (`gh pr checks <n> --watch`), leia o SHA (`gh pr view <n> --json headRefOid -q .headRefOid`) e faça `gh pr merge <n> --merge --match-head-commit <sha>`, com o SHA literal. Nenhum outro tipo de merge: sem `--squash`, `--rebase`, `--auto`, `-a` nem `--admin`.
- O hook bloqueia o release fora da develop, sem CI verde, na janela do culto ou com incidente aberto que ele não fecha. Nesses casos, registre a causa na Análise da issue (na janela: "Release aguardando a janela") e pare, sem nova tentativa.
- Não aprove o PR (`gh pr review --approve` é bloqueado) e não ative auto-merge. Depois do merge, acompanhe o deploy e a checagem (§ Produção e incidente, no roteiro).
- O release que traz esta mudança do harness é o último release feito à mão: a pessoa faz o merge.

## Janela do culto

- O merge do release é bloqueado nas **quintas e domingos, das 16h30 às 23h59** (America/Sao_Paulo), para o deploy terminar antes das 17h, quando começa o culto. O hook faz isso e o agente não tem como contornar.
- Hora de Brasília, sem depender do fuso da máquina. No bash: `TZ=America/Sao_Paulo date '+%a %H:%M'` (quinta é `Thu`, domingo é `Sun`). No PowerShell: `[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'E. South America Standard Time')` (quinta é `Thursday`, domingo é `Sunday`).
- Se a pessoa precisar publicar dentro da janela, ela mesma faz o merge.
- A volta automática de incidente vale em qualquer horário.

## Teste no celular

- **Quem espera o "ok" da pessoa:** a entrega que altera `apps/web/src/viewer/`, `apps/web/src/setlists/` ou `apps/web/src/pad/`. O hook exige `teste-celular-ok` nesses PRs. O `product-owner` pode acrescentar outros casos, com o motivo na Análise.
- **O resto vai direto para produção.** Se algo depende do aparelho (push, áudio, compartilhamento), o roteiro de teste vai na mensagem final.
- **Site de teste fixo:** `https://louvor-hajaluz-teste.web.app`, com o mesmo login e os dados de produção. Só a interface muda: Rules e Functions são as de produção. A faixa "TESTE · #N" aparece no topo quando o build recebe `VITE_TEST_BANNER`.
- **Fila:** a vez é a etiqueta `no-site-teste`, que só um PR aberto pode ter. Se outro PR a tem, a entrega espera ("na fila do site de teste, depois da #N").
- **Disparo:** sempre a partir da `main`, com `gh workflow run site-teste.yml --ref main -f branch=<branch> -f issue=<n>`. Se o workflow ainda não está na `main` ou o site não está configurado, é passo manual da pessoa (`docs/deploy.md`).
- **A espera é antes do merge na develop.** Se fosse depois, outro release levaria a entrega sem o teste.

## Análise Agêntica

- Cada issue tem a seção **Análise Agêntica** no corpo, abaixo do texto original, que nunca é alterado. O bloco começa no marcador `<!-- analise-agentica: ... -->` (definido em `.claude/skills/entregar-issue/analise.mjs`), e tudo depois dele é reescrito a cada gravação.
- Grave só com `node .claude/skills/entregar-issue/analise.mjs <n> <arquivo.md>`, com o arquivo temporário fora do repositório. Nunca `gh issue edit --body`: ele apaga o texto original.
- Só o orquestrador escreve na issue; os subagentes devolvem texto. Toda etapa atualiza status, etapa, próximo passo e histórico.
- Etiquetas: na issue, `em-andamento`, `aguardando-voce` e `incidente`; no PR, `revisado`, `qa-ok`, `teste-celular-ok` e `no-site-teste`.

## Mapa do sistema

- `docs/sistema.md` resume o que o app faz hoje, para os agentes de negócio lerem antes de refinar uma issue: telas, papéis, dados, Functions e jobs, Storage, pad e PWA, não-objetivos e limites conhecidos. Alvo de até cerca de 300 linhas.
- Cada PR de entrega o atualiza. O `code-reviewer` cobra quando faltar.
- Quando spec e código divergem, vale o código, e a divergência vai em "Limites conhecidos e pendências".

## Fluxo de trabalho

- Issue até produção pelo roteiro `.claude/skills/entregar-issue/SKILL.md`: "desenvolve a #N" entrega a issue inteira; "continua a #N" retoma do "Próximo passo" da Análise; "publica a #N" faz só o release pendente.
- Um plano por entrega, em `docs/superpowers/plans/<data>-<n>-<slug>.md`, escrito pelo `tech-lead` com `writing-plans`, dentro da worktree da entrega.
- As instruções deste arquivo valem mais que as skills: dentro do roteiro, o brainstorming não pergunta à pessoa; os gatilhos decidem quando ela entra. Os gatilhos estão no roteiro (§ Gatilhos); quando um dispara, só a entrega afetada para e a pessoa recebe até 3 perguntas.
- Skills em uso: `subagent-driven-development` com `test-driven-development` (execução), `requesting-code-review` e `verification-before-completion`.

| Agente | Responsabilidade |
| --- | --- |
| `product-owner` | Guarda o spec e os critérios de aceite |
| `designer` | Fidelidade aos mockups, tokens e estados de tela |
| `tech-lead` | Planos por fase, interfaces e divisão de tarefas |
| `frontend-dev` | React/TS em `apps/web` |
| `backend-dev` | Functions, Security Rules, `packages/chords`, Docker/emuladores |
| `qa` | E2E Playwright, PDFs sintéticos, anti-objetivos |
| `code-reviewer` | Revisa cada PR, não edita código |

## Modelos e esforço

| Papel / etapa | Modelo | Effort |
| --- | --- | --- |
| Orquestrador (sessão principal) | Sonnet | medium |
| `product-owner` (negócio, etapa 1) | Sonnet | medium |
| `designer` (experiência, Paper, conferência visual) | Sonnet | medium |
| `tech-lead` (plano, etapa 3) | Haiku | high |
| `frontend-dev` / `backend-dev`: pré-voo | Haiku | high |
| `frontend-dev` / `backend-dev`: implementação | Haiku | low |
| `qa` (etapa 5) | Haiku | low |
| Conferência por tarefa (`code-reviewer`) | Haiku | high |
| Correção após revisão ou QA (1ª e 2ª vez) | Haiku | medium |
| Correção após 2 falhas na mesma tarefa | Sonnet | high |
| `code-reviewer` (revisão final, etapa 6) | Sonnet | high |

- Nomes da tabela viram os parâmetros do `Agent`: `model: "haiku" | "sonnet" | "opus"` e `effort: "low" | "medium" | "high"`. Passe os dois em toda chamada, mesmo quando igual ao padrão, e não herde o modelo da sessão.
- Depois de mais 2 falhas em Sonnet high, pare e pergunte.
- **Opus só em incidente:** deploy ou checagem falhou, rollback falhou, ou bug que impede o uso no culto. Também com pedido explícito da pessoa. Effort `high`, registrado no Histórico. Nenhum agente tem Opus no frontmatter.
- O orquestrador abre em Sonnet por configuração do projeto (`.claude/settings.json`); a pessoa troca com `/model` quando quiser.

## Definição de pronto

- Testes novos escritos antes do código e passando.
- Lint, typecheck e testes verdes.
- Revisão do `code-reviewer` sem pendência crítica nem importante; etiquetas `revisado` e `qa-ok` no PR.
- PR para `develop` com o template preenchido (`Resolve #N` ou `Parte de #N`, teste no celular).
- Mudou texto ou rótulo de UI? Procure o texto antigo nos testes (`git grep "<texto antigo>" -- apps e2e`) e atualize os specs E2E no mesmo PR.

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

## Hooks do harness

Registrados em `.claude/settings.json` e testados por `npm run test:harness`:

- `git-guard.mjs` (PreToolUse, Bash/PowerShell): impõe o fluxo Git acima. Bloqueia commit e push em `main`/`develop`; PR sem `--base`; merge na develop sem as travas; release fora das travas (só `--merge`/`-m`, `--match-head-commit`, título, corpo e `-R`; SHA conferido; CI verde; fora da janela; incidente aberto fechado pelo próprio release); `gh pr merge` com `--auto`/`-a` ou redirecionamento; `gh pr review --approve`; `gh api` que não seja leitura; PDF no commit.
- Produção só sai pelo merge do release: o hook bloqueia `firebase deploy` e `gh workflow run deploy.yml` vindos do agente. `gh workflow run site-teste.yml` só com `--ref main`.
- `release-pr.mjs` (Stop): ao fim de cada turno, abre o PR `develop → main` se o conteúdo das duas difere e não há PR aberto. O corpo diz quem faz o merge e com quais travas. Simular: `RELEASE_PR_DRY_RUN=1`.
- `sync-main.mjs` (SessionStart): num checkout que está na `main` e sem alterações, faz fast-forward para `origin/main`, para que sessões abertas ali carreguem o AGENTS.md e os hooks atuais. Em worktrees de outras branches não faz nada.
- Deploy (`.github/workflows/deploy.yml`): roda em push na `main` que não seja só harness, docs ou testes (`paths-ignore`). A produção publica os sites listados explicitamente em `--only hosting:louvor-hajaluz,hosting:cifras-louvor-5dd50,functions,firestore,storage`. Todo site de produção novo entra nessa lista, inclusive no passo de volta. O site de teste `louvor-hajaluz-teste` nunca entra. Se a pessoa precisar do deploy sem push, ela usa _Run workflow_.
- Checagem depois do deploy: confere a versão do `index.html` (SHA do commit), o JS principal e a página inicial. Se falha, publica de novo o último commit que passou na checagem (último Deploy verde na `main`) e abre a issue `incidente`, que bloqueia o próximo release até um release que a feche.

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
