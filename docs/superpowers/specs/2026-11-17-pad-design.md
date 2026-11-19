# Pad ambiente — Documento de Design

- **Data:** 2026-11-17
- **Status:** aprovado pelo dono do produto em 2026-11-17 (a aprovação de ouvido dos 12 loops, §9 item 2, segue pendente e só trava o envio ao Storage de produção)
- **Fase:** 9 (acrescenta-se à §11 do [design principal](2026-11-13-church-cifras-design.md))
- **Autor da ideia:** responsável pelo ministério de louvor (dono do produto)

> Convenção (a mesma dos outros specs): **[decidido]** = definido pelo dono do produto; **[proposta]** = proposta
> nossa, a confirmar; **[decisão nossa]** = resolvido por nós por não mudar o que é construído — revisar ao ler.
>
> Reabre o item "playback de áudio" dos não-objetivos do design principal (§3); as edições estão na §10.

---

## 1. Intenção e porquê

Nos louvores, o tecladista ou o violonista costuma sustentar um **pad**: uma base ambiente contínua no tom da música
(o que apps como o Worship Pad fazem). Hoje isso exige outro app, aberto ao lado da cifra, com o tom escolhido à mão.

O dono quer **tocar o pad do tom da cifra aberta, de dentro da própria cifra**, com controle de volume e **sem corte
brusco** ao iniciar, ao parar ou ao trocar de tom [decidido]. Dentro de um repertório, o pad **atravessa as músicas** e
muda de tom com transição suave; fora de um repertório, ele vale só enquanto a cifra está aberta [decidido].

## 2. Usuários e papéis

Segue o design principal (§2). **Todos os papéis** (visitante, membro, admin) podem tocar o pad: é leitura, não edição
[proposta]. O pad é **local ao aparelho**: cada músico liga, desliga e regula o seu; nada é sincronizado entre pessoas.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Na cifra aberta, um botão **Pad** liga e desliga o pad **do tom da cifra** [decidido].
2. **Volume** ajustável, lembrado no aparelho [decidido].
3. **Fade** em todas as transições de som: ligar, desligar, trocar de tom e sair da cifra [decidido]. O pad sempre
   **começa pelo início original** do arquivo, com o crescimento de ~3,5 s [decidido: o início não pode ser cortado].
4. **Em repertório:** o pad continua ao passar de uma cifra à outra; se o tom muda, há **transição cruzada**; se o tom é
   o mesmo, o som **não é interrompido nem reiniciado** [decidido].
5. **Fora de repertório:** ao fechar a cifra ou ir para outra música, o pad sai com fade e para [decidido].
6. **Carregamento sob demanda** (nada de baixar tudo no login), com pré-carga em segundo plano do que vai ser usado (§6.4).
7. Mobile-first, como o resto do app.

**Não-objetivos**
- Tocar a música em si, mixer, equalizador, efeitos ou escolha de timbre: o pad é **um só** [decisão nossa].
- Camadas (pad + outros sons), metrônomo, andamento [decisão nossa].
- Telas de administração dos pads: os arquivos são enviados uma vez por script (§6.5) [decisão nossa].
- Sincronizar o pad entre aparelhos [decisão nossa].
- Modo offline completo (continua o não-objetivo do design principal); só cache dos loops já usados.

**Anti-objetivos (falha mesmo que "funcione")**
- **Estalo ou corte seco** ao ligar, desligar, trocar de tom, mudar o volume ou na emenda do loop.
- **Cortar o início** do pad: o crescimento inicial de cada arquivo é parte do som [decidido].
- O pad tocar **sozinho**, sem toque do usuário (política de autoplay dos navegadores também exige o toque).
- O pad **atrasar a abertura da cifra** (a meta de < 1 s do design principal vale; o áudio nunca disputa banda com o PDF).
- O pad **parar sozinho** no meio do louvor (o loop não pode acabar nem falhar).
- Tocar o **tom errado**, ou continuar tocando depois de a regra do §5 mandar parar.
- Falha de carregamento do pad **atrapalhar a cifra** (a cifra funciona igual, só o botão avisa).
- Consumir memória a ponto de o navegador do celular derrubar a aba.

## 4. Restrições

