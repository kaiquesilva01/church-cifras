# Church Cifras — Documento de Design

- **Data:** 2026-11-13
- **Status:** rascunho para aprovação
- **Autor da ideia:** responsável pelo ministério de louvor (dono do produto)

> Convenção: itens marcados **[decidido]** foram definidos pelo dono do produto.
> Itens marcados **[proposta]** são decisões técnicas/de produto tomadas por nós e aceitas na conversa.
> Itens marcados **[decisão nossa]** foram resolvidos por nós sem consulta, por não mudarem o que é construído — revisar ao ler.

---

## 1. Intenção e porquê

O ministério de louvor precisa de um acervo único de cifras, acessível no celular/tablet durante ensaios e cultos.
Hoje as cifras são feitas à mão: o responsável copia do Cifra Club para um Google Docs, ajusta o layout manualmente
(duas colunas, espaçamentos, marcações como `En____tão`) e exporta PDF. **Esse processo continua manual** [decidido].

A dor central: quando a música será cantada em outro tom e não existe PDF salvo naquele tom, é preciso refazer o documento.
O sistema resolve isso **trocando apenas os acordes** do PDF existente, preservando todo o layout feito à mão,
e salvando o novo PDF como mais um tom da mesma música [decidido].

## 2. Usuários e papéis

Todo acesso exige login com conta Google; não há link público [decidido].

| Papel | Pode |
|---|---|
| **Visitante** (padrão no 1º login) | Buscar, abrir e baixar cifras e tons já salvos [decidido] |
| **Membro** | + subir cifras, gerar e salvar tons novos [decidido] |
| **Admin** | + editar/apagar cifras, dar/tirar papéis [decidido] |

- O visitante **não vê** o "Mudar tom"; vê apenas os atalhos dos tons já salvos [decidido].
- Primeiro admin: e-mail(s) configurados via variável de ambiente `ADMIN_EMAILS` [proposta].
- Segurança garantida no backend (Firestore/Storage Security Rules), não só na interface [proposta].

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Buscar música por nome da música ou do cantor; navegar por cantor.
2. Upload de PDF (formato descrito na §6.1) com música, cantor e tom; importação em lote do acervo existente.
3. Trocar o tom de qualquer cifra com prévia instantânea e salvar o resultado como novo tom.
4. Mobile-first (celular/tablet), responsivo para computador [decidido].
5. Rodar 100% localmente em Docker antes de qualquer deploy [decidido]; MVP hospedado no Firebase [decidido].

**Não-objetivos (MVP)**
- Editor de cifras no sistema (o PDF continua sendo feito no Google Docs).
- Modo offline completo (internet da igreja é estável [decidido]); apenas cache de app/arquivos.
- OCR/PDF escaneado, PDFs fora do padrão, upload de DOCX.
- Setlists/repertório de culto, comentários, playback de áudio.

**Anti-objetivos (falha mesmo que "funcione")**
- Alterar qualquer coisa além dos acordes e do tom no título (layout, letra, espaçamento).
- Acorde trocado fora do lugar (deslocado da sílaba).
- Trocar texto em negrito que não é acorde (ex.: `Intro:`) ou deixar acorde sem trocar **sem avisar**.
- Abrir uma cifra demorar a ponto de atrapalhar o início do louvor.

## 4. Restrições

- **Stack:** React + Node [decidido]; TypeScript em tudo [proposta].
- **Hospedagem:** Firebase (Hosting, Auth, Firestore, Storage, Cloud Functions) [decidido]. Cloud Functions exigem plano **Blaze** (cartão; cota grátis deve cobrir o uso) [aceito].
- **Local:** Firestore e Storage ("blob") simulados em Docker [decidido] — via Firebase Emulator Suite, que espelha a produção.
- **Repositório:** monorepo no GitHub [decidido], com GitHub Actions de deploy para produção [decidido].
- **Fluxo Git** [decidido]:
  - `main` = produção; `develop` = integração/teste local.
  - Nenhum commit direto em `main` (nem em `develop`).
  - Features saem de `develop` e abrem PR para `develop`.
  - **Apenas `develop` abre PR para `main`.**
