# Estatísticas para admins — design

Data: 2026-11-19. Tamanho: mudança média em peças bem conhecidas do projeto (design curto).

## Intenção e porquê

Os admins querem enxergar o uso do acervo: quantos PDFs existem, quanto espaço ocupam e quais cifras a equipe realmente usa nos cultos. Hoje nada disso aparece no app. Uma tela "Estatísticas", só para admin, dentro de "Mais".

## Objetivos

- Item "Estatísticas" em `MaisPage`, visível só para admin (mesmo padrão de "Admin" e "Importar"), levando a `/estatisticas`.
- Rota `/estatisticas` dentro do grupo `RequireRole roles={['admin']}`.
- A tela mostra:
  - **Quantidade de PDFs:** total de tons (documentos em `songs/*/arrangements`), com a divisão feitos à mão × gerados, e o total de músicas.
  - **Armazenamento:** soma dos tamanhos dos PDFs em `songs/` no Storage, em B/KB/MB/GB legíveis (pt-BR). Os loops de áudio do pad (`pads/`) ficam de fora.
  - **Cifras mais usadas:** top 10 músicas de todo o período e dos últimos 30 dias, com título, cantor e número de usos.
- **Uso** = a música estar em um repertório que já "fechou" (ver Regras de contagem). Não depende de abrir a cifra.

## Regras de contagem (do usuário, exceto onde marcado)

- Um repertório de data `D` só conta quando o dia seguinte já passou: conta a partir de `D + 2` (data em `America/Sao_Paulo`). Até lá, trocar músicas no ensaio (que é no dia do culto) não distorce o ranking. Os valores de `D+2` e do fuso são leitura do assistente do "até um dia após".
- Cada repertório conta **uma vez por música**, mesmo que ela apareça em mais de um tom. Dois cultos no mesmo dia são dois repertórios e contam duas vezes (decisão do assistente).
- Repertório apagado antes de fechar não conta.
- Depois de contado, o uso fica congelado: edições posteriores no repertório não o alteram.

## Não-objetivos

- Histórico anterior ao deploy: repertórios já expirados não existem mais. Os que ainda existem e já estão fechados são contados na primeira execução.
- Estatísticas por tom, por pessoa ou por abertura da cifra (nada disso é registrado).
- Gráficos, exportação, filtros de período.

## Anti-objetivos

- Deixar um não-admin ler as estatísticas ou o registro de usos (nem pela função, nem pelas regras).
- Contar o mesmo repertório duas vezes (a contagem precisa ser idempotente).
- Perder uso porque o TTL de 30 dias apagou o repertório antes de ser contado: a contagem roda todo dia, bem antes disso.

## Restrições

- Os repertórios somem sozinhos 30 dias após o culto (`expiresAt`, TTL do Firestore). Por isso o uso é guardado de forma permanente numa coleção própria.
- Padrão do projeto: Cloud Functions em `southamerica-east1`, papel conferido por `requireRole` (lê `users/{uid}`), lógica pura testável com dependências injetadas (como `adminSongs.ts`), fiação em `apps/functions/src/index.ts`.
- Firestore bloqueia tudo por padrão; coleção nova precisa estar coberta por teste em `tests/rules`.
- Primeira função agendada do projeto: exige a API do Cloud Scheduler ativa e uma nota em `docs/deploy.md`.
- Texto de UI em pt-BR; identificadores em inglês.

## Approaches

Sobre **como contar "usada"** (escolha do usuário): job diário que guarda o uso de forma permanente, em vez de olhar só os repertórios que ainda existem. Isso dá ranking de todo o período e de 30 dias, ao custo de uma função agendada e de uma coleção nova.

Sobre **como calcular as estatísticas** (escolha do usuário): função sob demanda `getStats` calcula na hora que a tela abre, em vez de contadores mantidos por gatilhos. Poucas peças, números sempre frescos.

Descartadas: contar abertura de cifra (a regra de uso vem do repertório, não da abertura); olhar só os repertórios vivos (histórico some em ~30 dias); contadores por gatilhos (complexidade sem ganho nesse volume).

## Design

### Registro de usos (`setlistUsage`)

