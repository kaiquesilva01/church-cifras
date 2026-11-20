---
name: entregar-issue
description: Roteiro do orquestrador para levar uma issue até produção com a rede de agentes. Use quando a pessoa disser "desenvolve a #N", "continua a #N", "publica a #N" ou /entregar-issue N.
---

# Entregar issue: da issue à produção

Roteiro para você, o orquestrador (a sessão principal). Os subagentes fazem o trabalho de cada etapa. Você coordena, grava na issue, confere as travas e decide o que espera a pessoa. O texto para a pessoa sai em pt-BR.

## Quando usar

- "desenvolve a #N" ou `/entregar-issue N`: entrega a issue inteira (etapas 0 a 9).
- "continua a #N": retoma pela Análise Agêntica da issue (etapa 0, "Próximo passo").
- "publica a #N": só o release pendente (§ Git, Release).
- Pedido sem issue: abra a issue primeiro, com o texto da pessoa (`gh issue create --title "<título>" --body-file <arquivo>`), e siga o mesmo fluxo.

## Precedência

As instruções do projeto (`AGENTS.md`) valem mais que as skills. Dentro deste roteiro, **não use o `brainstorming` para perguntar à pessoa**: as etapas 1 e 2 fazem esse papel, e os gatilhos (§ Gatilhos) decidem quando ela entra. Continuam em uso: `writing-plans` (tech-lead), `subagent-driven-development` com `test-driven-development` (execução), `requesting-code-review` e `verification-before-completion`.

## Regras que não se quebram

- **Só o orquestrador escreve na issue.** Subagentes devolvem texto; você grava.
- **Grave sempre pelo CLI:** `node .claude/skills/entregar-issue/analise.mjs <n> <arquivo.md>`. Nunca `gh issue edit --body`: ele apaga o texto original da pessoa.
- **Toda etapa termina atualizando a Análise Agêntica:** status, etapa, próximo passo e histórico.
- **Modelo e effort em toda chamada ao `Agent`**, conforme § Modelos, mesmo quando igual ao padrão. Não herde o modelo da sessão.
- **A partir da etapa 3 (worktree criada), toda chamada ao `Agent` leva o caminho absoluto da worktree da entrega** e a ordem de trabalhar só nela. Um plano escrito no checkout principal cai na branch errada. Nas etapas 1 e 2 os agentes só leem o repositório e devolvem texto, sem escrever arquivos.
- **Produção só sai pelo merge do release.** Nunca `firebase deploy` nem `gh workflow run deploy.yml`: o hook bloqueia.
- **Trabalhe com as travas, não ao redor delas.** Se o hook bloquear, a mensagem diz o que falta. Não contorne.
- **`gh pr merge` é comando simples:** sem redirecionamento, sem `$(...)`, sem `--auto` ou `-a`, sem `--subject` nem `--body`. Para o SHA, rode `gh pr view <n> --json headRefOid -q .headRefOid` antes e cole o valor literal no merge.

## Modelos e esforço (§5.3)

| Papel / etapa | Modelo | Effort |
|---|---|---|
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

- Nomes da tabela viram os parâmetros do `Agent`: `model: "haiku" | "sonnet" | "opus"` e `effort: "low" | "medium" | "high"`.
- A conferência por tarefa é o `code-reviewer` com `model: "haiku"` e `effort: "high"`, que sobrescrevem o Sonnet do frontmatter. A revisão final usa `model: "sonnet"` e `effort: "high"`.
- Depois de mais 2 falhas em Sonnet high, pare e pergunte (§ Gatilhos).
- **Opus** só em incidente de produção (deploy ou checagem falhou, rollback falhou, bug que impede o uso no culto) ou com pedido explícito da pessoa. Nunca em trabalho de rotina. O spec não fixa o effort do Opus: use `high` e registre no Histórico.

## Etapa 0: início

