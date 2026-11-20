# SDLC com agentes: da issue à produção

Data: 2026-11-20 · Status: design para aprovação

Marcadores: **[decidido]** a pessoa decidiu na conversa · **[proposta aceita]** proposta do assistente que a pessoa leu e não contestou · **[decisão minha]** escolha do assistente, ainda aberta a correção.

## 1. Intenção e porquê

A pessoa quer escrever "desenvolve a #85" e ver a rede de agentes levar a issue até produção sem precisar acompanhar cada passo. O fluxo cobre discussão de negócio e experiência entre agentes que conhecem o sistema inteiro, design, refinamento técnico, desenvolvimento, QA, revisão, merge na `main` e deploy.

As issues são curtas e às vezes incompletas: a #85 cita "escala" e "hora do ensaio", que não existem no sistema, e a escala é um não-objetivo escrito no spec de repertórios (§3 de `2026-11-16-repertorios-design.md`). Os agentes precisam completar o que falta, decidir o que é razoável e só envolver a pessoa quando a decisão for dela.

A pessoa usa o plano **Pro**: a cota é curta, o Opus fica para urgência e o desenvolvimento roda em Haiku.

Hoje a única trava antes da produção é a pessoa aprovar e fazer o merge do PR `develop → main`. Este design tira a pessoa dessa posição e põe no lugar travas automáticas.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**

1. "Desenvolve a #N" leva a issue até produção, com a issue fechada, sem outra ação da pessoa quando nenhum gatilho de parada é atingido [decidido].
2. A pessoa só é chamada nos gatilhos de §5.1 e no teste em celular de §5.6 [decidido].
3. O agente faz o merge do release `develop → main` sozinho, com travas no código [decidido].
4. A pessoa acompanha tudo pela seção **"Análise Agêntica"** no corpo da issue, abaixo do texto original, que nunca é alterado [decidido].
5. Várias issues podem andar em paralelo sem que uma leve a outra pela metade para produção [decidido].
6. Os modelos seguem §5.3: Haiku no grosso do trabalho e Opus só em incidente [decidido].
7. O trabalho sobrevive ao fim da cota: "continua a #N" retoma de onde parou [proposta aceita].

**Não-objetivos**

- Disparar o fluxo pelo GitHub (etiqueta, Actions) ou pela nuvem: roda na sessão local [decidido: abordagem A].
- Ambiente de homologação com outro projeto Firebase. O site de teste usa o backend de produção [decidido].
- Aprovar PR por review do GitHub: a conta do agente é a da pessoa, e o GitHub não deixa ninguém aprovar o próprio PR. "Aprovar" é fazer o merge depois das travas.
- Decidir sozinho quando a pessoa não responde a uma pergunta: o item espera [decisão minha].

**Anti-objetivos (falha mesmo que "funcione")**

- Metade de uma issue, ou algo sem revisão, CI verde e QA, chegar à produção.
- Deploy em horário de culto (§5.7).
- O texto original da issue ser alterado.
- Um agente decidir sozinho algo que está nos gatilhos de §5.1.
- Opus usado em trabalho de rotina.
- A pessoa só descobrir o que aconteceu quando algo quebra.

## 3. Restrições

- **Cota do plano Pro:** a sessão pode parar no meio do trabalho, então o estado precisa estar fora da conversa, na issue e no git.
- **Execução local:** o fluxo roda no PC da pessoa, com a sessão aberta. O Paper é um app de desktop, e o Docker e os emuladores também rodam localmente.
- **Conta do GitHub:** os agentes usam a conta `gh` da pessoa. Por isso não há self-approve, e o GitHub **não notifica a pessoa** de comentários e edições feitos pela própria conta. O aviso precisa vir do `PushNotification` do Claude Code, que chega ao celular quando o Remote Control está conectado.
- **Branches e deploy:** não há proteção de branch no GitHub, e o ambiente `production` não tem regras. Push na `main` dispara o deploy (`deploy.yml`), exceto quando só mudam harness, docs ou testes.
- **Firebase:** há um único projeto (`cifras-louvor-5dd50`). O Storage só aceita as origens listadas em `cors.json`, sem curinga. O login Google só funciona em domínios autorizados.
- **Repositório público:** nunca commitar PDFs reais, credenciais ou `.env`.
- **Regras do projeto:** o `AGENTS.md` continua valendo (design system, Paper, Conventional Commits, pt-BR na UI e na documentação). Este design muda as partes dele listadas em §5.10.

