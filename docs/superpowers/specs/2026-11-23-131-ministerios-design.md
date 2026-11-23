# Ministérios: desacoplar o app (#131)

Data: 2026-11-23 · Issue: [#131](https://github.com/kaiquesilva01/church-cifras/issues/131) · Decisões tomadas com a pessoa na conversa de 23/11.

## 1. Intenção

Hoje o app serve um ministério só (Haja Luz): todo membro vê todos os repertórios, os avisos vão para todos e o papel (`viewer`/`member`/`admin`) é global. O objetivo é **escalar para vários ministérios** usando o mesmo app: cada ministério cria os seus repertórios sem que apareçam para os outros, enquanto **cifras e pads continuam compartilhados** por todos.

Quem entra pelo Google escolhe um ministério existente e pede para entrar; um admin aprova. Só o admin da app (quem é admin hoje) cria ministérios. A Haja Luz vira o primeiro ministério, sem perder nada.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**

1. Ministério como unidade: membros, admins, pedidos de entrada e repertórios próprios.
2. Entrada pelo Google com busca de ministério e pedido; aprovação por admin do ministério ou da app.
3. Privacidade real dos repertórios entre ministérios, garantida nas Rules (não só na tela).
4. Avisos (novo repertório, lembretes do ensaio) só para quem é do ministério do repertório.
5. Visão da app inteira para o admin da app ("Gestão", dentro de Mais), separada da visão de admin do ministério de que ele faz parte.
6. Estatísticas: geral para o admin da app; ranking "mais usadas" por ministério para o admin do ministério.
7. Modelo de dados pronto para uma pessoa estar em N ministérios, embora a interface limite a 1 por enquanto.

**Não-objetivos (por ora)**

- Trocar de ministério na interface ou estar em mais de um (o dado aceita; a tela não).
- Aviso no celular para pedido novo (só o número em Mais).
- Convite por e-mail, link de convite ou primeiro admin definido na criação.
- Catálogo ou pads por ministério (continuam globais).
- Apagar ministério (criar e editar nome/cidade bastam).
- Endereço neutro em vez de `louvor-hajaluz.web.app` (ver §9).
- Admin da app ver repertórios de ministérios de que não faz parte.

**Anti-objetivos (falham mesmo que "funcione")**

- Alguém de um ministério ler repertório de outro, por qualquer caminho (tela, link, consulta direta ao Firestore).
- Pessoa removida continuar lendo do servidor os repertórios do ministério (deve cortar na hora, sem esperar token). O que o aparelho já baixou antes da remoção não tem como ser "desvisto": o app limpa o cache local ao perceber a remoção (§5.1), e isso é o limite aceito.
- Aviso de repertório chegar a quem não é do ministério, ou continuar chegando a quem foi removido.
- A Haja Luz ficar sem acesso ou sem repertórios durante a migração, ou a migração cair na janela do culto (qui/dom 16h30–23h59).
- Links de repertório já compartilhados no WhatsApp pararem de abrir para quem é da Haja Luz.
- Ministério apagar ou alterar cifra que outros ministérios usam.

## 3. Papéis e permissões

Três papéis: **membro do ministério**, **admin do ministério** e **admin da app** (global; independe de ministério). Quem não tem ministério aprovado não vê o app (só a tela de entrada, §5.1).

| O que faz | Membro do ministério | Admin do ministério | Admin da app |
| --- | :-: | :-: | :-: |
| Ver todas as cifras, buscar, tocar o pad, compartilhar PDF | ✓ | ✓ | ✓ |
| Gerar e salvar tom (Mudar tom) | ✓ | ✓ | ✓ |
| Subir cifra (feita à mão), substituir tom gerado, importar em lote | – | ✓ | ✓ |
| Ver os repertórios do ministério | ✓ | ✓ | só dos ministérios de que é membro |
| Criar, editar, duplicar e apagar repertórios | – | ✓ | só nos ministérios de que é admin |
| Receber avisos do ministério | ✓ | ✓ | só dos ministérios de que é membro |
| Ver e decidir pedidos; tornar admin; remover membro | – | só do dele | de todos |
| Apagar tom ou música, corrigir nome e cantor | – | – | ✓ |
| Criar ministério, editar nome e cidade | – | – | ✓ |
| Tornar outra pessoa admin da app | – | – | ✓ |
| Estatísticas | – | ranking do ministério | geral + ranking por ministério |

- "Subir cifra" vale para o catálogo inteiro (decisão B da conversa): só admins sobem; o membro só gera tom.
- Editar repertório só admin do ministério segue a regra da #127, agora por ministério.
- Apagar e corrigir cifra só o admin da app: a cifra é de todos.
- Admin da app que não é admin de um ministério não edita os repertórios dele, nem os vê (decisão B da conversa). Para ajudar um ministério, ele se aprova como membro daquele ministério.
- O admin da app continua vendo o catálogo e a Gestão mesmo sem ministério.

## 4. Abordagem técnica

### 4.1 Alternativas consideradas

| | Como | A favor | Contra |
| --- | --- | --- | --- |
| A. Tudo no token | Function copia o vínculo para claims; Rules leem só o token; repertórios ficam em `setlists` com `ministryId` | Menor mudança; links e avisos quase iguais; nenhuma leitura extra nas Rules | Aprovar/remover só vale quando o token renova: removido mal-intencionado lê repertórios por até 1 h |
| B. Rules leem o documento sempre | Repertórios em `ministries/{id}/setlists`; Rules e Storage (`firestore.exists()`) conferem o vínculo a cada acesso | Efeito imediato em tudo | Maior mudança; uma leitura a mais por acesso, inclusive cada PDF; Storage lendo Firestore exige passo manual no console |
| **C. Híbrido (escolhida)** | Documento é a verdade. Repertórios como em B (Rules conferem o documento); catálogo e pads como em A (token) | Privacidade imediata onde importa; Storage sem mecanismo novo; atraso do token só afeta subir cifra | Dois mecanismos (o token é sempre derivado do documento por Function); migração dos repertórios |

Descartadas: um projeto Firebase por ministério (quebra o catálogo compartilhado); filtrar só na tela (não protege nada).

### 4.2 Dados (proposta; o tech-lead confirma nomes)

- `ministries/{ministryId}`: `name` (1–60), `nameNormalized` (busca sem acento), `city` (1–60), `createdBy`, `createdAt`, `updatedAt`. Id estável (slug do nome no momento da criação, ou automático). A Haja Luz recebe um id fixo (ex.: `hajaluz`).
- `ministries/{ministryId}/members/{uid}`: `role` (`member`/`admin`), `displayName`, `email`, `photoURL` (cópia para a lista), `joinedAt`, `updatedAt`, `updatedBy`. **Fonte da verdade do vínculo.** Uma pessoa pode ter documento em N ministérios.
- `ministries/{ministryId}/setlists/{setlistId}`: o repertório de hoje, mesmos campos e regras de validação (`validSetlist`), **mesmo id** do documento atual na migração.
- Pedidos de entrada: um documento por pessoa e ministério (ex.: `ministries/{id}/requests/{uid}`), com `status` (`pending`/`rejected`), dados de exibição da pessoa, `createdAt`, `decidedBy`, `decidedAt`. Aprovar apaga o pedido e cria o membro na mesma operação. Por ora a pessoa só pode ter um pedido pendente e só pode pedir se não tiver ministério.
- `users/{uid}`: ganha `appAdmin` (booleano). O campo `role` antigo deixa de ser usado depois da migração (o tech-lead decide se remove ou mantém por compatibilidade durante a transição).
- `setlistUsage/{setlistId}`: ganha `ministryId` (para o ranking por ministério); a migração preenche `hajaluz` nos registros existentes.
- Cifra nova guarda o ministério de quem subiu (ex.: `songs.createdInMinistry`), só para rastrear; a tela não mostra.

### 4.3 Token (claims) derivado do documento

Uma Function recalcula os claims da pessoa sempre que um vínculo dela muda (aprovar, recusar não muda, tornar admin, remover, admin da app) e na migração. O token só carrega o que o catálogo e o Storage precisam, nunca o que protege repertório:

- `appAdmin` (bool);
- "tem ministério" (pertence a pelo menos um);
- "pode subir cifra" (admin de algum ministério ou admin da app).

Nomes e formato ficam com o tech-lead (ex.: substituir o `role` atual por esses campos). O cliente segue o padrão de hoje (`AuthProvider` observa o próprio vínculo e chama `getIdToken(true)` quando ele muda), para que aprovar abra o app sem a pessoa sair e entrar.

### 4.4 Rules

- **Repertórios**: `ministries/{mid}/setlists/{sid}`: ler exige documento de membro em `ministries/{mid}/members/{uid}` (`exists()`); criar, editar e apagar exigem esse documento com `role == 'admin'`. O id do ministério no caminho é o que deixa a lista ser conferida com segurança. A validação de campos de hoje continua.
- **Membros e pedidos**: cliente só lê. A pessoa lê o próprio vínculo e o próprio pedido; admin do ministério lê os membros e os pedidos do ministério (confere o próprio documento de membro); admin da app lê todos pelo claim `appAdmin`, inclusive por consulta de grupo de coleções (o número de pedidos pendentes de todos os ministérios na linha Gestão), com os índices de grupo necessários. O atraso do claim `appAdmin` é aceitável: muda raramente e não dá acesso a repertório. Todas as escritas por Functions (callable), nunca direto do cliente.
- **Ministérios**: qualquer logado lê nome e cidade (é a busca da tela de entrada). Escrita só por Function.
- **Catálogo** (`songs`, `arrangements`, `songLyrics`) e **Storage** (`songs/`, `pads/`): ler exige o claim "tem ministério" ou `appAdmin`. Criar música nova, tom feito à mão e letra exige "pode subir cifra"; tom gerado exige "tem ministério". Storage `songs/` create exige "tem ministério" ou `appAdmin` (o PDF gerado também é enviado pelo membro; o admin da app sobe cifra mesmo sem ministério); o documento do tom no Firestore é que distingue feito à mão de gerado. "Pode subir cifra" = admin de algum ministério ou admin da app. Cifra subida por admin da app sem ministério fica sem ministério de origem.
- `users`: cada um lê o próprio; admin da app lê todos.
- `test:rules` cobre a matriz completa: sem ministério, membro de A lendo B (negado), membro, admin do ministério, admin da app sem vínculo (não lê repertório), removido (negado na hora, mesmo com token antigo), deslogado.

### 4.5 Functions

- Novas (callable, todas conferem o papel pelo documento, não pelo token): pedir para entrar, cancelar o próprio pedido, aprovar, recusar, tornar admin / tornar membro, remover membro, criar ministério, editar ministério, marcar/desmarcar admin da app. Cada uma que mexe em vínculo recalcula os claims da pessoa afetada.
- Regras de proteção (decisão do autor): o admin do ministério não pode rebaixar nem remover o último admin do ministério; o admin da app pode. Ninguém altera o próprio papel de admin da app.
- `requireRole` passa a conferir: "pode subir cifra" (`replaceArrangement`), "tem ministério" (`registerDevice`, `sendTestPush`), `appAdmin` (`updateSongMeta`, `deleteArrangement`, `deleteSong`, admin da app), admin do ministério ou da app (`getStats` do ministério). `discardUpload` segue "só o autor".
- `onUserCreated`: deixa de dar papel de leitura; marca `appAdmin` para e-mail verificado em `ADMIN_EMAILS` (mesma regra de hoje, só no primeiro login). Antes do release, conferir com a pessoa que `ADMIN_EMAILS` lista só o e-mail dela (admin da app é só ela).
- Avisos: `onSetlistWritten` passa a observar `ministries/{mid}/setlists/{sid}`; `sendRehearsalReminders` consulta o grupo de coleções `setlists` (precisa de índice de grupo em `rehearsalAt`); o auxiliar de envio filtra aparelhos pelo vínculo no ministério do repertório (hoje filtra por `role`), e apaga aparelho de quem não é mais de nenhum ministério. Marcas em `avisosEnviados` continuam pelo id do repertório (ids preservados).
- Estatísticas: `countSetlistUsage` e `getStats` leem o grupo `setlists` e gravam `ministryId` em `setlistUsage`. `getStats` devolve: para o admin da app, cartões gerais + ranking geral + ranking de um ministério escolhido; para o admin do ministério, só o ranking do ministério dele.
- TTL de `expiresAt` continua: a política vale pelo nome do grupo de coleções (`setlists`). Conferir o `fieldOverrides` (escopo `COLLECTION_GROUP` onde houver consulta de grupo).

### 4.6 Migração da Haja Luz

- Cria `ministries/hajaluz` ("Haja Luz", cidade "São Paulo").
- Todos os usuários de hoje entram na Haja Luz com o cargo que têm (pessoa, 23/11): `member` → membro da Haja Luz; `admin` → admin da Haja Luz; `viewer` (hoje sem acesso, #126) → **pedido pendente** na Haja Luz, para um admin aprovar (mesmo significado de hoje: sem acesso até alguém liberar).
- **Admin da app: só a pessoa** (dona do projeto). O script recebe o e-mail dela como argumento (`--app-admin <e-mail>`; o e-mail não vai para o repositório). Os outros admins de hoje ficam só como admin da Haja Luz. Novos admins da app só pela Gestão (§5.3), por um admin da app.
- Copia cada `setlists/{id}` para `ministries/hajaluz/setlists/{id}` com os mesmos campos; `setlistUsage` recebe `ministryId: 'hajaluz'`; recalcula os claims de todos.
- Script idempotente, com `--dry-run`, rodado pela pessoa no Cloud Shell (padrão do `lyrics:backfill`, `docs/deploy.md`), ou outro mecanismo que o tech-lead justificar.
- **Para quem usa, tudo chega num pacote só** (pessoa, 23/11): entrada, Pessoas do ministério, Gestão e Estatísticas saem no mesmo release. Antes dele vem uma **preparação invisível** (pessoa escolheu, 23/11), para não haver buraco e para o teste no celular usar dados reais: o site de teste usa Rules e dados de produção, então o caminho novo precisa já existir e estar liberado em produção antes de o cliente novo ser testado.
  1. **Preparação** (só backend; ninguém vê mudança): estruturas de ministério, membros e pedidos; Functions novas; claims novos gravados **junto** com o `role` atual; Rules do caminho novo **acrescentadas**, com as de `setlists` e o `role` funcionando como hoje; o script de migração; uma Function que espelha toda gravação (inclusive apagar) em `setlists/{id}` para `ministries/hajaluz/setlists/{id}`; e a tela Pessoas atual passa a gravar também o vínculo na Haja Luz ("Membro" = membro; "Admin" = admin da Haja Luz, sem admin da app; "Visitante" = sem vínculo). Depois do release, a pessoa roda a migração (`--dry-run` primeiro).
  2. **Pacote** (tudo o que a pessoa vê, num release): o cliente lê e grava no caminho novo; telas de §5; avisos e estatísticas no caminho novo; o catálogo confere os claims novos (aceitando ainda o `role` para tokens antigos); poderes de admin da app (apagar e corrigir cifra, Estatísticas gerais, Admins da app) passam a seguir o `appAdmin` (os outros admins de hoje deixam de vê-los e seguem admins da Haja Luz); `setlists` raiz fica só leitura, e só para quem é da Haja Luz (confere o documento de membro em `ministries/hajaluz/members`, nunca o `role`, para que membro de outro ministério não leia os repertórios antigos da Haja Luz); cliente antigo em cache continua lendo até recarregar; o espelho é desligado. Teste no celular no site de teste com os dados reais da Haja Luz.
  3. **Limpeza** (invisível, quando a pessoa confirmar que o Pacote está bom em produção, p.ex. depois de dois cultos): remove a coleção `setlists` raiz (a maior parte já terá expirado sozinha pelo TTL de 30 dias, que vale para o grupo `setlists`), as Rules dela, o `role` dos claims e de `users`, e o código de transição (espelho, ponte da tela Pessoas, Rules que ainda aceitam `role`). Até lá, é a rede de segurança para voltar o Pacote.
- Links antigos `/repertorios/:id` e `?repertorio=` continuam com o mesmo formato: o cliente resolve o id dentro do ministério atual da pessoa. Repertório que não existe no ministério dela mostra "Repertório não encontrado".

## 5. Experiência

Tudo segue `docs/design-system.md`; as telas são desenhadas no **Paper** e **validadas pela pessoa antes de qualquer código** (pedido da issue). Barra inferior continua com 5 ícones.

### 5.1 Entrada (quem não tem ministério)

```
Login Google ─▶ Escolha seu ministério ─▶ (toca) "Pedir para entrar em Haja Luz?" ─▶ Pedido enviado
                 🔍 Buscar ministério…                                                Um admin da Haja Luz
                 Haja Luz · Campinas  ›                                               precisa aprovar.
                 Vida Nova · Sumaré   ›                                               conta: fulano@gmail.com
                                                                                      [Cancelar pedido] [Sair]
```

- Busca por nome, sem acento nem maiúscula, na lista de ministérios (carregada inteira; poucos documentos).
- **Pedido enviado**: Cancelar pedido volta para a busca; Sair desloga. Aprovado: o app abre sozinho (sem sair e entrar).
- **Pedido recusado**: "Seu pedido para Haja Luz não foi aprovado." e volta a poder escolher (inclusive o mesmo).
- **Removido do ministério**: o app percebe a perda do vínculo (observa o próprio documento de membro), limpa o cache local do Firestore e volta para "Escolha seu ministério"; para de receber os avisos dele.
- Substitui a tela "Acesso ainda não liberado" da #126 (`AccessPending`). A nota do login ("Quem entra pela primeira vez…") muda para falar de escolher o ministério.
- Nenhuma leitura de catálogo, repertório ou Storage sai antes de a pessoa ter ministério (mesma garantia da #126).

### 5.2 Aba Mais

- Perfil com o ministério e o papel (ex.: "Haja Luz · Admin").
- **Admin do ministério**: "Pessoas do ministério" (com o número de pedidos pendentes), "Estatísticas do ministério" (só o ranking), "Importar".
- **Todos**: "Avisos", "Sair".
- **Admin da app**: linha **"Gestão"** (com o número de pedidos pendentes de todos os ministérios), que abre a tela Gestão. Se ele também é admin de um ministério, vê as linhas do ministério normalmente; as duas visões convivem.
- Pessoas do ministério: duas seções. Pedidos pendentes (nome, e-mail, data; Aprovar / Recusar). Membros (nome, e-mail, papel; ações Tornar admin / Tornar membro / Remover, com confirmação para Remover).

### 5.3 Gestão (só admin da app, em Mais)

- **Pedidos pendentes de todos os ministérios**, cada um com o ministério de destino; Aprovar / Recusar ali mesmo.
- **Ministérios**: lista (nome, cidade, nº de membros, nº de pedidos); "+ Novo ministério" (nome e cidade); abrir um ministério mostra a mesma tela "Pessoas do ministério" daquele ministério (e editar nome/cidade). O ministério nasce vazio: o líder pede para entrar, o admin da app aprova e toca em "Tornar admin".
- **Estatísticas da app**: os cartões de hoje (PDFs, Músicas, Armazenamento) + ranking "mais usadas" geral, com filtro por ministério.
- **Admins da app**: a tela Pessoas de hoje reduzida a "Admin da app: sim/não" por pessoa que já entrou.

### 5.4 Outras telas que mudam

- "＋ Nova cifra" e `/nova`: só quem pode subir cifra. "Mudar tom": todo membro.
- "Gerenciar" da cifra (apagar, corrigir nome/cantor): só admin da app.
- Repertórios: aba, cartão "Próximo culto", seletor do viewer, só do ministério atual; ações de edição só para admin do ministério.

### 5.5 Telas para desenhar no Paper (escuro; claro nas telas raiz)

Escolha seu ministério · Confirmar pedido · Pedido enviado · Pedido recusado · Mais (membro, admin do ministério, admin da app) · Pessoas do ministério · Gestão · Ministérios + Novo ministério · Ministério (detalhe) · Estatísticas da app · Estatísticas do ministério · Admins da app · Repertório não encontrado. Estados de carregando, vazio ("Nenhum pedido pendente", "Nenhum ministério encontrado") e erro em cada uma.

## 6. Entregas

Três releases, cada um deixando o app usável pela Haja Luz (§4.6):

1. **Preparação** (invisível): §4.6 passo 1. Muda Rules e Functions (`test:rules`); não toca o cliente, então não exige teste no celular. Depois do release, a pessoa roda a migração.
2. **Pacote** (visível, tudo junto): §4.6 passo 2 e todas as telas de §5 (entrada, Pessoas do ministério, Mais, Gestão, Estatísticas). Exige o teste no celular no site de teste (toca `setlists/` e `viewer/`). A `develop` só recebe o pacote inteiro: se for dividido em vários PRs, eles se juntam numa branch de integração antes de entrar na `develop`, porque o hook de Stop abre o release sempre que a `develop` difere da `main`.
3. **Limpeza** (invisível, depois de conferido em produção): §4.6 passo 3.

## 7. Restrições

- Fluxo Git, travas e janela do culto do `AGENTS.md`. Mudança em Rules e Functions: `test:rules` obrigatório.
- O site de teste usa as Rules e Functions de produção: o teste no celular cobre só a interface; Rules e Functions são validadas no emulador e só valem no release.
- Releases da Preparação e do Pacote combinados com a pessoa (migração rodada por ela, fora da janela do culto), com passos e volta no corpo do release. A cópia não apaga a coleção antiga: voltar o Pacote reabre o app de hoje sobre os dados antigos (repertórios editados depois do Pacote voltam na versão de antes dele).
- `docs/sistema.md`, `docs/design-system.md` e o Paper atualizados em cada entrega.
- Release #133 (#125, #126) sai antes e não depende desta issue; a tela da #126 é substituída no Pacote.

## 8. Decisões

| Decisão | Quem |
| --- | --- |
| Catálogo: só admins (do ministério ou da app) sobem cifra; membro gera tom | pessoa |
| Admin da app gerencia, mas só vê repertórios dos ministérios de que faz parte | pessoa |
| Ministério nasce vazio; primeiro admin pelo mesmo caminho do pedido | pessoa |
| Abordagem C (híbrida) | pessoa |
| Estatísticas: cartões e visão geral só admin da app; ranking por ministério para o admin do ministério | pessoa |
| Gestão como linha em Mais, não aba na barra inferior | pessoa |
| Ministério tem nome e cidade | autor |
| Pedido recusado é mostrado à pessoa, que pode pedir de novo | autor |
| Sem aviso no celular para pedido novo; só número em Mais | autor |
| Importar em lote junto com "subir cifra" | autor |
| Apagar/corrigir cifra só admin da app, sem mudar de lugar na tela | autor |
| Ranking do ministério só para o admin dele (não todo membro) | autor |
| Todos os usuários de hoje entram na Haja Luz com o cargo atual; cidade São Paulo | pessoa |
| Admin da app inicial: só a pessoa; outros só pela Gestão | pessoa |
| Visitante de hoje vira pedido pendente na Haja Luz (sem acesso até aprovar, como hoje) | autor |
| Cifra guarda o ministério de quem subiu | autor |
| Não rebaixar/remover o último admin do ministério (só o admin da app pode) | autor |
| Ministério não é apagado nesta issue; só criado e editado | autor |
| Para quem usa, tudo num pacote só (um release visível) | pessoa |
| Preparação invisível antes do pacote, para teste no celular com dados reais | pessoa |
| Espelho por Function de `setlists` raiz para o caminho novo entre a preparação e o pacote | autor |
| Tela Pessoas entre a preparação e o pacote: "Admin" = só admin da Haja Luz | autor |
| Removido: app limpa o cache local; o que já foi baixado antes é limite aceito | autor |
| Admin da app sobe cifra mesmo sem ministério | autor |
| Admin da app lê membros e pedidos de todos pelo claim (consulta de grupo) | autor |

## 9. Fica para o construtor

- Nomes exatos de campos, claims e Functions; formato do id do ministério.
- Mecanismo e ordem da migração (respeitando §4.6 e os anti-objetivos).
- Como o cliente guarda o "ministério atual" (com um só, é o único vínculo).
- Divisão das entregas em PRs.

Fora desta issue, para decidir antes de convidar o segundo ministério: endereço neutro em vez de `louvor-hajaluz.web.app` (site novo na lista `--only` do deploy, que é trava; o merge é da pessoa).