1. **Release pendente e incidente vêm antes de tudo.** `gh pr list --base main --head develop --state open` (release aberto ou preso) e `gh issue list --label incidente --state open`. Release pendente: § Git, Release. Incidente: § Produção e incidente.
2. Leia a issue e os comentários: `gh issue view <n> --comments`.
3. **Retome ou crie a seção.** Se o corpo já tem o marcador da Análise Agêntica, retome do "Próximo passo" e confira branches e PRs (`gh pr list --search "<n>" --state all`). Se a pessoa mudou o texto original desde a última análise, registre no Histórico e reavalie. Se não há seção, crie-a com o status "Em andamento".
4. Etiqueta `em-andamento`: `gh issue edit <n> --add-label em-andamento`. Se a etiqueta não existir, crie-a antes com `gh label create`.

## Etapas

### 1. Negócio e experiência
- `product-owner` lê a issue, o `docs/sistema.md` (se ainda não existir, os specs que tocam o assunto) e propõe: entendimento (problema, quem ganha, como saber que deu certo), critérios de aceite verificáveis, entregas, decisões com motivo, gatilhos atingidos e riscos.
- `designer` (fluxo, telas, estados, celular, acessibilidade) e `tech-lead` (viabilidade, custo, limites do Firebase, impacto em Rules e dados, tamanho) criticam a proposta **em paralelo, numa rodada só**: as duas chamadas no mesmo bloco.
- `product-owner` consolida. Você grava a seção, cria as sub-issues (§ Análise Agêntica) e aplica os gatilhos.

### 2. Design (se a entrega tem tela)
- `designer` atualiza o Paper: escuro sempre; claro nas telas raiz; estados vazio, carregando e erro.
- Resuma a especificação da tela na seção da sub-issue.
- Paper indisponível: escreva "Paper pendente: <o que>" na seção e no PR, e siga.

### 3. Refinamento técnico
- Antes do plano, crie a branch e a worktree da entrega (§ Git, Entregas). O plano é escrito dentro da worktree, nunca no checkout principal.
- `tech-lead` escreve o plano em `docs/superpowers/plans/<data>-<n>-<slug>.md` com `writing-plans`: código exato em cada passo, teste antes do código, arquivos de cada tarefa e grupos que podem andar em paralelo sem dividir arquivos. Você commita e abre o PR rascunho (§ Git, Primeiro push).
- Pré-voo: `frontend-dev` e `backend-dev` leem as suas tarefas e apontam lacunas. `tech-lead` corrige numa rodada só.

### 4. Desenvolvimento
- Execução com `subagent-driven-development` e `test-driven-development`. Para cada tarefa do plano: implementação (`frontend-dev` ou `backend-dev`, Haiku low) e, depois, conferência pelo `code-reviewer` (Haiku high).
- Devs em paralelo só quando não mexem nos mesmos arquivos.
- Correção após revisão ou QA: Haiku medium; após 2 falhas, Sonnet high; após mais 2, pare e pergunte.
- Atualize a seção depois de cada tarefa: o que passou e o que falta.

### 5. QA
- `qa` escreve e roda E2E (Playwright, emuladores, PDFs sintéticos) para cada critério de aceite.
- Com tela: `designer` compara prints de 390 px, no escuro e no claro, com o Paper.
- Tudo verde: `gh pr edit <n> --add-label qa-ok`.

### 6. Revisão final
- `code-reviewer` (Sonnet high) revisa o PR inteiro contra os critérios, o `AGENTS.md`, o design system e o `docs/sistema.md`, que deve estar atualizado no PR da entrega.
- Ciclo de correção e nova revisão até não sobrar pendência crítica nem importante. Então: `gh pr edit <n> --add-label revisado`.

### 7. Teste no celular
- Só quando § Teste no celular exige. Se não exige, registre "sem teste no celular: não altera viewer, setlists nem pad".

### 8. Entrada na develop, release e produção
- § Git (Antes de entrar na develop e Release) e § Produção e incidente.