- Coleção `setlistUsage`, id = id do repertório. Campos: `date` (string `YYYY-MM-DD` do culto), `songIds` (lista sem repetição, tirada de `items[].songId`), `countedAt` (timestamp do servidor).
- Um documento por repertório contado, para sempre (poucas centenas por ano, pequeno).
- Só o Admin SDK escreve e lê. Regras: já cobertas pelo `match /{document=**}` que nega tudo; acrescentar teste confirmando que nenhum papel lê nem escreve.

### Contagem (`countSettledSetlists`)

- Lógica pura em `apps/functions/src/stats/countUsage.ts` com dependências injetadas.
- Calcula `cutoff = hoje − 2 dias` (hoje em `America/Sao_Paulo`), consulta `setlists` com `date <= cutoff`, e para cada repertório cria `setlistUsage/{id}` só se ainda não existir (criação que falha se já existe, para ser idempotente mesmo com duas execuções simultâneas).
- Repertório sem músicas gera documento com `songIds` vazio (marca como contado).
- Roda de duas formas: pela função agendada diária e no início de `getStats` (é idempotente), para que o ranking apareça já na primeira visita após o deploy e para reduzir a dependência do agendador.

### Função agendada

- `onSchedule` (`firebase-functions/v2/scheduler`), diária de madrugada (`timeZone: 'America/Sao_Paulo'`), região `southamerica-east1`, chama `countSettledSetlists`.

### `getStats` (função)

- `onCall`, `requireRole(['admin'])`.
- Chama `countSettledSetlists`; depois:
  - Tons: contagem agregada em `collectionGroup('arrangements')` separada por `source`; músicas: contagem em `songs`.
  - Armazenamento: `bucket.getFiles({ prefix: 'songs/' })` somando `metadata.size`.
  - Usos: lê `setlistUsage`, soma por música (todo o período; e os de `date >= hoje − 29 dias`), ordena, pega 10 e busca título e cantor em `songs/{id}`. Músicas apagadas desde então são ignoradas.
- Resposta: `{ songCount, pdfCount, handmadeCount, generatedCount, storageBytes, topAllTime[], topLast30Days[] }`, cada item do top com `{ songId, title, artistName, uses }`.

### Tela (cliente)

- `apps/web/src/stats/StatsPage.tsx` + `statsApi.ts` (mesmo molde de `PeoplePage`/`peopleApi`): carrega ao abrir, estados de carregando e de erro, formatador de bytes.
- Três blocos: PDFs, Armazenamento, Mais usadas (alternância "Todo o período" / "Últimos 30 dias"), reusando as classes de cartão e lista existentes (visual escuro/âmbar). Estado vazio claro enquanto ainda não houver repertórios fechados.
- Linha do ranking leva à cifra.

## Decisões do assistente (podem ser corrigidas)

- Conta a partir de `D + 2`; fuso `America/Sao_Paulo`.
- Uma vez por música por repertório; dois cultos no mesmo dia contam duas vezes.
- Top 10, com os dois recortes (todo o período e 30 dias).
- `pads/` fora do armazenamento.
- Contagem também dentro do `getStats`, além do agendador.
- Se o agendador ficasse parado por mais de ~28 dias, repertórios expirariam sem serem contados: risco aceito.
- `setlistUsage` usa só o id do repertório como chave: se um repertório já contado for depois re-datado ou reaproveitado (a data editada), ele não é contado de novo. A alternativa (chave `${setlistId}_${date}`) contaria duas vezes as correções de data errada. Fica para o dono decidir antes do release para main.

## Fica para o builder

- Nome exato da rota e dos arquivos, textos finais dos rótulos e do estado vazio, horário exato do agendador.
- Formato do formatador de bytes; forma de paginar a leitura do Storage e de `setlistUsage`.
- Testes: unitários de `countSettledSetlists` (fora/dentro da janela de `D+2`, idempotência, duplicatas de música, repertório vazio) e de `getStats` (papéis, agregação, músicas apagadas); regras (`setlistUsage` negado a todos); `StatsPage` (carregando, dados, erro, alternância); `MaisPage` (item só para admin).