## 4. Abordagens consideradas

| | Abordagem | Prós | Contras |
|---|---|---|---|
| **A** | **Roteiro local (skill do projeto) + travas automáticas em hooks e workflows** | Usa o que já existe (agentes, hooks, superpowers, Paper, Docker); regras de produção viram código; roda na cota do Pro | Precisa do PC ligado e da sessão aberta; pausa quando a cota acaba |
| B | Disparado pelo GitHub (etiqueta → Claude Code no Actions) | Não precisa do PC; dá para disparar pelo celular | Exige uma credencial do Claude no GitHub; o Paper (desktop) não roda lá; jobs têm limite de 6 h |
| C | Só regras escritas no `AGENTS.md` | É o mais rápido de fazer | Depende do modelo lembrar de tudo; com Haiku e Sonnet a regra escrita se perde mais, e não há mais humano no fim para pegar o erro |

**Escolhida: A** [decidido]. A abordagem B perde o Paper e a C perde as travas, que agora são a única proteção da produção.

## 5. Design

### 5.1 Quando a pessoa entra [decidido: só quando há risco]

Por padrão os agentes decidem e registram cada decisão, com o motivo, na Análise Agêntica. Eles **param e perguntam** quando a entrega [proposta aceita]:

1. cria dado novo sobre pessoas (escala, telefone, disponibilidade, contato);
2. muda o que um papel (admin, membro etc., §2 do spec) vê ou faz;
3. gera custo no Firebase ou no Google Cloud (API nova, função agendada, armazenamento relevante);
4. depende de um passo manual da pessoa (chave, IAM, console, upload, backfill, configuração de domínio);
5. contraria um não-objetivo escrito em algum spec;
6. mexe em dado de produção sem volta (migração, exclusão, mudança de formato);
7. altera as travas ou o processo: `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md` ou `CLAUDE.md`. Nesse caso **a pessoa faz o merge na `develop`** [decidido]. O resto do fluxo continua igual, e o release seguinte é feito pelo agente.

Também param quando uma tarefa falha duas vezes já em Sonnet high (§5.3) [decisão minha].

**Como param:**

- Só a entrega afetada para. As outras entregas da mesma issue e as outras issues continuam.
- São no máximo 3 perguntas por vez. Cada pergunta traz as opções, o que cada uma implica e a recomendação dos agentes.
- A pausa fica visível de três formas: o status da Análise Agêntica muda para "🟡 Aguardando você", a issue ganha a etiqueta `aguardando-voce` e sai um `PushNotification` (mensagem curta, por exemplo "#85: 2 perguntas sobre escala").
- A pessoa responde no chat ou num comentário da issue. A resposta vai para "Decisões" com "quem: você".

### 5.2 Fluxo de Git [decidido: pessoa delegou o desenho; detalhes são proposta aceita]

**Regra central: a `develop` só recebe entregas inteiras, por isso está sempre pronta para produção.**

- **Entregas.** Issue grande vira entregas que vão para produção sozinhas, cada uma útil ou inofensiva por si. Cada entrega vira uma sub-issue ("Parte de #85"). Issue pequena é uma entrega só, a própria issue.
  - Quando uma entrega muda backend (Rules, Functions, dados) e também uma tela de culto (§5.6), o backend vai antes, numa entrega própria [decisão minha].
- **Branch e worktree.** Cada entrega tem a sua branch `<tipo>/<n>-<slug>` (ex.: `feat/95-hora-ensaio`), criada a partir de `origin/develop`, e a sua worktree.
- **PR desde o começo.** No primeiro push abre um PR rascunho para a `develop`, com `Resolve #95` e `Parte de #85` no corpo. O CI roda a cada push.
- **Antes de entrar na `develop`:**
  1. atualizar a branch com `origin/develop` (merge, sem force push);
  2. CI verde no head;
  3. revisão final sem pendência crítica ou importante aberta (etiqueta `revisado`);
  4. QA verde (etiqueta `qa-ok`);
  5. etiqueta `teste-celular-ok` quando §5.6 exige.

  O orquestrador põe cada etiqueta quando a etapa passa, e o hook exige as etiquetas (§5.10), para nenhuma etapa ser pulada por esquecimento [decisão minha]. Depois disso, merge com `gh pr merge <n> --squash --delete-branch`.