### 9. Fechamento
- § Fechamento.

## Gatilhos e como parar (§5.1)

Pare e pergunte quando a entrega:

1. cria dado novo sobre pessoas (escala, telefone, disponibilidade, contato);
2. muda o que um papel (admin, membro etc.) vê ou faz;
3. gera custo no Firebase ou no Google Cloud (API nova, função agendada, armazenamento relevante);
4. depende de um passo manual da pessoa (chave, IAM, console, upload, backfill, configuração de domínio);
5. contraria um não-objetivo escrito em algum spec;
6. mexe em dado de produção sem volta (migração, exclusão, mudança de formato);
7. altera as travas ou o processo: `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md` ou `CLAUDE.md`. Nesse caso a pessoa faz o merge na `develop`; o resto segue.

Também param quando uma tarefa falha duas vezes em Sonnet high. Fora dos gatilhos, os agentes decidem e você registra cada decisão, com o motivo, em "Decisões".

**Como parar:**
- Só a entrega afetada para. As outras entregas e issues continuam.
- Até 3 perguntas por vez. Cada uma traz as opções, o que cada uma implica e a recomendação dos agentes.
- Três sinais: o status vira "🟡 Aguardando você · N perguntas (desde dd/mm hh:mm)"; a issue ganha `aguardando-voce`; um `PushNotification` curto, por exemplo "#85: 2 perguntas sobre escala".
- A resposta vem no chat ou num comentário da issue. Grave em "Decisões" com "quem: você". Quando não sobrar pergunta: `gh issue edit <n> --remove-label aguardando-voce`.

## Análise Agêntica (§5.5)

A seção fica abaixo do texto original. Tudo depois do marcador é reescrito a cada gravação. Esqueleto:

```markdown
<texto original da issue, nunca alterado>

---
<!-- analise-agentica: tudo abaixo é escrito pelos agentes; o texto acima nunca é alterado -->
## Análise Agêntica

**Status:** 🟡 Aguardando você · 2 perguntas (desde 21/11 14:05)
**Etapas:** Negócio ✅ · Design ✅ · Plano ⏳ · Desenvolvimento · QA · Revisão · Produção
**Próximo passo:** tech-lead escrevendo o plano da #95

### Perguntas para você
1. <pergunta> · <opção A> (<implica>) · <opção B> (<implica>) · recomendação: <qual>

### Entendimento
### Entregas
- [ ] #95 Hora do ensaio no repertório · em desenvolvimento · PR #97
### Critérios de aceite
### Decisões
| Decisão | Motivo | Quem |
### Riscos e limites
### Design
### Plano, PRs e testes
### Produção
### Roteiro de teste no celular
### Lições
<details><summary>Histórico</summary>
- 21/11 13:02 · início (orquestrador Sonnet)
</details>
```

**Como gravar:**
1. Escreva a seção num arquivo temporário fora do repositório (a pasta de scratchpad da sessão). Ela começa em `## Análise Agêntica`. **Não** inclua o marcador nem a linha `---`: a ferramenta os põe.
2. Grave com `node .claude/skills/entregar-issue/analise.mjs <n> <arquivo.md>`.
3. A ferramenta mantém o texto original, troca tudo depois do marcador e recusa mais de 65.536 caracteres. Como a troca é da seção inteira, releia a seção atual (`gh issue view <n> --json body -q .body`) e reescreva também o que não mudou.
4. Passou do limite: resuma o Histórico antigo e ponha as partes longas em `<details>`.

**Sub-issues:** o corpo começa com "Parte de #<mãe>" e uma descrição curta do `product-owner`, seguida da própria Análise (plano, PR, testes, produção). A issue-mãe mostra uma linha por entrega em "Entregas".

**Histórico:** uma linha por etapa, no formato `dd/mm hh:mm · etapa · quem · resultado`.

