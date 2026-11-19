# Busca por letra

Telas no Paper (arquivo "Church - Cifras"): **03b** (resultados) e **03c** (letras ainda carregando).
Os filtros Tudo/Músicas/Cantores/Harpa da Busca existem no app hoje; o Paper ainda não mostra o chip Harpa nessas telas.

## Intenção

Quem toca ou canta nem sempre lembra o título: lembra um verso. Hoje a Busca só olha título e cantor.
A pessoa digita um trecho da letra ("deus todo poderoso") e acha a música, com o trecho destacado.
Vale para músicas e para os hinos da Harpa, que as pessoas costumam procurar por um verso.

## Metas

- A Busca acha músicas pelo texto da letra, dentro dos filtros **Tudo**, **Músicas** e **Harpa**.
- Uma seção **Na letra** mostra, por música, o cartão normal (tom, título, cantor) e um trecho da letra com
  as palavras buscadas em âmbar e negrito (Paper 03b).
- A busca continua instantânea: nunca abre PDF na hora de buscar.
- O custo de carregar as letras não aparece para a pessoa: baixam em segundo plano depois do login.
- Se a pessoa buscar antes de terminarem (raro), a seção **Na letra** mostra cartões de esqueleto (Paper 03c);
  os resultados por título/cantor aparecem normalmente e não esperam.

## Fora de escopo e anti-metas

- Não funciona no filtro **Cantores** (decisão da pessoa).
- Sem tolerância a erro de digitação, sem ranking por relevância além do descrito abaixo, sem OCR de PDF escaneado,
  sem edição manual da letra, sem buscar por acorde.
- Não prometer uso offline na tela: funciona offline só na medida em que o cache do Firestore já funciona para `songs`.
- Anti-meta: não pode piorar a abertura do app (a assinatura das letras só começa depois que `songs` está pronta)
  nem engordar o documento `songs` (a lista leve continua leve).

## Abordagens consideradas

Onde guardar o texto das letras:

1. **Um documento por música em `songLyrics/{songId}` (escolhida).** O app já assina `songs` com `onSnapshot`
   e cache persistente (`persistentLocalCache`); uma assinatura paralela relê só o que mudou depois da primeira carga,
   então o custo de leituras é de uma vez por aparelho. Mesmo modelo de `songs`; regras e exclusão simples.
2. Letras em blocos de ~100 músicas por documento: menos leituras na primeira carga, mas a atualização de um bloco
   a cada upload/edição/exclusão é bem mais complicada. Só se as leituras virarem problema.
3. Um `lyrics.json` no Storage regenerado por Cloud Function: um download só, mas exige a função, fica desatualizado
   por instantes e foge do padrão do app.

Como extrair a letra: no navegador, na hora do upload (o app já lê o PDF com pdf.js), e não numa Cloud Function.
Não há custo de servidor nem novo gatilho, e a letra sai da mesma leitura que já detecta acordes.

## Decisões

### Dados

`songLyrics/{songId}` com `text` (string, a letra legível: sem acorde, com acentos, linhas separadas por `\n`),
`createdBy`, `createdAt`. Só `text` é guardado; a normalização acontece em memória na hora de montar o índice.

- Regras: leitura para qualquer logado; `create` só para membro/admin, com `songs/{songId}` existindo na mesma
  operação (`existsAfter`), campos exatamente esses, `text` entre 1 e 20.000 caracteres e `createdBy == auth.uid`;
  `update`/`delete` negados (a exclusão é feita pela Cloud Function com Admin SDK).
- Só o primeiro envio de uma música nova grava a letra (no mesmo `writeBatch` de `createSongWithArrangement`).
  Outro tom da mesma música não a reescreve: a letra é a mesma e as regras só permitem criar.
- Se o PDF não tiver texto (escaneado), nenhum documento é criado e o envio segue normalmente; a música
  só não é achada por letra.
- `deleteSong` passa a apagar também `songLyrics/{songId}` (idempotente, como o resto da função).
- Editar título/cantor (`updateSongMeta`) não mexe na letra.