- **Equipe de agentes** (harness) criada antes de qualquer implementação [decidido] — §12.

## 5. Abordagens consideradas

### 5.1 Troca de tom
| | Abordagem | Trade-off | |
|---|---|---|---|
| **A** | **Sobrepor acordes no PDF, no navegador** | Instantâneo, sem servidor, barato. Texto antigo fica escondido por baixo (copiar texto traz o acorde velho); fonte Courier ≈ Courier New | **Escolhida** [decidido] |
| B | Reescrever o texto no conteúdo do PDF | PDF limpo e copiável, mas a fonte embutida pelo Google Docs é *subset* (pode faltar o glifo `b`, etc.) | **Em observação** [decidido] — deve ser plugável para testes (§6.5) |
| C | Upload de DOCX + conversão no servidor (LibreOffice) | Servidor pesado, lento, layout pode divergir do Google Docs, dois uploads | Descartada |

### 5.2 Arquitetura
| | Abordagem | Trade-off | |
|---|---|---|---|
| **1** | **React direto no Firebase (SDK + Security Rules) + Node em Cloud Functions só para o que é privilegiado** | Rápido (sem hop/cold start na leitura), cache do Firestore, pouco código. Exige Blaze | **Escolhida** [decidido] |
| 2 | API Node (Express) na frente de tudo | Modelo clássico, mas hop extra + cold start de 1–3 s, mais código | Descartada |
| 3 | Sem Node | Grátis sem cartão, mas contraria "React + Node" e papéis/contagens ficam frágeis | Descartada |

### 5.3 Controle "Mudar tom" no celular
A (menu suspenso no topo, estilo Cifra Club), **B (painel que sobe de baixo)**, C (faixa de tons sempre visível).
**B escolhida** [decidido]. No computador/tablet deitado vira painel lateral fixo [proposta].

## 6. Design técnico

### 6.1 Formato de PDF suportado (verificado em 8 PDFs reais do acervo)
PDFs exportados do Google Docs, com texto real (não imagem). **O formato varia entre arquivos** — a detecção não pode
depender de uma fonte específica. O que foi observado:

| Aspecto | Variações encontradas |
|---|---|
| Fonte dos acordes | Courier New Bold, Roboto Mono Bold (monoespaçadas); **Roboto Bold, Arial Bold (proporcionais)** |
| Fonte da letra | Courier New, Roboto Mono, Roboto, Arial (regular) |
| Tom | `(Bb)` no fim do título; linha `Tom: E` (às vezes o tom é link/cor diferente, não negrito); ausente em 2 arquivos; às vezes no nome do arquivo (`Renova-me - G.pdf`) |
| Título | `Música - Cantor`, `Cantor - Música`, `Música – Cantor`, `Música \| CANTOR`, só `Música`, ou ausente; medleys com `+` (`DEUS DOS DEUSES + HÁ UMA SAÍDA`) |
| Rótulos | `Intro:`, `[Intro]` (regular), `2x`, `(2x)`, `( D9 Bm7 D9 Bm7 )` |
| Agrupamento | normalmente 1 item de texto por acorde; às vezes vários acordes num item (`Intro: A# F/A D#9 ...`); às vezes um acorde quebrado em pedaços (`B` `m` `7`) |
| Layout | 1 ou 2 colunas, posições absolutas |

**Regra de detecção** (um protótipo aplicado aos 8 PDFs reconheceu as linhas de acorde; as únicas exceções eram títulos em negrito,
`(2x)` e um acorde quebrado em pedaços — cobertos pelos passos 1 e 3 abaixo):
1. Agrupar itens de texto por **linha** (mesmo y, mesma coluna) e juntar pedaços adjacentes sem espaço entre eles (`B`+`m`+`7` → `Bm7`).
2. Considerar apenas texto **em negrito** (nome da fonte contém `Bold`, tolerante a prefixo de subset `BAAAAA+` e `,Bold`).
3. Uma linha é **linha de acordes** se todos os seus tokens em negrito são acordes ou rótulos permitidos
   (`Intro:`, `[...]`, `Nx`, `(Nx)`, `(`, `)`, `-`, `–`, `|`). Linhas com qualquer palavra que não seja acorde (ex.: títulos
   em negrito) são ignoradas — isso evita trocar o "E" (conjunção) de um título em maiúsculas.
