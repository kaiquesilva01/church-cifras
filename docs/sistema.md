# Mapa do sistema — Church Cifras

Cada PR de entrega atualiza este arquivo; o `code-reviewer` cobra quando faltar.

Resumo do que o app faz hoje, para os agentes de negócio lerem antes de refinar uma issue. Quando um spec e o código divergem, vale o código e a divergência vai em "Limites conhecidos e pendências". Detalhes: specs em `docs/superpowers/specs/`, [design-system.md](design-system.md), [deploy.md](deploy.md).

**Em uma frase:** site de cifras (PDFs com acordes) do ministério de louvor de uma igreja: busca, abre a cifra no celular, troca o tom sobrepondo acordes novos no PDF, monta repertórios de culto e toca um pad ambiente no tom da música. Todo acesso exige login Google; não há link público.

Stack: React + TypeScript (`apps/web`), Cloud Functions Node (`apps/functions`), núcleo de acordes (`packages/chords`), sobreposição no PDF (`packages/overlay`), Firebase (Hosting, Auth, Firestore, Storage), monorepo npm. Região `southamerica-east1`.

## Telas

Rotas em `apps/web/src/App.tsx`. Tudo fora de `/login` exige login (`RequireAuth`); rota desconhecida volta para `/`.

| Rota | Tela | Quem acessa | O que faz |
| --- | --- | --- | --- |
| `/login` | Login | qualquer um | Entrar com Google. Abrir um link sem estar logado leva ao login e, depois, volta ao destino |
| `/` | Início | logado | Cartão "Próximo culto"; abas Músicas, Harpa, Cantores e Repertórios; campo de busca; "＋ Nova cifra" só para membro/admin |
| `/busca` | Busca | logado | Busca com filtros Tudo, Músicas, Cantores, Harpa; seção "Na letra" |
| `/pad` | Pad | logado | Status, grade de 12 tons, volume, parar |
| `/mais` | Mais | logado | Perfil e papel; Admin (só admin); Importar (só admin); Estatísticas (só admin); Pessoas "Em breve"; Sair |
| `/cantores/:artistId` | Cantor | logado | Músicas do cantor, com filtro próprio |
| `/musicas/:songId` | Visualizador | logado | Cifra em PDF, atalhos dos tons salvos, barra de ações, Mudar tom |
| `/repertorios/:id` | Repertório | logado (edita membro/admin) | Lista de louvores com tom; editar, reordenar, compartilhar |
| `/nova` | Nova cifra | membro, admin | Upload de PDF com formulário |
| `/pessoas` | Pessoas | admin | Lista de quem já logou, com seletor de papel |
| `/estatisticas` | Estatísticas | admin | PDFs, armazenamento, cifras mais usadas |
| `/importar` | Importar em lote | admin | Vários PDFs de uma vez (pensada para computador) |

Barra inferior (Músicas, Repertório, Busca, Pad, Mais) só nas 5 telas raiz; as de detalhe e formulários são tela cheia com `‹ Voltar`. Botão sol/lua escolhe tema claro/escuro (lembrado no aparelho; sem escolha, segue o sistema).

### Início e busca

- Músicas: filtra por título ou cantor, em memória, sem acento nem maiúscula. A lista leve de `songs` é carregada uma vez, com cache persistente do Firestore.
- Harpa: músicas cujo cantor é "Harpa" (hinos). Ficam só na seção Harpa, fora de Músicas, Cantores e Busca.
- Cantores: lista A–Z com contagem; filtra só por cantor; tocar abre a tela do cantor.
- Busca por letra: com 3 ou mais caracteres, a seção "Na letra" mostra músicas em que todas as palavras aparecem na letra, com trecho destacado. Vale em Tudo, Músicas e Harpa (Busca) e nas abas Músicas e Harpa da Início; não vale em Cantores, na aba Repertórios nem no seletor de músicas do repertório. Letras baixam em segundo plano; enquanto carregam, "Na letra" mostra esqueletos; se falharem, a seção some.
- A letra é extraída do PDF no navegador, no upload; só o primeiro envio de uma música nova a grava.

### Visualizador (cifra)