**Etiquetas:** na issue, `em-andamento`, `aguardando-voce` e `incidente`. No PR, `revisado`, `qa-ok`, `teste-celular-ok` e `no-site-teste`.

## Git (§5.2)

**Regra central:** a `develop` só recebe entregas inteiras, por isso está sempre pronta para produção.

### Entregas e branches
- Issue grande vira entregas que vão para produção sozinhas, cada uma útil ou inofensiva. Issue pequena é uma entrega só: a própria issue.
- Se uma entrega muda backend (Rules, Functions, dados) e uma tela de culto, o backend vai antes, em entrega própria.
- Cada entrega tem a sua branch `<tipo>/<n>-<slug>` e a sua worktree, a partir de `origin/develop`:
  ```
  git fetch origin
  git worktree add -b <tipo>/<n>-<slug> ../<n>-<slug> origin/develop
  git -C ../<n>-<slug> rev-parse --show-toplevel
  ```
  Ex.: `feat/95-hora-ensaio`. A última linha dá o caminho absoluto, que vai em todo prompt de subagente.

### Primeiro push
- `git push -u origin <branch>` e PR rascunho para a `develop`: `gh pr create --base develop --draft --title "<título>" --body-file <arquivo>`. O corpo segue `.github/pull_request_template.md`, com `Resolve #<n>` e, em sub-issue, `Parte de #<mãe>`.
- O CI roda a cada push.

### Antes de entrar na develop
1. Atualize a branch com a develop: `git fetch origin` e `git merge origin/develop`. Sem force push e sem rebase.
2. CI verde no head: `gh pr checks <n> --watch`.
3. Etiquetas `revisado` (§6) e `qa-ok` (§5). Se a entrega exige, `teste-celular-ok` (§ Teste no celular), depois do "ok" da pessoa.
4. `gh pr ready <n>`: o PR sai do rascunho.
5. Se a entrega é do site de teste, tire `no-site-teste`: `gh pr edit <n> --remove-label no-site-teste`.
6. Merge: `gh pr merge <n> --squash --delete-branch`. Depois, `git worktree remove ../<n>-<slug>`.

O hook recusa o merge sem CI verde, sem `revisado` e `qa-ok`, ou sem `teste-celular-ok` quando o PR mexe em viewer, setlists ou pad. Se o PR mexe nas travas (§ Gatilhos, item 7), não faça o merge: marque `aguardando-voce` e avise.

### Release
Depois que as entregas estão na develop:
1. Abra ou atualize o PR `develop → main`: `gh pr create --base main --head develop --title "<título>" --body-file <arquivo>`, ou `gh pr edit <n> --body-file <arquivo>` se o hook de Stop já o abriu. Antes, rode `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` e `npm run test:harness`, e `npm run test:rules` se mexeu em Rules ou Functions. O E2E é o do CI.
   O corpo, em pt-BR, traz:
   - `Closes #<sub>` de cada sub-issue entregue. `Closes #<mãe>` só no release que leva a última entrega da mãe. `Closes #<incidente>` para cada `incidente` aberto que este release corrige (sem isso o hook bloqueia; § Produção e incidente).
   - o que muda para a pessoa; o que ela deve conferir (passos de teste manual); risco; rollback; mudanças em Rules, índices ou variáveis (ou "nenhuma"); o que ficou de fora;
   - os checks rodados, e que o merge é feito pelo agente com `--merge` e as travas;
   - a conferência feita: `code-reviewer` revisou cada PR da entrega, sem pendência crítica nem importante aberta;
   - em mudança de UI: Paper atualizado (ou "Paper pendente" com o motivo) e design system respeitado;
   - a entrega concluída: todos os PRs dela estão mergeados na develop.