### Extração

Nova função em `@cifras/chords` (`extractLyrics`) que recebe as linhas já lidas e devolve o texto das linhas que não
são de acorde nem o indicador de tom, reaproveitando a mesma detecção de `findChords` (`isChordLine`).
`readPdfSuggestion` passa a devolver `lyrics`, e o plano `new-song` carrega esse texto até `createSongWithArrangement`.
Upload e importação em lote já passam por `saveUpload`, então os dois ganham a letra sem código extra.

### Busca

- `useLyrics` / provider de letras, irmão de `useSongs`: assina `songLyrics` quando `songs` fica `ready` e expõe
  `status` (`loading | ready | error`) e `Map<songId, texto>`.
- Uma música casa na letra quando **todas** as palavras buscadas aparecem no texto normalizado, como já é a regra de
  título/cantor (`matchesAll`). Mesma `normalizeText` (sem acento, sem maiúscula, sem pontuação).
- A letra só é consultada com a busca de **3 ou mais caracteres** normalizados (evita "a" casar com tudo).
- Trecho (~120 caracteres) centrado no primeiro local onde a frase aparece junta; se as palavras só aparecem
  separadas, centrado na primeira. O casamento é por palavras do texto original (cada palavra normalizada na hora),
  então o destaque usa o texto com acento, sem precisar mapear posições.
- Ordem dentro de **Na letra**: primeiro as que têm a frase inteira junta, depois as outras; empate por título.
- Uma música que já aparece em **Músicas** ou **Harpa** por título/cantor não repete em **Na letra**.
- **Na letra** é uma seção só (músicas e hinos da Harpa juntos; o cartão mostra o cantor). Em **Tudo** aparece depois de
  Cantores, Músicas e Harpa; em **Músicas** só com músicas comuns; em **Harpa** só com hinos; em **Cantores** não aparece.
- Campo de busca: placeholder "Buscar música, cantor ou letra…" (e o `aria-label` correspondente).
- Erro ao carregar letras: a seção **Na letra** simplesmente não aparece; título e cantor seguem funcionando.
- "Nada encontrado" só aparece quando nenhuma seção (incluindo **Na letra**) tem resultado e as letras já carregaram.

### Músicas já enviadas (preenchimento)

Script `scripts/lyrics/backfill.mjs` (Admin SDK, credenciais ADC, como `scripts/pads/upload.mjs`): para cada música sem
`songLyrics`, baixa um PDF feito à mão, extrai a letra com a mesma função e grava o documento. Idempotente (nunca
sobrescreve), com `--dry-run` e relatório final (quantas gravadas, quantas sem texto). Rodado uma vez por quem tem
acesso, no Cloud Shell, depois do deploy. Até lá, só músicas novas são achadas por letra.

### Testes

Unitários para `extractLyrics`, para o casamento/trecho/ordem da busca por letra e para o provider; regras
(`tests/rules`) para criar/negar `songLyrics`; teste da Cloud Function `deleteSong`; testes da `BuscaPage`
(filtros, esqueleto, erro, "nada encontrado"); um e2e no emulador (envia PDF novo → busca por um verso → acha).

## O que fica para quem implementa

Forma exata do trecho (corte nas bordas de palavra), tratamento de PDFs com letras em duas colunas,
nomes/estilos de CSS da seção e do esqueleto (seguir o Paper e o design system), e a divisão em tarefas do plano.

## Escolhas minhas (não vieram da conversa)

3 caracteres mínimos para consultar letra; limite de 20.000 caracteres por letra; "Na letra" única misturando
Harpa e músicas; esconder **Na letra** quando as letras falham; não repetir em **Na letra** o que já casou por título.

## Lançamento

Fluxo normal (feature → `develop` → `main`). As regras do Firestore e a função `deleteSong` sobem no deploy do `main`
junto com o web. Depois do deploy, rodar o preenchimento uma vez.