- **Release logo em seguida.** O PR `develop → main` é aberto ou atualizado com `Closes #N` de cada issue e sub-issue entregue. Depois de esperar o CI no head do PR, o merge é `gh pr merge <n> --merge --match-head-commit <sha>`, fora da janela de §5.7. Em seguida o agente acompanha o deploy e a checagem (§5.8).
- **Sem squash nem rebase na `main`, e sem hotfix a partir da `main`.** Correção urgente também passa pela `develop`, que está sempre pronta. Isso elimina o `chore: merge main into develop`.
- **Paralelismo.** Cada issue tem a sua sessão orquestradora. Quem fizer o merge do release leva tudo o que está na `develop`, e só há entregas inteiras lá. O `--match-head-commit` impede o merge de um head diferente do que passou no CI. O deploy já tem `concurrency: production`. A outra sessão percebe que a entrega dela já está em produção e só atualiza a seção.
- **Release pendente.** Se ficou preso pela janela ou pela cota, o release é retomado no início de qualquer execução do roteiro (§5.4, etapa 0) ou quando a pessoa diz "publica a #N".

### 5.3 Modelos e esforço [decidido; plano em Haiku high por escolha da pessoa]

| Papel / etapa | Modelo | Effort |
|---|---|---|
| Orquestrador (sessão principal, onde a pessoa diz "desenvolve a #N") | Sonnet | medium |
| `product-owner` (negócio) | Sonnet | medium |
| `designer` (experiência, Paper, conferência visual) | Sonnet | medium |
| `tech-lead` (refinamento técnico: o plano) | **Haiku** | **high** |
| `frontend-dev` / `backend-dev`: leitura do plano antes de começar ("pré-voo") | Haiku | high |
| `frontend-dev` / `backend-dev`: implementação | Haiku | low |
| `qa` | Haiku | low |
| Conferência por tarefa (aderência ao plano e qualidade) | Haiku | high |
| Correção depois de revisão ou QA | Haiku medium; depois de 2 falhas na mesma tarefa, Sonnet high; depois de mais 2, para e pergunta | |
| `code-reviewer` (revisão final do PR, a última trava) | Sonnet | high |
| **Opus** | Só em incidente de produção (deploy ou checagem falhou, rollback falhou, bug impedindo o uso no culto) ou com pedido explícito da pessoa | |

**Como os modelos são impostos:**

- o `model` e o `effort` padrão de cada agente ficam no frontmatter;
- o roteiro passa `model` e `effort` em toda chamada ao `Agent`, inclusive quando difere do padrão, como no pré-voo e na conferência;
- o orquestrador abre em Sonnet por configuração do projeto (§5.10), e a pessoa troca com `/model` quando quiser.

Nenhum agente fica com Opus no frontmatter.

### 5.4 O roteiro (skill do projeto `entregar-issue`)

Ele é disparado por "desenvolve a #N", "continua a #N", "publica a #N" ou `/entregar-issue N`. Um pedido sem issue vira uma issue primeiro, com o texto da pessoa, para seguir o mesmo fluxo [decisão minha].

Dentro do roteiro, o `brainstorming` do superpowers **não** pergunta à pessoa: as etapas 1 e 2 fazem esse papel, e o §5.1 decide quando ela entra. O `AGENTS.md` deixa essa precedência explícita, porque as instruções do projeto valem mais que as skills. As demais skills continuam em uso: `writing-plans` (tech-lead), `subagent-driven-development` + `test-driven-development` (execução), `requesting-code-review` e `verification-before-completion`.

**Só o orquestrador escreve na issue.** Os subagentes devolvem texto, e o orquestrador grava. Toda etapa termina atualizando a Análise Agêntica: status, etapa, próximo passo e histórico.

0. **Início.**
   - Verificar se há release pendente (§5.2) ou issue com a etiqueta `incidente` (§5.8). Se houver, isso vem antes.
   - Ler a issue e os comentários.
   - Criar a seção, ou retomá-la a partir do "Próximo passo", e pôr a etiqueta `em-andamento`.