4. Posição de cada token: em fontes monoespaçadas, x do item + índice × largura do caractere; em proporcionais, medida
   com as larguras de glifo da fonte do PDF (expostas pelo `pdf.js`).
5. **Indicador de tom no PDF:** `(X)` no fim do título **ou** `Tom: X` (em qualquer fonte/estilo). Ambos são atualizados
   na troca de tom. Se não houver indicador, nada é escrito — o tom vive só nos metadados.
6. Outras fontes (ex.: MS-Gothic em sublinhados como `En____tão`) são ignoradas.

**Metadados no upload são sugestões, não verdade:** música/cantor/tom vêm do título, da linha `Tom:` e do nome do arquivo,
mas a ordem música/cantor varia. O formulário (e a tabela da importação em lote) permite editar e tem um botão
**⇄ inverter música/cantor**; quando um dos lados já é um cantor cadastrado, ele é usado para decidir a ordem.
Se o tom não for encontrado, o sistema sugere um a partir dos acordes (primeiro/último acorde) e pede confirmação.
**O tom confirmado pelo usuário é a referência da transposição.** Medleys (`A + B`) são tratados como uma música só.

**Fontes de substituição** (para o acorde novo ficar visualmente igual): o writer escolhe uma fonte livre equivalente à original —
Courier New → Liberation Mono Bold (métrica idêntica), Arial → Liberation Sans Bold (métrica idêntica), Roboto → Roboto Bold,
Roboto Mono → Roboto Mono Bold; desconhecida → Helvetica-Bold padrão. Fontes empacotadas no app (licenças OFL/Apache),
carregadas sob demanda só para a família usada no PDF.

**Risco remanescente:** 8 PDFs é uma amostra pequena. A importação em lote funciona como teste em massa: arquivos
`fora do padrão` ou com colisões no relatório mostram onde a gramática precisa evoluir. Os 8 PDFs viram fixtures locais
(fora do Git — ver §6.2) e cada nova variação encontrada vira também um PDF sintético na CI.

### 6.2 Pacote `@cifras/chords` (núcleo puro, sem dependências de UI)
- **Gramática de acorde:** `raiz [A-G](#|b)?` + qualidade (m, maj7, 7M, 7, 9, 11, 13, sus2/4, dim, °, aug, +, add9, (9), (b5), etc.)
  + baixo opcional `/[A-G](#|b)?`. Acordes entre parênteses `(A9)` também são reconhecidos.
- **Transposição:** por semitons entre tom de origem e destino; raiz e baixo transpostos; qualidade preservada.
- **Grafia por tom de destino** [proposta]: tons C, G, D, A, E, B, F#, C# e menores relativos → sustenidos;
  F, Bb, Eb, Ab e menores relativos → bemóis. Ex.: em Bb sai `Bb`/`Eb`, em E sai `F#`/`C#`.
- **Seletor de tons:** 12 tônicas `C C# D Eb E F F# G Ab A Bb B`, mantendo o modo do original (se o original for `Am`,
  o seletor mostra tônicas menores) [decisão nossa].
- **Tom:** confirmado pelo usuário no upload (§6.1); normalizado para a lista acima (`A#` → `Bb`, etc.).
- Saída principal: um **TransposePlan** — lista de substituições `{page, x, y, fontSize, width, original, replacement, collides}`
  + substituição do indicador de tom (`(X)` ou `Tom: X`). **O mesmo plano alimenta a prévia (canvas) e o gerador de PDF** → o que se vê é o que se salva.
- **Colisão:** se a largura do novo acorde invadir o próximo token da mesma linha (com margem de 1 caractere),
  `collides = true` → prévia destaca e o usuário é avisado (pode salvar mesmo assim) [proposta].
- Testes extensos. **O repositório é público** [decidido], então os PDFs reais (letras com direitos autorais) **não são commitados**:
  ficam numa pasta local ignorada pelo Git (`fixtures/private/`) e alimentam testes que só rodam quando a pasta existe.
  Na CI, os testes usam **PDFs sintéticos** gerados no próprio teste, reproduzindo cada variação da tabela da §6.1
  (fontes mono/proporcionais, `(X)` e `Tom: X`, títulos variados, acorde quebrado em pedaços), com letra fictícia.