- Cabeçalho com música, cantor e tom; PDF em papel branco (também no tema escuro), com botão de tela cheia.
- Atalhos dos tons salvos (o padrão em âmbar). O visitante só vê os atalhos, não o "Mudar tom".
- Barra de ações: WhatsApp (abre a folha de compartilhar do aparelho com o PDF do tom exibido; some se o navegador não compartilha arquivo), **Pad** (liga/desliga o pad do tom exibido), **Mudar tom** (só membro/admin).
- Mudar tom: painel inferior com 12 tons (salvos em verde, escolhido em âmbar), ± ½ tom, Cancelar/Confirmar. A prévia é instantânea (só redesenha uma camada sobre o PDF). Se o tom já existe, Confirmar apenas abre; senão gera o PDF no navegador, envia e abre o novo tom.
- Transposição parte sempre de um PDF feito à mão, nunca de um gerado. Só os acordes e o tom no título (`(X)` ou `Tom: X`) mudam; layout e letra não.
- Acorde novo que encosta no seguinte empurra o seguinte para a direita, deixando dois espaços (em cadeia, nunca para a esquerda). Vermelho só para o que não coube (vizinho que não é acorde ou margem); não há aviso de "acorde encosta".
- Aberta pelo repertório (`?repertorio=&item=`): abre no tom do item e mostra "‹ Anterior · N de M · Próxima ›" (navega por `replace`). Trocar o tom na cifra não altera o repertório e mostra "Tom do repertório: X · Voltar ao X".

### Repertórios

- Um repertório = data do culto + rótulo (1–60 caracteres) + até 40 itens ordenados (`songId` + tom). Pode haver mais de um no mesmo dia; a mesma música pode repetir (a UI avisa).
- Padrão de criação: próximo dia que seja quinta ou domingo; rótulo padrão é o dia da semana. Duplicar copia os itens com ids novos.
- Aba Repertórios: "Próximos" (data crescente) e "Recentes" (decrescente, só não expirados). Cartão "Próximo culto" no topo do Início (data mais próxima, hoje incluído).
- Editar (membro/admin): arrastar pela alça `≡` ou botões ▲ ▼, trocar o tom (entre os salvos da música), remover, adicionar pela folha de busca (entra no fim, no tom feito à mão; músicas sem PDF desabilitadas; "já está" nas repetidas). Visitante vê só título e tom, "Somente leitura".
- Item de música apagada aparece como "Música removida" e é pulado na navegação. Tom do item que deixou de existir aparece riscado e a cifra abre no padrão com aviso.
- Tempo real: mudança de outra pessoa mostra o banner "O repertório foi alterado. Atualizar"; a tela só muda se a pessoa aceitar (inclusive o tom da cifra aberta). O primeiro snapshot do cache não gera banner.
- Compartilhar: botão WhatsApp (canto inferior esquerdo, qualquer papel) com título, data, louvores com tom e o link; sem Web Share, copia e avisa "Link copiado.".
- Expira 30 dias depois da data do culto (TTL do Firestore); o cliente também esconde os expirados.

### Upload e importação em lote

- Upload (membro/admin): escolher PDF, o navegador lê título, cantor, tom (título, linha `Tom:` ou nome do arquivo) e conta acordes; o formulário permite editar e inverter música/cantor. 0 acordes = "fora do padrão", bloqueia. Sem tom no PDF, o sistema sugere um e pede confirmação; o tom confirmado é a referência.
- Casos pela identidade da música (`titleNormalized + artistId`): música nova cria música + tom feito à mão; música existe com tom novo adiciona o tom; tom existe e é gerado, o feito à mão substitui; tom existe e é feito à mão, bloqueia (admin apaga antes).
- Importação em lote (admin): tabela por arquivo (`pronto`, `já existe — novo tom`, `substitui gerado`, `conflito`, `fora do padrão`), campos editáveis, "Importar prontos", relatório CSV dos que não entraram, fila com concorrência limitada.

### Administração

- Admin apaga um tom, apaga a música inteira, corrige título e cantor (só metadados; o título impresso no PDF não muda). Não pode apagar o último tom feito à mão enquanto existirem tons gerados.
- Pessoas: lista de quem já logou e troca de papel.
- Estatísticas: total de tons e de músicas (com divisão feitos à mão × gerados), armazenamento dos PDFs de `songs/` (o pad fica de fora), top 10 cifras mais usadas (todo o período e 30 dias). "Uso" = a música estar em repertório já fechado (ver "Functions e jobs").

### Padrões de UI que valem para toda tela

- Mobile-first (390 px; testar 360 px), alvos de toque de 44 px, só tokens de cor, dois temas, Paper atualizado no mesmo PR (ver `docs/design-system.md`).
- Estados obrigatórios: carregando, vazio, erro (e "somente leitura" para visitante). Controles que o papel não pode usar não aparecem.
- Texto de UI em pt-BR.