2. Espere o CI no head: `gh pr checks <n> --watch`.
3. Janela do culto: quinta ou domingo, das 16h30 às 23h59 (America/Sao_Paulo), o merge é bloqueado. Confira a hora com o comando de § Janela do culto. Se o hook recusar o merge mesmo assim, registre "Release aguardando a janela" na Análise e pare, sem nova tentativa.
4. Leia o SHA em comando próprio: `gh pr view <n> --json headRefOid -q .headRefOid`.
5. Merge: `gh pr merge <n> --merge --match-head-commit <sha>`, com o SHA literal. Nenhuma outra flag de merge ou de mensagem.
6. Acompanhe a produção (§ Produção e incidente).

- **Sem squash nem rebase na `main`.** Por isso o release é `--merge`. Com squash, a `main` ganha um commit que a `develop` não tem.
- **Sem hotfix a partir da `main`.** Correção urgente também entra pela develop.
- **Paralelismo:** outra sessão pode já ter levado a entrega. Antes do release, confira se a issue já está fechada; se sim, só atualize a seção.

## Teste no celular (§5.6)

- **Quem espera o "ok":** entrega que altera `apps/web/src/viewer/`, `apps/web/src/setlists/` ou `apps/web/src/pad/`. O `product-owner` pode acrescentar outros casos, com o motivo na seção.
- **O resto vai direto para produção.** Se algo depende do aparelho (push, áudio, compartilhamento), o roteiro de teste vai na mensagem final.
- **Site de teste fixo:** `https://louvor-hajaluz-teste.web.app`. Usa o mesmo login e os dados de produção. Só a interface muda: Rules e Functions são as de produção. Uma faixa "TESTE · #N" aparece no topo quando o build recebe `VITE_TEST_BANNER`.
- **Fila:** o site mostra uma entrega por vez, e a vez é a etiqueta `no-site-teste`, que só um PR aberto pode ter. Antes de pegá-la: `gh pr list --label no-site-teste --state open`. Se outro PR já a tem, a seção diz "na fila do site de teste, depois da #N" e a entrega espera.
- **Fluxo:**
  1. A branch está atualizada com a develop e o CI passou.
  2. Pré-condição: `gh workflow view site-teste.yml` precisa achar o workflow no `main`. Se não achar, ou a execução falhar porque o site ou o domínio não estão configurados, registre "passo manual seu" (gatilho 4) com os passos do site de teste em `docs/deploy.md` (se a seção ainda não existir, os passos da §6 do spec), marque `aguardando-voce` e avise com `PushNotification`.
  3. Pegue a vez (`gh pr edit <n> --add-label no-site-teste`) e dispare **sempre a partir da `main`**: `gh workflow run site-teste.yml --ref main -f branch=<branch> -f issue=<n>`. Um job sem segredos faz o build da branch; outro só publica no Hosting do site de teste. Acompanhe com `gh run list --workflow site-teste.yml --limit 1` e `gh run watch <id>`.
  4. A seção ganha o roteiro, o status vira "📱 Pronto para testar", a issue ganha `aguardando-voce` e sai um `PushNotification`.
  5. "ok" da pessoa: `gh pr edit <n> --add-label teste-celular-ok` e registre em "Decisões" com "quem: você". Problema descrito: tire `no-site-teste` (`--remove-label`), volte a entrega para correção (etapa 4) e refaça o fluxo a partir do passo 1, para novo deploy no site de teste.
- **O roteiro que a pessoa recebe começa com esta frase, sem mudança:**
  > O site de teste usa os dados de produção: não crie, altere nem apague dados reais além do que o roteiro pede.

  Depois vêm 2 ou 3 passos de teste.
- A espera é **antes** do merge na develop. Se fosse depois, outro release levaria a entrega sem o teste.

## Janela do culto (§5.7)

- **Regra:** o merge do release é bloqueado nas **quintas e domingos, das 16h30 às 23h59** (America/Sao_Paulo), para o deploy terminar antes das 17h, quando começa o culto. O hook faz isso e não há como contornar.
- Hora de Brasília, sem depender do fuso da máquina. No bash: `TZ=America/Sao_Paulo date '+%a %H:%M'` (quinta é `Thu`, domingo é `Sun`). No PowerShell: `[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'E. South America Standard Time')` (quinta é `Thursday`, domingo é `Sunday`).
- Se a pessoa precisar publicar nessa janela, ela mesma faz o merge.
- A volta automática de incidente (§ Produção e incidente) vale em qualquer horário.