1. **Negócio e experiência.**
   - O `product-owner` lê a issue, o `docs/sistema.md` (§5.9) e os specs relevantes. Ele propõe o entendimento (problema, quem ganha, como saber que deu certo), os critérios de aceite verificáveis, as entregas, as decisões com motivo, os gatilhos atingidos e os riscos.
   - O `designer` (experiência: fluxo, telas, estados, celular, acessibilidade) e o `tech-lead` (viabilidade, custo, limites do Firebase, impacto em dados e Rules, tamanho) criticam a proposta **em paralelo, numa rodada só**.
   - O PO consolida. O orquestrador grava a seção, cria as sub-issues e aplica o §5.1.
2. **Design** (quando a entrega tem tela).
   - O `designer` atualiza o Paper: escuro sempre; claro nas telas raiz; estados vazio, carregando e erro. Depois resume a especificação da tela na seção da sub-issue.
   - Se o Paper estiver indisponível, registra "Paper pendente", como a regra atual já prevê.
3. **Refinamento técnico.**
   - O `tech-lead` escreve o plano em `docs/superpowers/plans/<data>-<n>-<slug>.md` (`writing-plans`): código exato em cada passo, teste antes do código, arquivos de cada tarefa e grupos que podem andar em paralelo sem dividir arquivos.
   - Em seguida, `frontend-dev` e `backend-dev` fazem o pré-voo: leem as suas tarefas e apontam lacunas. O tech-lead corrige, numa rodada só.
   - **O spec de negócio vive na issue (Análise Agêntica); o plano vive no repositório** [decisão minha].
4. **Desenvolvimento.** Execução com `subagent-driven-development`, com os modelos do §5.3 e uma conferência depois de cada tarefa. Os devs trabalham em paralelo quando não mexem nos mesmos arquivos.
5. **QA.**
   - O `qa` escreve e roda E2E (Playwright, emuladores, PDFs sintéticos) para cada critério de aceite.
   - Quando há tela, o `designer` compara prints de 390 px, no escuro e no claro, com o Paper.
6. **Revisão final.** O `code-reviewer` revisa o PR inteiro contra os critérios, o `AGENTS.md` e o design system. O ciclo de correção e nova revisão se repete até não sobrar nada crítico nem importante.
7. **Teste no celular**, quando o §5.6 exige.
8. **Entrada na `develop`, release e produção** (§5.2 e §5.8).
9. **Fechamento.**
   - A seção final registra o que mudou, as decisões, o roteiro de teste no celular para o que foi direto para produção e as lições.
   - A issue-mãe fecha quando todas as entregas dela estão em produção.
   - Um `PushNotification` avisa, por exemplo, "#85 em produção".
   - Quando uma lição pede mudança de regra, abre-se um PR `chore/` ajustando o roteiro ou o `AGENTS.md`. Esse PR espera o merge da pessoa (§5.1, item 7).

**Retomada:** "continua a #N" lê a seção, as branches e os PRs, e segue do "Próximo passo".

### 5.5 Análise Agêntica na issue [decidido; formato é decisão minha]

- O texto original fica intacto. Abaixo dele vem um marcador fixo, e tudo depois do marcador é reescrito a cada atualização:

```markdown
<texto original da issue, nunca alterado>

---
<!-- analise-agentica: tudo abaixo é escrito pelos agentes; o texto acima nunca é alterado -->
## Análise Agêntica

**Status:** 🟡 Aguardando você · 2 perguntas (desde 21/11 14:05)
**Etapas:** Negócio ✅ · Design ✅ · Plano ⏳ · Desenvolvimento · QA · Revisão · Produção
**Próximo passo:** tech-lead escrevendo o plano da #95

### Perguntas para você
1. A escala é por repertório ou por mês? Por repertório (recomendado: …) · Por mês (…)

### Entendimento
Problema, quem ganha, como saberemos que deu certo.

### Entregas
- [ ] #95 Hora do ensaio no repertório · em desenvolvimento · PR #97
- [ ] #96 Aviso de repertório novo · aguardando você (pergunta 1)

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
- …
</details>
```

- **Escrita.** O orquestrador relê o corpo antes de cada escrita e troca só o que vem depois do marcador. Se o marcador não existir, acrescenta. Se a pessoa mudou o texto original depois que a análise começou, isso entra no Histórico e é reavaliado.
- **Tamanho.** O corpo tem limite de 65.536 caracteres. Partes longas ficam em `<details>`, e o Histórico antigo é resumido.
- **Sub-issues.** O corpo começa com "Parte de #85" e uma descrição curta escrita pelo PO, e segue com a própria Análise Agêntica (plano, PR, testes, produção). A issue-mãe mostra uma linha de status por entrega.
- **Etiquetas:** na issue, `em-andamento`, `aguardando-voce` e `incidente`; no PR, `revisado`, `qa-ok`, `teste-celular-ok` e `no-site-teste`.