### 6.3 Prévia no navegador
- `pdf.js` renderiza cada página em `<canvas>` (com `devicePixelRatio`).
- Camada de sobreposição desenha, a partir do TransposePlan, um retângulo branco sobre cada acorde original e o novo acorde
  na fonte de substituição (§6.1), mesma posição e tamanho. Acordes alterados podem ser realçados durante a prévia; colisões em destaque.
- Troca de tom na prévia deve ser **instantânea** (apenas redesenho da camada; o PDF não é re-renderizado).

### 6.4 Geração do PDF (Writer)
- Interface `ChordWriter { write(pdfBytes, plan): Promise<Uint8Array> }`.
- **`OverlayWriter`** (padrão, abordagem A) com `pdf-lib`: retângulo branco sobre cada acorde/título original;
  novo texto na fonte de substituição equivalente à original (§6.1), embutida com subset via `@pdf-lib/fontkit`.
- **`RewriteWriter`** (abordagem B, em observação): esqueleto + flag; implementação pode vir depois.
- Seleção do writer por flag de configuração (`VITE_CHORD_WRITER=overlay|rewrite`), para comparação lado a lado.
- **Atualização 2026-11-15:** na Fase 5 as fontes de substituição são embutidas **completas**, não em subset: o subsetter
  do `@pdf-lib/fontkit` descarta glifos (D, F, #, ...) nas fontes usadas e o acorde novo some. Os PDFs gerados ficam de
  ~7 a 13× maiores que o original. A Fase 7 entrega TTFs pré-reduzidos (charset de acordes + Latin-1) para voltar ao tamanho pequeno.

### 6.5 Modelo de dados (Firestore)
```
users/{uid}
  displayName, email, photoURL, role: 'viewer'|'member'|'admin', createdAt

// Não há coleção `artists`: a lista de cantores é derivada no cliente a partir de `songs`
// (artistId = slug normalizado do nome; contagem calculada em memória).
songs/{songId}                     // songId aleatório
  title, titleNormalized, artistId, artistName,
  keys: string[]                   // tons salvos, desnormalizado p/ listagem
  handmadeKeys: string[]           // tons com PDF feito à mão
  createdBy, createdAt, updatedAt

songs/{songId}/arrangements/{key}  // id do doc = tom normalizado ('D', 'Bb', 'Am') → 1 doc por tom
  key, storagePath,
  source: 'handmade'|'generated',  // uma música pode ter vários 'handmade'
  derivedFromKey|null,             // só para 'generated'
  writer: 'upload'|'overlay'|'rewrite', chordCount, collisions,
  createdBy, createdAt
```
- **Storage:** `songs/{songId}/{key}-{fileId}.pdf` (`fileId` aleatório). Arquivos são imutáveis — substituir um tom grava
  um arquivo novo em outro caminho e apaga o antigo → `Cache-Control: public, max-age=31536000, immutable` é seguro.
- **Unicidade de tom:** um `arrangements/{key}` só existe uma vez. Duas pessoas gerando `D` ao mesmo tempo → a segunda
  recebe "já existe" e o sistema abre o existente.
- **Identidade da música:** `titleNormalized + artistId`. Usada para detectar upload de música já existente (§6.9).
- **Normalização** de nomes (busca e cantor): minúsculas, sem acentos, sem pontuação, espaços colapsados.
  "Aline Barros" e "aline barros " → mesmo `artistId`. Campo cantor no upload sugere nomes existentes.

### 6.6 Busca
- Acervo esperado: centenas de músicas. A lista leve de `songs` (metadados) é carregada uma vez e filtrada **em memória**
  (instantâneo, insensível a acento/maiúsculas), com cache persistente do Firestore [proposta].
- **Aba Músicas:** filtra por título **ou** cantor [decidido]. **Aba Cantores:** lista A–Z com contagem; filtra só por cantor;
  ao tocar, lista as músicas daquele cantor com filtro próprio [decidido].
- Se o acervo passar de ~2.000 músicas, revisitar (índice dedicado).

### 6.7 Cloud Functions (Node, TypeScript)
| Função | Gatilho | Responsabilidade |
|---|---|---|
| `onUserCreated` | Auth onCreate | Cria `users/{uid}` com `role: viewer` (ou `admin` se e-mail em `ADMIN_EMAILS`) e define custom claim |
| `setUserRole` | Callable (admin) | Altera papel no doc e no custom claim; o cliente força refresh do token |
| `onArrangementWritten` | Firestore | Mantém `songs.keys` sincronizado |
| `deleteSong` | Callable (admin) | [implementada] Apaga a música, todos os `arrangements` e os arquivos do Storage; idempotente (substitui o antigo gatilho `onSongDeleted`) |
| `deleteArrangement` | Callable (admin) | [implementada] Apaga um tom e seu arquivo; **recusa** apagar o último `handmade` se houver `generated` (checagem e exclusão do doc numa transação; arquivo apagado após o commit) |
| `replaceArrangement` | Callable (membro/admin) | [implementada] Substitui um tom `generated` por um `handmade` recém-enviado (troca doc + apaga arquivo antigo); recusa se o existente for `handmade` |
| `updateSongMeta` | Callable (admin) | [implementada] Corrige título/cantor (recalcula `titleNormalized`/`artistId`; recusa identidade já usada por outra música); **não altera PDFs** |
| `discardUpload` | Callable (membro/admin) | [implementada] Descarta um arquivo enviado e ainda não referenciado por nenhum `arrangement`; só o autor do upload (metadado `uploadedBy`) |

Papéis lidos nas Security Rules via `request.auth.token.role`. O cliente observa `users/{uid}` e, ao mudar o papel,
chama `getIdToken(true)`.

### 6.8 Security Rules (resumo)
- Leitura de tudo: apenas autenticado.
- `songs`/`arrangements` create: `member|admin`; `songs` e `arrangements` sem update/delete pelo cliente. A exclusão de
  música só ocorre pela callable admin `deleteSong`; o delete direto do cliente é negado (substituição, exclusão de tom e
  edição de metadados também passam pelas callables da §6.7, que aplicam as regras de negócio).
- `users`: cada um lê o próprio; admin lê todos; escrita só via Functions.
- Não há coleção `artists` (cantores derivados no cliente); a regra, se existir, nega qualquer escrita.
- Storage `songs/**`: leitura autenticado; escrita `member|admin`, `contentType == application/pdf`, tamanho ≤ 10 MB,
  sem sobrescrever arquivo existente.
- Regras cobertas por testes com `@firebase/rules-unit-testing` no emulador.

**Riscos aceitos** (conhecidos e tolerados nesta versão):
- Corridas de identidade: renomear (`updateSongMeta`) ou criar músicas ao mesmo tempo pode gerar duas músicas com a mesma
  identidade (`titleNormalized + artistId`); a checagem não é transacional. Resolve-se manualmente pelo admin.
- Atraso do custom claim: mudança de papel só vale para escritas após o refresh do token (até ~1 h se o cliente não
  forçar `getIdToken(true)`).
- Texto antigo sob o overlay: ao sobrescrever acordes de um PDF `generated`, o texto original dos acordes pode continuar
  no conteúdo do PDF sob a camada desenhada.

### 6.9 Fluxos
**Upload (membro/admin):** escolher PDF → `pdf.js` lê no navegador → pré-preenche música/cantor/tom pelo título e conta
acordes → se 0 acordes, avisa "fora do padrão" e bloqueia → usuário confere/edita → o sistema verifica se a música já existe
(`titleNormalized + artistId`) [decidido]:
- **Música nova:** upload para Storage → batch cria `songs/{id}` + `arrangements/{tom}` (`source: handmade`).
- **Música existe, tom não existe:** oferece "Adicionar como tom X de <música>" → cria `arrangements/{tom}` (`handmade`).
- **Música existe, tom existe e é `generated`:** o feito à mão **substitui** o gerado (`replaceArrangement`).
- **Música existe, tom existe e é `handmade`:** bloqueia e avisa; para trocar, um admin apaga o tom antes.

**Mudar tom (membro/admin):** abrir cifra → "Mudar tom" (painel inferior / lateral) → tocar num tom: se já salvo, marcado
em verde e "Confirmar" apenas abre; senão, prévia instantânea → "Confirmar" → `OverlayWriter` gera PDF no navegador →
upload → cria `arrangements/{tom}` (`derivedFromKey` = tom de origem) → abre o novo tom.
A transposição parte **sempre de um PDF `handmade`**, nunca de um `generated`, para não acumular sobreposições [decidido].
Fonte escolhida: o tom aberto, se for `handmade`; senão o `derivedFromKey` dele, se ainda existir; senão qualquer `handmade`
da música [decisão nossa].

**Administração (admin)** [decidido]:
- Apagar **um tom** específico (ex.: gerado com colisões) e gerá-lo de novo.
- Apagar a **música inteira** (todos os tons e arquivos).
- Corrigir **título e cantor** apenas nos metadados — o título impresso no PDF não muda.
- **Não** é permitido apagar o último `handmade` enquanto existirem tons `generated`. Para trocar esse PDF, sobe-se um novo
  `handmade` no mesmo tom (fluxo de upload).

**Pessoas (admin):** lista de usuários que já logaram, com seletor de papel.

**Importação em lote (admin)** [decidido]: tela web (pensada para computador) que aceita vários PDFs ou uma pasta
[decisão nossa: web em vez de script de linha de comando, para reutilizar o mesmo leitor e funcionar contra produção].
Cada arquivo passa pelo mesmo leitor do upload, no navegador, e aparece numa tabela com: música, cantor e tom lidos do título,
nº de acordes e status (`pronto`, `já existe — novo tom`, `substitui gerado`, `conflito: tom feito à mão já existe`,
`fora do padrão`). O admin pode corrigir campos na tabela e clica em "Importar prontos"; os demais ficam de fora com o motivo.
Ao final, relatório baixável (CSV) dos que não entraram. Upload em fila com concorrência limitada e progresso visível.

### 6.10 Telas (mockups aprovados na conversa)
- **Início/Busca** com abas Músicas | Cantores; botão "＋ Nova cifra" só para membro/admin.
- **Cantor:** músicas do cantor, tons salvos como atalhos, filtro próprio.
- **Visualizador:** cabeçalho (música · cantor · tom atual), PDF, tons salvos como atalhos; "Mudar tom" → painel inferior
  (celular) / lateral (≥ tablet deitado) com 12 tons, tons salvos em verde, ±½, Cancelar / Confirmar.
- **Nova cifra:** seleção do PDF, campos pré-preenchidos (com selo "lido do PDF"), sugestão de cantores existentes,
  miniatura, aviso de música/tom já existente, "Salvar cifra".
- **Pessoas** (admin). **Importar em lote** (admin, computador).
- Mockups da conversa salvos em `.superpowers/brainstorm/` (fora do Git).
- Visual: cor de destaque neutra (roxo) até o ministério enviar logo/cores [proposta].

### 6.11 Performance
- Vite + code splitting por rota; `pdf.js` (com worker) e `pdf-lib` carregados **sob demanda** só no visualizador/upload.
- Cache persistente do Firestore; PDFs com cache imutável; PWA (service worker do app shell, instalável na tela inicial).
- Meta: abrir uma cifra já visitada em < 1 s no celular; troca de tom na prévia < 100 ms.

## 7. Ambiente local (Docker) [decidido: tudo sobe no Docker]
`docker compose up` sobe:
- **emulators:** Firebase Emulator Suite (Auth, Firestore, Storage, Functions, Emulator UI), com `--import/--export-on-exit`
  em volume para persistir dados entre execuções.
- **functions:** build TypeScript em watch, recarregado pelo emulador.
- **web:** Vite dev server com HMR apontando para os emuladores.
- **seed (opcional):** script que cria usuários de teste (admin, membro, visitante) e uma cifra de exemplo.

O login Google é simulado pelo Auth Emulator (contas fictícias). Nenhuma credencial real é necessária para testar.

## 8. Repositório e qualidade
```
apps/web          React + TS (Vite)
apps/functions    Cloud Functions (Node, TS) — empacotadas com bundler (esbuild/tsup) para incluir pacotes do workspace
packages/chords   núcleo de acordes/transposição/TransposePlan (puro, 100% testado)
firebase.json, firestore.rules, storage.rules, firestore.indexes.json
docker-compose.yml, .github/workflows/, .claude/ (harness), docs/
```
- npm workspaces [decisão nossa]; TypeScript `strict`; ESLint + Prettier; Conventional Commits (commitlint) + husky/lint-staged.
- Testes: Vitest (unidade/componentes, Testing Library), rules-unit-testing (regras), Playwright (E2E contra emuladores).
- TDD para `packages/chords`, regras e Functions.

## 9. CI/CD (GitHub Actions)
- **ci.yml** — em PR para `develop` e `main`: install, lint, typecheck, testes (incluindo regras e Functions no emulador), build.
- **deploy.yml** — em push para `main`: deploy de Hosting, Functions, Rules e Indexes no projeto Firebase de produção
  (credencial via secret do GitHub). Pronto, mas só funciona após o dono criar o projeto Firebase e cadastrar o secret.
- **Sem proteção de branches no GitHub** [decidido]. As regras do fluxo Git ficam no `AGENTS.md` e são impostas aos
  agentes pelos hooks do Claude Code (§12).

## 10. Repositório GitHub
- **Criado:** https://github.com/kaiquesilva01/church-cifras — **público** [decidido], branches `main` e `develop` já existem.
- Sem proteção de branches (§9). Nunca commitar: PDFs reais, credenciais, `.env`, service accounts, `.superpowers/`.
- Configuração web do Firebase (apiKey etc.) não é segredo; credencial de deploy vai em GitHub Secrets.

## 11. Ordem de entrega (cada item = branch a partir de `develop` + PR para `develop`)
0. **Harness e guard-rails** (§12) + este documento.
1. Esqueleto do monorepo, Docker/emuladores, CI, deploy preparado.
2. Auth + papéis (Functions, rules, tela Pessoas).
3. `packages/chords` (gramática, transposição, grafia, TransposePlan) com fixtures.
4. Upload (incl. música/tom existente) + listagem/busca (abas Músicas/Cantores, tela do cantor).
5. Visualizador + Mudar tom (prévia, OverlayWriter, salvar/abrir); esqueleto do RewriteWriter.
6. Administração (apagar tom/música, editar metadados) + importação em lote.
7. PWA, cache, polimento de performance, E2E completos.

## 12. Harness (antes de qualquer implementação) [decidido]
- **`AGENTS.md`** [decidido] com as regras do projeto: fluxo Git (fonte única da regra "só `develop` → `main`"), TDD,
  convenções, comandos. `CLAUDE.md` apenas importa o `AGENTS.md`.
- **Agentes** em `.claude/agents/`: `product-owner`, `designer`, `tech-lead`, `frontend-dev`, `backend-dev`, `qa`,
  `code-reviewer` — cada um com escopo, ferramentas e critérios de pronto. Tarefas paralelas independentes são distribuídas
  entre eles; o `code-reviewer` revisa todo PR antes do merge.
- **Guard-rails (hooks do Claude Code):** bloquear commit/push direto em `main`/`develop`; bloquear `gh pr create --base main`
  quando a origem não for `develop`; lembrete de rodar testes antes de abrir PR.
- Uso das skills do superpowers: writing-plans, test-driven-development, subagent-driven-development,
  requesting-code-review, verification-before-completion.
- **Modelo na implementação [decidido]:** toda escrita de código roda em **Sonnet 5.5 com effort `medium`**.
  Agentes de implementação (`frontend-dev`, `backend-dev`, `qa`) têm `model: sonnet` e `effort: medium` no frontmatter;
  despachos de implementação via subagente passam o mesmo. Design, planejamento e revisão podem usar Opus.

## 13. Deixado para quem constrói
- Escolha exata de bibliotecas de UI (componentes, roteador, estado) dentro do React — priorizar leveza.
- Detalhes da gramática de acordes além do listado, desde que os anti-objetivos sejam respeitados.
- Estrutura interna de pastas de cada app.
- Ajustes finos de visual (tipografia, espaçamentos) seguindo os mockups.