## Papéis e permissões

Papel em `users/{uid}.role` e no custom claim `role`; lido nas Rules por `request.auth.token.role` (padrão `viewer`).

| Papel | Pode |
| --- | --- |
| Visitante (padrão no 1º login) | Buscar, abrir, baixar e compartilhar cifras; ver repertórios; tocar o pad |
| Membro | + subir cifras, gerar e salvar tons, descartar o próprio upload, substituir tom gerado, criar/editar/duplicar/apagar repertórios |
| Admin | + apagar tom ou música, corrigir título/cantor, alterar papéis, importar em lote, ver Estatísticas |

- Primeiro admin: e-mails em `ADMIN_EMAILS` (variável do deploy), só no primeiro login de cada pessoa e só com e-mail verificado. Depois, o papel muda pela tela Pessoas.
- Mudança de papel só vale para escritas depois do refresh do token; o cliente observa `users/{uid}` e chama `getIdToken(true)`.
- Só o provedor Google fica ativo no Auth (sem e-mail/senha nem anônimo), porque qualquer logado conta como leitor.
- Segurança vale no backend (Rules e Functions), não só na interface.
- Pad e compartilhamento são locais ao aparelho e liberados a todos os papéis; o pad não sincroniza entre pessoas.

## Dados

### Firestore (`firestore.rules`)

Leitura: qualquer logado, exceto `users` (cada um lê o próprio; admin lê todos). Escrita pelo cliente só onde indicado.

| Coleção | Campos principais | Escrita pelo cliente |
| --- | --- | --- |
| `users/{uid}` | `displayName`, `email`, `photoURL`, `role` (`viewer`/`member`/`admin`), `createdAt` | nenhuma (só Functions) |
| `songs/{songId}` | `title`, `titleNormalized`, `artistId` (slug), `artistName`, `keys` (tons salvos, mantido por função), `handmadeKeys`, `createdBy`, `createdAt`, `updatedAt` | só `create` por membro/admin; sem update nem delete |
| `songs/{songId}/arrangements/{slug}` | `key` (um dos 24 tons), `storagePath`, `source` (`handmade`/`generated`), `derivedFromKey` (só gerado), `writer` (`upload`/`overlay`), `chordCount`, `collisions`, `createdBy`, `createdAt` | só `create` por membro/admin; sem update nem delete |
| `songLyrics/{songId}` | `text` (1–20.000 caracteres), `createdBy`, `createdAt` | só `create` por membro/admin, com a música existindo na mesma operação |
| `setlists/{setlistId}` | `date` (`YYYY-MM-DD`), `label`, `items[]` (`id`, `songId`, `key`), `expiresAt`, `createdBy/At`, `updatedBy/At` | membro/admin: create, update e delete |
| `setlistUsage/{setlistId}` | `date`, `songIds`, `countedAt` | nenhuma; só Admin SDK (negado por padrão) |
| `artists/*` | não existe de fato | negada |

- `slug` do tom = tom com `#` trocado por `s` (id do documento). Um tom existe uma vez por música; quem gerar o mesmo tom depois recebe "já existe" e o sistema abre o existente.
- Tom gerado exige que `derivedFromKey` seja um tom feito à mão da mesma música e do mesmo modo (maior/menor); `writer` gerado é sempre `overlay`.
- Não há coleção de cantores: a lista é derivada de `songs` no cliente (`artistId` = nome normalizado: minúsculas, sem acento nem pontuação, espaços colapsados).
- `setlists.items[].id` é um UUID do item (não da música). As Rules não validam o conteúdo de cada item nem se a música existe; o cliente tolera itens inválidos.
- `songs`, `arrangements` e `songLyrics` são imutáveis para o cliente; edição e exclusão passam por Functions.
- TTL do Firestore em `setlists.expiresAt` (fim do dia da data + 30 dias, fuso `America/Sao_Paulo`), com índice ascendente mantido. `setlistUsage` não pode ter TTL.

## Functions e jobs

Todas em `apps/functions/src/index.ts`, região `southamerica-east1`. Chamadas `onCall` conferem o papel por `requireRole` (lê `users/{uid}`).