### 5.6 Teste em celular [decidido: misto, site de teste fixo]

- **Quem espera o "ok" da pessoa.** A regra é fixa por caminho: a entrega que altera `apps/web/src/viewer/`, `apps/web/src/setlists/` ou `apps/web/src/pad/` espera. O PO pode acrescentar outros casos na seção, com o motivo.
- **O resto vai direto para produção.** Quando há algo que depende do aparelho (push, áudio, compartilhamento), o roteiro de teste vai na mensagem final.
- **Site de teste fixo: `https://louvor-hajaluz-teste.web.app`.**
  - É um site extra do Hosting no mesmo projeto, com o mesmo login e os mesmos dados de produção.
  - **Só a interface muda**: Rules e Functions continuam as de produção, por isso o backend vai antes (§5.2).
  - Uma faixa "TESTE · #95" no topo, feita com tokens do design system, aparece só quando o build recebe `VITE_TEST_BANNER`.
  - Mostra uma entrega por vez. **A vez é marcada pela etiqueta `no-site-teste`**, que só um PR aberto pode ter. Quem encontra a etiqueta em outro PR espera na fila, e a seção mostra "na fila do site de teste, depois da #N". A etiqueta sai quando o PR entra na `develop` ou quando a entrega volta para correção [decisão minha]. A concorrência do GitHub Actions sozinha não basta, porque troca um disparo pendente pelo mais novo.
- **Fluxo:**
  1. A branch é atualizada com a `develop` e o CI passa.
  2. O orquestrador pega a vez (`no-site-teste`) e dispara o workflow do site de teste **sempre a partir da `main`** (`gh workflow run ... --ref main`), passando a branch e o número da issue como entradas. Assim o workflow que roda é o revisado, nunca uma versão alterada pela branch. Um job **sem segredos** faz o build da branch. Outro job, com a credencial, só publica esse build no Hosting do site de teste [decisão minha].
  3. A seção ganha o roteiro de 2 ou 3 passos, o status muda para "📱 Pronto para testar", a issue ganha `aguardando-voce` e sai um `PushNotification`.
  4. Se a pessoa responder "ok", o orquestrador põe `teste-celular-ok` no PR e registra a decisão. Se ela descrever um problema, a entrega volta para correção e para um novo deploy no site de teste.
- **A espera acontece antes do merge na `develop`.** Se acontecesse depois, outro release levaria a entrega sem o teste.

### 5.7 Janela do culto [decidido]

- **Sem publicar em produção às quintas e aos domingos, das 17h às 23h59 (America/Sao_Paulo).**
- O merge do release é bloqueado a partir das **16h30** desses dias, para o deploy terminar antes das 17h [decisão minha].
- A trava está no hook (§5.10). Não há como contorná-la pelo agente: se a pessoa precisar publicar dentro da janela, ela mesma faz o merge.
- A volta automática de §5.8 funciona em qualquer horário.

### 5.8 Produção: checagem e volta automática [proposta aceita]

- O build grava o SHA do commit no `index.html` (por exemplo, `<meta name="app-version">`).
- **Checagem depois do deploy:**
  - consultar `https://louvor-hajaluz.web.app/` até a versão bater com o SHA, com tempo limite;
  - conferir que o JS principal responde 200;
  - abrir a página inicial sem login e ver se carrega sem erro no console [decisão minha].
- **Se a checagem falhar:**
  - publicar de novo o último commit que passou na checagem (último Deploy verde na `main`), com o commit anterior da `main` como reserva, nos mesmos alvos [decisão minha, na execução];
  - abrir uma issue com a etiqueta `incidente`, com os links da execução;
  - deixar o workflow vermelho; o GitHub manda e-mail à pessoa.