- Stack do design principal: React + TS, Firebase direto do cliente, **sem Cloud Function** nesta fase.
- Fluxo Git e definição de pronto do `AGENTS.md`: branch a partir de `develop`, TDD, revisão do `code-reviewer`.
- Tudo do pad em chunk carregado sob demanda: **nada de áudio no bundle inicial**.
- Navegadores só liberam áudio depois de um toque: o `AudioContext` nasce/retoma no clique no botão **Pad**.
- **Nunca commitar áudio** (sources, loops): ficam fora do git, como os PDFs reais (`AGENTS.md`).
- Texto de UI em pt-BR; identificadores de código em inglês.

## 5. Comportamento

### 5.1 Qual tom toca

O pad segue o **tom salvo exibido** na cifra (o tom selecionado na URL ou o padrão), nunca a prévia do painel de
transposição: a prévia só vira pad ao **abrir/confirmar** aquele tom [decisão nossa]. Cifra em tom menor usa o pad da
**mesma nota** (Am → pad A; F#m → pad F#), que é a prática com pads de nota-raiz [proposta]. Bemóis do app são
mapeados para os sustenidos dos arquivos (Bb → A#, Eb → D#, Ab → G#).

### 5.2 Quando o pad continua e quando para

| Situação | O que acontece com o pad ligado |
|---|---|
| Cifra aberta **fora** de repertório, usuário sai (voltar, busca, outra música) | Continua (fica tocando; aparece e para pela aba Pad) |
| Cifra aberta **fora** de repertório, usuário troca o tom salvo da própria cifra | Transição cruzada para o novo tom |
| Cifra aberta **pelo repertório**, vai à anterior/próxima | Continua; transição cruzada se o tom mudou, nada se for o mesmo |
| Vai da cifra do repertório para a **tela do mesmo repertório**, e volta | Continua |
| Sai do contexto do repertório (home, busca, outro repertório, cifra sem `?repertorio`) | Continua (fica tocando; aparece e para pela aba Pad) |
| Usuário toca em **Pad** de novo | Fade-out e para |
| Sair da conta ou fechar o app | Para |

Enquanto o pad toca, ele precisa poder ser **parado de qualquer tela em que continua válido**, inclusive a aba Pad e a tela do
repertório (controle compacto com parar e volume).

### 5.3 Fades

Valores iniciais, ajustáveis ao ouvido [proposta]: **saída 3 s · transição cruzada 4 s**. A **entrada não leva fade do app**: o crescimento do próprio arquivo (~3,5 s)
é a entrada, e o app aplica só uma rampa curta (~50 ms) contra estalo. Na troca de tom, o pad novo entra **do início**
(com o seu crescimento) enquanto o antigo sai em 4 s. Curvas de
potência igual (sem "buraco" de volume no meio). Mudança de volume é suavizada (alguns ms) para não estalar.
O volume vai de 0 a 100 %, com curva perceptiva (não linear), padrão 60 %, lembrado por aparelho.

### 5.4 Carregamento

- **Sob demanda:** o loop do tom é baixado ao tocar em **Pad** se ainda não estiver em cache.
- **Pré-carga em segundo plano** (só *depois* de a cifra estar na tela, ocioso): o loop do tom exibido e, em
  repertório, os loops dos tons de **todos os itens** do repertório (poucos tons distintos, < 1 MB cada). Assim o toque
  no botão e as transições do culto não esperam rede.
- **Baixar os 12 no login:** descartado. Seria viável em tamanho (cerca de 10 MB), mas gasta dados e banda do início do
  culto sem necessidade, e competiria com o PDF.
- O download passa pelo cache do PWA (`CacheFirst`, mesmo padrão dos PDFs): a segunda vez é local.
- Na memória ficam, no máximo, **o buffer atual e o que está entrando** (cerca de 25 a 30 MB cada).

### 5.5 Falhas

| Falha | Comportamento |
|---|---|
| Loop não baixa | Botão mostra "Pad indisponível · tentar de novo"; a cifra segue normal |
| Troca de tom: novo loop não chega | O pad atual **continua** tocando; aviso discreto |
| `AudioContext` suspenso pelo sistema (ligação, outro app) | O pad retoma quando o sistema devolve; se não, botão volta a "desligado" |

### 5.6 Tela acesa

Enquanto o pad toca, o app pede ao navegador que **mantenha a tela acesa** (Screen Wake Lock) [decidido]: a cifra
precisa ficar visível de qualquer forma, e o iOS pode suspender o áudio do navegador com a tela bloqueada. O pedido é
liberado quando o pad para. Se o músico bloquear a tela à mão, o pad pode parar: é um **limite aceito e documentado**,
não um defeito. Se o navegador não suporta Wake Lock, o pad funciona normalmente, sem o pedido. Tocar com a tela
bloqueada (elemento `<audio>` + controle de mídia do sistema) fica fora desta fase (§8).

## 6. Arquitetura

### 6.1 Abordagens consideradas

| | A. Faixa inteira decodificada (Web Audio) | B. Faixa inteira em streaming (`<audio>` + ganho Web Audio) | **C. Loop curto bar-aligned decodificado (Web Audio)** |
|---|---|---|---|
| Som | Original, 7 min | Original, 7 min | Início original (crescimento) + 16 compassos em loop |
| Memória | ~164 MB (330 MB na transição): derruba o iPhone | Baixa | ~25–29 MB por pad |
| Início | Baixa 5–9 MB antes | Baixa o arquivo inteiro antes (blob) | ~1 MB, quase imediato |
| Loop | Perfeito | Micro-corte possível aos 7:46 | Perfeito (por amostra) |
| Transição de tom | Limpa | Dois elementos podem dessincronizar | Limpa, mesmo relógio |

**Escolhida: C** [decidido: o dono pediu a de melhor desempenho]. Custo aceito: perde-se o que vem depois do loop nos 7 minutos
(medido: depois do crescimento inicial o pad é estável, ~-17 dB e brilho constante). O dono exigiu **preservar o início
de cada arquivo**; por isso o buffer é *início + loop*, e não só o loop.

### 6.2 Material de origem

Os 12 MP3 do dono (`DS01-A` … `DS12-G#`): 7 min 46 s, 160 kbps, 44,1 kHz estéreo, 70 BPM, exportados do FL Studio 12
em 2018. 466,3 s a 70 BPM = **136 compassos exatos**, o que indica material sincronizado por compasso. Não há autor nem
licença nas tags (ver §9).

### 6.3 Unidades (em `apps/web/src/pad/`, tudo lazy)

| Unidade | Responsabilidade |
|---|---|
| `padKeys` | `KeyName` → arquivo do pad (sustenidos/bemóis, menor → mesma nota); puro |
| `padEngine` | Envolve o Web Audio: `play(key)`, `crossfadeTo(key)`, `stop()`, `setVolume()`; recebe `AudioContext` e carregador por injeção (testável sem áudio real); nunca deixa o ganho dar salto |
| `padApi` | Baixa o loop do Storage (`getBlob`, como `getPdfBytes`) e entrega bytes |
| `PadProvider` | Estado (`off`/`loading`/`playing`/`error`, tom, volume), regras do §5.2, pré-carga do §5.4; fica ao lado do `ActiveSetlistProvider` no `AppShell`, acima das rotas da cifra e do repertório |
| `PadControl` | Botão **Pad** + volume na cifra; versão compacta na tela do repertório |
| `useWakeLock` | Pede/libera a tela acesa conforme o pad toca (§5.6); falha silenciosa sem suporte |

O viewer só **informa o tom exibido e se está em repertório** ao provider (`pad.follow(key)`); toda a regra de
continuar/parar vive no provider, não espalhada pelas telas.

### 6.4 Hospedagem e cache

- **Storage** `pads/{versão}/{arquivo}.m4a` (hoje `pads/v1/…`; a **versão sobe** sempre que os loops são regerados, porque o arquivo é imutável e fica 1 ano em cache; ou outro formato, se a validação do §6.5 mandar). Regra nova em `storage.rules`:
  leitura para autenticado, **escrita negada** a todos; o envio é feito por script administrativo (SDK Admin).
- **PWA:** `pdfObjectPattern` cobre só `songs%2F`; acrescentar padrão equivalente para `pads%2F` (`CacheFirst`, cache
  próprio `cifras-pads`), com teste em `pwaConfig.test.ts`.
- Os arquivos **não** vão para o Hosting (inflam o deploy) nem para o git.

### 6.5 Produção dos loops (uma vez, fora do app)

Script local (Node + ffmpeg, em `scripts/pads/`, sem dependência no app) que, para cada tom, monta **um único buffer =
início original + região de loop**: mantém o começo do arquivo **intacto** (com o crescimento, 4 a 8 compassos, tocado
uma vez) e define a região de loop de **16 compassos** (≈ 54,9 s a 70 BPM) logo depois, com **emenda cruzada de
potência igual** de 2 compassos embutida no fim, de modo que voltar do fim ao início da região seja contínuo. O motor
toca o buffer com `loopStart`/`loopEnd` da região. O arquivo codificado leva ainda uma **cauda de guarda de 0,5 s** depois
de `loopEnd` (a continuação natural do loop, `B[M .. M+0,5 s)`), para que o reamostrador do `decodeAudioData` e qualquer
corte de fim do decodificador atinjam só a cauda e nunca a emenda; o manifesto não muda (`loopEnd` fica dentro do buffer). O tamanho do início por tom (o que dá a emenda mais regular), o
`loopStart`/`loopEnd` e o ganho de nivelamento (-18 dB RMS no trecho estável, pico ≤ -1 dBFS) saem num manifesto
(`relatorio.json`) que o app embute como constantes versionadas [decisão nossa]. Codifica em AAC ~96 kbps
(≈ 0,85 a 1,0 MB; buffer de 68 a 82 s). Protótipo já gerado e medido (início ≥ 0,99 de correlação com o original).
**Risco conhecido:** codecs com perda (MP3/AAC) somam silêncio de início/fim, que apareceria como micro-corte no loop;
o construtor valida a emenda em Chrome e Safari/iOS e, se preciso, usa `loopStart`/`loopEnd` para excluir esse trecho
ou troca de formato. **Aceite dos loops é de ouvido, pelo dono** (§9).

## 7. Testes

- `padKeys`: tabela completa (12 notas × maior/menor, sustenido e bemol).
- `padEngine` com `AudioContext` falso que registra o agendamento de ganho: fade de entrada/saída, transição cruzada,
  mesmo tom não reinicia, ganho **nunca salta** entre valores, `stop` libera a fonte, no máximo 2 buffers vivos.
- `PadProvider`: cada linha do §5.2 vira um teste (rota/`?repertorio`/tom); falha de rede mantém o pad atual.
- `storage.rules`: `pads/**` lê autenticado, não lê anônimo, não escreve ninguém (`npm run test:rules`).
- `pwaConfig`: o padrão de `pads%2F` casa os loops e nada mais.
- E2E (Playwright): ligar o pad na cifra, abrir a próxima do repertório e ver o estado; saída fora do repertório para o pad.
  O áudio real não é verificável em CI: o E2E confere estado e requisições, não som.
- **Verificação manual em aparelho** (Android e iPhone): ouvir fade, transição, emenda do loop, volume e comportamento com
  tela bloqueada. Conferir que o Wake Lock mantém a tela acesa e o pad tocando por vários minutos, e que o pad para
  de pedir a tela ao ser desligado. `useWakeLock` tem teste com `navigator.wakeLock` falso.

## 8. Fora do escopo desta fase

Escolha de timbre, camadas, tocar com a tela bloqueada (controle de mídia do sistema), controle global do pad em
todas as telas, e qualquer administração de pads pela interface.

## 9. Pendências do dono do produto

1. ~~**Direito de uso dos 12 samples.**~~ **Confirmado pelo dono em 2026-11-17** [decidido]: o ministério pode usá-los e
   hospedá-los num bucket privado (só logados). Os arquivos não trazem autor nem licença nas tags. Os loops continuam
   fora do git. O **envio ao Storage de produção** só acontece depois do item 2 (aprovação de ouvido).
   Sem flag de ativação: a release para `main` já é aprovada por humano e é o portão [decisão nossa].
   Os sources estão em `C:\Users\Kaique\Downloads\MP3` (fora do repositório). O envio é feito pelo script
   administrativo, rodado por quem tem a credencial (a service account nunca entra no git); o construtor entrega o
   script e valida contra o emulador do Storage [decisão nossa].
2. **Ouvir e aprovar os 12 loops** gerados (emenda, volume parecido entre tons, trecho escolhido).
3. ~~Regra de parar ao sair do contexto do repertório~~ e ~~tela bloqueada~~: **resolvidas** (§5.2 e §5.6).

## 10. Edições no design principal

- §3 Não-objetivos: trocar "Comentários, playback de áudio" por "Comentários"; **playback de música** continua fora,
  e o pad ambiente entra por este documento.
- §11 (fases): acrescentar a **Fase 9 — Pad ambiente**.