## Produção e incidente (§5.8)

**Checagem depois do deploy:** o `index.html` traz o SHA do commit (`<meta name="app-version">`) e a checagem espera a versão bater; o JS principal responde 200; a página inicial, sem login, carrega sem erro de página.

**Acompanhar o deploy:**
1. Ache a execução do release: `gh run list --workflow deploy.yml --json databaseId,headSha,status,conclusion` e pegue a de `headSha` igual ao `mergeCommit` do PR (`gh pr view <n> --json mergeCommit -q .mergeCommit.oid`).
2. Espere: `gh run watch <id> --exit-status`.
3. **Sem execução para esse SHA:** o release só mexeu em caminhos do `paths-ignore` de `deploy.yml` (`.claude/**`, `docs/**`, `*.md`, `.github/pull_request_template.md`, `.github/workflows/ci.yml`, `e2e/**`, `tests/**`). Confira com `git diff --name-only origin/main...origin/develop` e registre "sem deploy (só harness/docs)".
4. **Verde, mas com o aviso "Deploy ignorado: produção ainda não configurada":** não publicou. Confirme com `gh run view <id> --log`. Isso é incidente a reportar, não sucesso: registre "Produção: NÃO publicado" na Análise, avise a pessoa com `PushNotification` e não feche a entrega.
5. Atualize a seção "Produção" a cada passo.

**Se a checagem falhar** (o workflow faz sozinho): publica de novo o último commit que passou na checagem (último Deploy verde na `main`), nos mesmos alvos; abre uma issue `incidente` com os links da execução; deixa o workflow vermelho, e o GitHub manda e-mail à pessoa.

**Incidente (etapa 0 ou falha acima):**
1. Enquanto houver issue `incidente` aberta, o hook bloqueia o release na `main`. A exceção é o release que a fecha, com `Closes #<incidente>` no corpo.
2. Diagnóstico com Opus, só em incidente: `model: "opus"`, effort `high`.
3. Reversão **na develop**, nunca a partir da `main`: `git revert <sha>` do squash da entrega culpada (`gh pr view <n> --json mergeCommit -q .mergeCommit.oid`), numa branch `fix/<incidente>-reverte-<slug>` a partir de `origin/develop`. O PR segue o fluxo normal (CI, `revisado`, `qa-ok`), e o release dele leva `Closes #<incidente>`.
4. Reabra a issue da entrega revertida (`gh issue reopen <n>`) e volte a entrega para correção: `gh issue edit <n> --add-label em-andamento`.
5. Registre o incidente na Análise de cada issue afetada.

Dado já gravado no formato novo não volta. Por isso "dado sem volta" é gatilho de parada.

## Fechamento (etapa 9)

- A seção final registra o que mudou, as decisões, o roteiro de teste no celular para o que foi direto para produção e as lições.
- Cada sub-issue fecha no release que a leva (`Closes #<sub>`). A issue-mãe fecha com `Closes #<mãe>` no release da última entrega. Se todas já estão em produção e a mãe continua aberta, feche à mão com `gh issue close <mãe>`. Nunca feche a mãe antes disso.
- `PushNotification` curto, por exemplo "#85 em produção".
- Lição que pede mudança de regra: abra um PR `chore/` que ajusta este roteiro ou o `AGENTS.md`. Esse PR mexe em trava, então espera o merge da pessoa (§ Gatilhos, item 7).
- Mensagem final para a pessoa: o que foi para produção, o que espera por ela e o roteiro de celular, se houver.

**Retomada ("continua a #N"):** leia a seção, as branches e os PRs, e siga do "Próximo passo".