- A checagem roda dentro do `deploy.yml`, depois do deploy, e compara com o `github.sha` daquela execução. **Release sem deploy:** quando o diff só mexe nos caminhos do `paths-ignore` (harness, docs, testes), o workflow não roda. O orquestrador calcula isso pelo diff do release e registra "sem deploy (só harness/docs)", em vez de esperar uma execução que não vem [decisão minha].
- O orquestrador acompanha o deploy (`gh run watch`) e atualiza a seção. Num incidente, pode usar Opus para diagnosticar.
- **Depois da volta automática** [decisão minha]:
  - Enquanto houver issue `incidente` aberta, o hook bloqueia o merge de release na `main`. A única exceção é o release que fecha o incidente (`Closes #<incidente>`). Sem isso, o próximo release levaria o código quebrado de volta.
  - O orquestrador que encontra o incidente (etapa 0) reverte, na `develop`, o commit squash da entrega culpada, com uma branch `fix/<incidente>-reverte-<slug>`. Esse PR segue o fluxo normal e o release dele fecha o incidente.
  - A issue da entrega revertida é reaberta e volta para correção.
- **Limite:** dado já gravado no formato novo não volta, e é por isso que "dado sem volta" é gatilho de parada (§5.1).

### 5.9 Mapa do sistema (`docs/sistema.md`) [decisão minha]

- **Por que existe.** É o "contexto completo do sistema" que os agentes de negócio pediam. Hoje esse conhecimento está espalhado em 9 specs, no `design-system.md` e no código, e é caro para Haiku e Sonnet lerem tudo a cada issue.
- **Conteúdo:**
  - o que o app faz, por tela;
  - os papéis e o que cada um pode;
  - os dados (coleções e campos principais);
  - Functions e jobs agendados;
  - Storage, pad e PWA;
  - os não-objetivos decididos, com link para o spec;
  - os limites conhecidos (iOS, aparelho real) e os follow-ups abertos.
- **Tamanho:** um alvo de até cerca de 300 linhas.
- **Manutenção.** É criado neste projeto e **atualizado no PR de cada entrega**. O `code-reviewer` cobra quando faltar.

### 5.10 Travas e arquivos que mudam

**`git-guard` (`.claude/hooks/git-guard-rules.mjs` + `git-guard.mjs`)**, com fail closed (consulta ao `gh` que falha = bloqueio):

- **`gh pr merge` com base `develop`:**
  - CI verde no head: todos os checks com sucesso, pulados ou neutros, e nenhum pendente;
  - etiquetas `revisado` e `qa-ok`;
  - etiqueta `teste-celular-ok` quando o PR altera os caminhos de §5.6;
  - **bloqueio quando o PR altera os caminhos das travas** (§5.1, item 7): o merge desses PRs é da pessoa.
  - **Origem das regras:** essa verificação usa as regras como estão na `origin/develop`, e não a cópia da branch. Assim uma branch que afrouxa o hook não se libera com o hook afrouxado.
- **`gh pr merge` com base `main`** (hoje bloqueado; passa a ser permitido) só com:
  - head `develop`;
  - `--merge` presente; `--squash`, `--rebase`, `--auto` e `--admin` ausentes;
  - `--match-head-commit <sha>` igual ao head atual;
  - CI verde nesse head;
  - fora da janela de §5.7;
  - nenhuma issue `incidente` aberta, a menos que o PR a feche (§5.8).
- **Deploy de produção só pelo merge do release** [decisão minha]: o hook bloqueia `gh workflow run` do `deploy.yml` e qualquer `firebase deploy` vindo do agente. A pessoa continua podendo fazer as duas coisas. O site de teste só é publicado pelo workflow dele.
- **`gh pr review --approve` continua bloqueado.**
- **Implementação:** o resolver injetado passa a devolver base, head, SHA, checks, etiquetas e arquivos. O relógio também é injetado, para os testes.

**`release-pr.mjs` (Stop):**

- continua como rede de segurança;
- o corpo deixa de pedir aprovação humana e diz quem faz o merge e com quais travas;
- pré-preenche `Closes #N` a partir dos PRs mergeados na `develop` desde o último release, se for viável [decisão minha].

**Agentes (`.claude/agents/*.md`):**

- `model`/`effort` conforme §5.3;
- responsabilidades alinhadas ao roteiro: o PO produz a Proposta; designer e tech-lead criticam; os devs fazem o pré-voo; o designer faz a conferência visual;
- regra de que só o orquestrador escreve na issue;
- `agents.test.mjs` atualizado para os novos modelos e para "nenhum agente em Opus".

**Projeto:**