| Função | Gatilho | Papel | Faz |
| --- | --- | --- | --- |
| `onUserCreated` | Auth (criação de usuário) | automático | Cria `users/{uid}` como `viewer` (ou `admin` se o e-mail verificado estiver em `ADMIN_EMAILS`) e define o claim |
| `setUserRole` | callable | admin | Altera o papel no documento e no claim |
| `onArrangementWritten` | Firestore | automático | Mantém `songs.keys` e `handmadeKeys` sincronizados |
| `replaceArrangement` | callable | membro, admin | Troca um tom gerado por um feito à mão recém-enviado; recusa se o existente é feito à mão |
| `discardUpload` | callable | membro, admin | Apaga arquivo enviado e ainda não referenciado; só o autor do upload |
| `updateSongMeta` | callable | admin | Corrige título/cantor e recalcula `titleNormalized`/`artistId`; recusa identidade já usada; não altera PDFs |
| `deleteArrangement` | callable | admin | Apaga um tom e o arquivo; recusa apagar o último feito à mão se houver gerados |
| `deleteSong` | callable | admin | Apaga música, tons, arquivos e `songLyrics`; idempotente |
| `getStats` | callable | admin | Conta repertórios fechados (idempotente) e devolve contagens, armazenamento e os tops |
| `countSetlistUsage` | agendada, todo dia 04:00 (`America/Sao_Paulo`) | automático | Grava `setlistUsage` dos repertórios fechados |
| `health` | callable | qualquer chamada | Verificação de saúde |

Regras de contagem de uso:

- Repertório de data `D` conta a partir de `D + 2`; antes disso, mexer no repertório do dia do culto não distorce o ranking.
- Uma vez por música por repertório (mesmo em tons diferentes); dois cultos no mesmo dia contam duas vezes.
- Depois de contado, o uso fica congelado. Repertório apagado antes de fechar não conta.
- O job usa o Cloud Scheduler (API ativa; ver `deploy.md` §11).

### Deploy e produção (`docs/deploy.md`)

- Site de produção `louvor-hajaluz` (`https://louvor-hajaluz.web.app`); o site padrão do projeto só redireciona (301) para ele e serve um `sw.js` que desinstala o service worker antigo.
- O workflow Deploy roda a cada push em `main` e publica Hosting, Functions, Rules e índices; o Hosting só sai pelo workflow (nunca de build local).
- Há site de teste fixo `louvor-hajaluz-teste` (faixa "TESTE · #N" no topo), publicado só pelo workflow "Site de teste" disparado a partir da `main`.
- Plano Blaze (Functions). O build das Functions depende de `apps/functions/.npmrc` com `legacy-peer-deps=true`.
- `ADMIN_EMAILS` e as variáveis `VITE_FIREBASE_*` vêm de variáveis do repositório no GitHub; a credencial de deploy é o segredo `FIREBASE_SERVICE_ACCOUNT`.
- O bucket precisa de CORS (`cors.json`) porque o navegador lê os bytes dos PDFs.

## Storage, pad e PWA

### Storage (`storage.rules`)

| Caminho | Leitura | Escrita |
| --- | --- | --- |
| `songs/{songId}/{tom}-{fileId}.pdf` | logado | só criação, por membro/admin: `application/pdf`, até 10 MB, sem sobrescrever, metadado `uploadedBy` igual ao uid |
| `pads/{versão}/{arquivo}.m4a` | logado | ninguém (só script administrativo com Admin SDK) |
| qualquer outro | negado | negado |

- PDFs são imutáveis (substituir grava arquivo novo em outro caminho e apaga o antigo), então o cache de 1 ano é seguro.
- Os PDFs gerados embutem as fontes de substituição completas, não em subset (ficam bem maiores que o original).

### Pad ambiente

- Base sustentada no tom da cifra aberta (não é a música em si). Um só timbre; 12 loops (um por nota) de ~1 MB, em `pads/v1/`. Tom menor usa a mesma nota (Am toca A); bemóis mapeiam para sustenidos nos arquivos.
- Liga/desliga pelo botão **Pad** da cifra, pela aba Pad ou pelo controle compacto na tela do repertório. Volume de 0 a 100 % (padrão 60 %), lembrado no aparelho.
- Sempre com fade: nunca estalo nem corte. O pad começa pelo início original do arquivo (crescimento de ~3,5 s). Troca de tom faz transição cruzada; mesmo tom não reinicia.
- Segue o tom salvo exibido, nunca a prévia do painel Mudar tom.
- Continua ao navegar entre cifras e telas; para só ao tocar em Pad de novo (ou Parar), ao sair da conta ou fechar o app. Com o pad tocando, a aba Pad ganha uma bolinha verde na barra inferior.
- Carrega sob demanda (nada no login); pré-carga em segundo plano do tom exibido e, em repertório, dos tons de todos os itens, só depois da cifra na tela. Passa pelo cache do PWA (`CacheFirst`, cache `cifras-pads`).
- Falha de download: o botão mostra "Pad indisponível · tentar de novo" e a cifra segue normal. Na troca de tom, se o novo loop não chega, o atual continua.
- Enquanto toca, o app pede ao navegador para manter a tela acesa (Wake Lock); bloquear a tela à mão pode parar o pad (limite aceito).
- Os arquivos de áudio nunca vão para o git nem para o Hosting.