- `.claude/settings.json`: modelo padrão Sonnet para a sessão (e effort medium, se a configuração suportar);
- `.claude/skills/entregar-issue/SKILL.md`: o roteiro de §5.4;
- teste de harness conferindo que a skill existe e tem as partes essenciais (gatilhos, marcador da Análise Agêntica, tabela de modelos).

**`AGENTS.md`:**

- reescrever "Fluxo Git", "PR de release" (o agente faz o merge com as travas), "Modelos e esforço" e "Fluxo de trabalho" (roteiro por issue e precedência sobre o brainstorming com humano);
- criar as seções "Janela do culto" e "Teste no celular".

**`.github/pull_request_template.md`:**

- campos "Resolve #N / Parte de #N";
- campo "Teste no celular: exigido? ok?".

**Workflows:**

- `deploy.yml`: versão no build, checagem e volta automática (`issues: write` para abrir o incidente);
- workflow novo do site de teste: `workflow_dispatch` (sempre disparado da `main`) com as entradas `branch` e `issue`, build sem segredos num job e deploy só do Hosting do site de teste em outro (§5.6);
- `firebase.json`: alvo do site de teste.

**Frontend:** a faixa de teste, com tokens do design system e registrada em `docs/design-system.md`.

**`docs/deploy.md`:** passo a passo do site de teste (§6).

## 6. O que a pessoa faz uma vez

1. Criar o site `louvor-hajaluz-teste` no Hosting (`firebase hosting:sites:create louvor-hajaluz-teste`).
2. Em Authentication > Authorized domains, adicionar `louvor-hajaluz-teste.web.app`.
3. Acrescentar a origem `https://louvor-hajaluz-teste.web.app` em `cors.json` (o PR já traz) e aplicar no bucket (`gsutil cors set`).
4. Se a chave de API do navegador tiver restrição de site (Google Cloud > APIs e serviços > Credenciais), acrescentar `louvor-hajaluz-teste.web.app` a ela. Sem restrição, não há nada a fazer.
5. Opcional: ligar o Remote Control para os `PushNotification` chegarem ao celular.
6. Aprovar e fazer o merge do release desta mudança: é o último release feito à mão.

## 7. Transição

- **Esta mudança passa pelo fluxo atual:** PRs para a `develop` e release aprovado pela pessoa.
- **Workflow do site de teste:** um `workflow_dispatch` precisa estar na branch padrão (`main`) para ser disparado, então o site de teste só funciona depois desse release e do passo 1–3 de §6. Até lá, entregas que exigem o teste no celular ficam paradas em "passo manual seu".
- **Piloto 1: #83** (Estatísticas: armazenamento restante). É pequena, só de admin e fora dos caminhos de culto, e valida o caminho direto de ponta a ponta.
- **Piloto 2: #85** (Notificações). É o caso completo: divide em entregas e atinge gatilhos (escala é não-objetivo e dado de pessoas; push exige chave e configuração, que são passo manual).

## 8. Deixado para quem constrói

- Como o hook obtém os checks, os arquivos e as etiquetas do PR (`gh pr view --json ...`), incluindo PR com muitos arquivos.
- Como o hook carrega as regras da `origin/develop` (§5.10). Um exemplo é `git show origin/develop:.claude/hooks/git-guard-rules.mjs` para um arquivo temporário, depois importado. Também é do construtor o que fazer quando isso falha: deve ser fail closed. O risco que sobra fica registrado: uma branch que tira o hook do `settings.json` desliga o hook naquela worktree, e quem pega isso é o `code-reviewer`.
- O mecanismo da worktree por entrega (`EnterWorktree` ou `git worktree add`) e onde ela fica.
- As chaves de configuração do modelo e do effort padrão da sessão no `settings.json`, verificadas na documentação do Claude Code.
- O formato exato da seção dentro do esqueleto de §5.5, a política de corte do Histórico e o texto das mensagens de `PushNotification`.
- Os detalhes da checagem (tempo limite, Playwright ou `curl`) e o mecanismo de volta: redeploy completo do último commit que passou na checagem, com o anterior da `main` como reserva [decisão minha, na execução], ou clone da versão do Hosting mais redeploy de Rules e Functions.
- A cor das etiquetas e a coleta de `Closes #N` no `release-pr.mjs`.
- A estrutura interna do `docs/sistema.md`.
- A divisão desta mudança em PRs.