### PWA e desempenho

- App instalável na tela inicial, com service worker do app shell e aviso "Atualizar" quando há versão nova.
- PDFs com cache imutável; code splitting por rota; `pdf.js` e `pdf-lib` carregados sob demanda só no visualizador e no upload.
- Meta: abrir uma cifra já visitada em menos de 1 s no celular; troca de tom na prévia em menos de 100 ms.
- Sem modo offline completo, só cache do app e dos arquivos já usados.

## Não-objetivos decididos

Cada item aponta para o spec e a seção de origem. Para reabrir um deles, o dono do produto decide.

| Não-objetivo | Origem |
| --- | --- |
| Editor de cifras no sistema (o PDF continua sendo feito no Google Docs) | [design principal](superpowers/specs/2026-11-13-church-cifras-design.md) §3 |
| Modo offline completo (só cache do app e dos arquivos) | [design principal](superpowers/specs/2026-11-13-church-cifras-design.md) §3 e [pad](superpowers/specs/2026-11-17-pad-design.md) §3 |
| OCR/PDF escaneado, PDF fora do padrão, upload de DOCX | [design principal](superpowers/specs/2026-11-13-church-cifras-design.md) §3 |
| Comentários | [design principal](superpowers/specs/2026-11-13-church-cifras-design.md) §3 |
| Notificação push, escala de músicos/líder, comentários | [repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3 |
| Anotações por louvor; link público, exportar o repertório em um PDF ou imprimir | [repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3 |
| Histórico de versões ou "desfazer" no repertório; gesto de deslizar para trocar de cifra; permissões por repertório | [repertórios](superpowers/specs/2026-11-16-repertorios-design.md) §3 |
| Tocar a música em si, mixer, equalizador, efeitos, escolha de timbre | [pad](superpowers/specs/2026-11-17-pad-design.md) §3 e §8 |
| Camadas de som, metrônomo, andamento; sincronizar o pad entre aparelhos | [pad](superpowers/specs/2026-11-17-pad-design.md) §3 |
| Tela de administração de pads (envio só por script) | [pad](superpowers/specs/2026-11-17-pad-design.md) §3 |
| Tocar o pad com a tela bloqueada (controle de mídia do sistema) | [pad](superpowers/specs/2026-11-17-pad-design.md) §5.6 e §8 |
| Link público da cifra ou envio por `wa.me`/texto sem anexar o PDF | [compartilhar PDF](superpowers/specs/2026-11-17-compartilhar-pdf-design.md) "Não-objetivos" |
| Fallback de download onde o navegador não compartilha arquivo (o botão some) | [compartilhar PDF](superpowers/specs/2026-11-17-compartilhar-pdf-design.md) "Não-objetivos" |
| Encolher fonte, quebrar linha ou mexer em letra ao afastar acordes | [espaçamento de acordes](superpowers/specs/2026-11-16-espacamento-acordes-design.md) "Não objetivos" |
| Tolerância a erro de digitação, ranking por relevância, busca por acorde, edição manual da letra | [busca por letra](superpowers/specs/2026-11-19-busca-por-letra-design.md) "Fora de escopo e anti-metas" |
| Busca por letra em Cantores, na aba Repertórios e no seletor de músicas do repertório (por ora) | [busca por letra](superpowers/specs/2026-11-19-busca-por-letra-design.md) "Fora de escopo e anti-metas" |
| Link público do repertório (sem login) | [compartilhar repertório](superpowers/specs/2026-11-19-compartilhar-repertorio-design.md) "Fora de escopo" |
| Estatísticas por tom, por pessoa ou por abertura da cifra; gráficos, exportação, filtro de período; histórico anterior ao deploy | [estatísticas](superpowers/specs/2026-11-19-estatisticas-admin-design.md) "Não-objetivos" |
| Mudança de regra de negócio no redesign (só visual) | [redesign mobile](superpowers/specs/2026-11-18-redesign-mobile-design.md) §1 |

Anti-objetivos que valem em qualquer entrega (falham mesmo que "funcione"):

- Transposição que altere algo além dos acordes e do tom no título, ou que desloque um acorde da sílaba.
- Trocar texto em negrito que não é acorde (ex.: `Intro:`) ou deixar acorde sem trocar sem avisar.
- Abrir uma cifra lenta a ponto de atrapalhar o louvor (meta: menos de 1 s).
- A lista do repertório mudar sozinha na tela de quem lê; perder um louvor por edição concorrente; abrir um tom diferente do item sem avisar; o repertório sumir antes do fim do dia do culto.
- Estalo ao ligar, desligar, trocar tom ou mudar volume do pad; cortar o início do pad; o pad tocar sozinho ou atrasar a cifra.
- Contar o mesmo repertório duas vezes nas estatísticas; um não-admin ler estatísticas ou `setlistUsage`.

## Limites conhecidos e pendências

### Limites aceitos

- Troca de tom por sobreposição: o texto antigo dos acordes continua no conteúdo do PDF gerado, sob a camada desenhada (copiar texto traz o acorde velho). A abordagem de reescrever o conteúdo (`RewriteWriter`) segue só em esqueleto.
- Os PDFs reais do acervo não vão para o git (letras com direitos autorais; repositório público). A CI usa PDFs sintéticos; a amostra real é pequena, então a importação em lote serve de teste em massa.
- Corridas de identidade: renomear ou criar músicas ao mesmo tempo pode gerar duas com a mesma identidade (`titleNormalized + artistId`); resolve o admin à mão.
- Papel novo só vale depois do refresh do token (até cerca de 1 h se o cliente não forçar).
- As Rules de `setlists` não iteram sobre `items`: não validam cada item nem a existência da música (risco aceito, só membro/admin escreve). O padrão de `date` aceita datas impossíveis; o cliente valida.
- Pad: bloquear a tela à mão pode parar o áudio, sobretudo no iOS. Wake Lock cobre o resto. Só 12 loops de um timbre.
- Estatísticas: se o agendador ficasse parado por mais de cerca de 28 dias, repertórios expirariam sem contagem. Repertório já contado e depois re-datado não é contado de novo.
- O TTL do Firestore pode demorar um dia ou mais para apagar; o cliente já esconde os expirados.
- Acervo acima de cerca de 2.000 músicas pede revisão da busca em memória.
- Verificação em aparelho real (Android e iPhone) é manual: o áudio do pad, o compartilhamento de arquivo e a tela bloqueada não são verificáveis em CI.

### Pendências abertas

- Aprovação de ouvido dos 12 loops do pad pelo dono do produto (spec do pad §9). O envio dos loops ao Storage de produção é feito por script, por quem tem a credencial.
- Preenchimento das letras das músicas enviadas antes da busca por letra: `npm run lyrics:backfill` (`deploy.md` §12), rodado pelo dono do produto depois do deploy. Até lá só as músicas novas são achadas por letra.
- Pessoas (músicos, vocais, instrumentos, disponibilidade) aparece como "Em breve" na aba Mais; não existe.
- O Paper não mostra o chip Harpa nas telas 03b e 03c da busca por letra (spec da busca por letra).
- Passos manuais únicos de `deploy.md`: TTL e índice de `setlists` (§10), job do Cloud Scheduler e `setlistUsage` sem TTL (§11), autorizar o domínio e o CORS do site de teste (§13).

### Divergências entre spec e código (o código vale)

- Cantor "Harpa" / aba Harpa: existe no app (`catalog/search.ts`, `HomePage`, `BuscaPage`) e na busca por letra, mas nenhum spec o descreve; o critério é o artista se chamar "Harpa".
- Barra da cifra: o spec de compartilhar PDF fala em `⬇ PDF` + `↗` + `Mudar tom`; o redesign e o design system trazem WhatsApp, **Pad** e **Mudar tom**, sem botão de download.
- Aba Mais: o spec do redesign (§2) deixa Importar em cinza "Em breve"; o código liga Importar (admin) a `/importar` e acrescenta Estatísticas (admin), que o design system ainda não lista. Só Pessoas (músicos) segue "Em breve".
- Pad ao sair da cifra: o spec do pad (§3 item 5) diz que fora do repertório o pad sai com fade; a tabela do §5.2 do mesmo spec e o design system dizem que ele continua tocando e para pela aba Pad. Vale a segunda leitura.
- Funções do spec principal: `onSongDeleted` foi substituída pela callable `deleteSong`; há ainda `getStats`, `countSetlistUsage` e `health`, que o spec principal não lista.
