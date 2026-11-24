# Design system — Church Cifras

Fonte única do padrão visual do app. **Toda tela nova ou alterada segue este documento** e **o Paper
é atualizado junto com o código** (seção 9). Se algo aqui ficar diferente do código, corrija os dois.

- **Paper (desenho):** arquivo "Church - Cifras", id `01M7BN04NKJ00S1T4XVC8HRGRS`, página `p-1-0`
  — <https://app.paper.design/file/01M7BN04NKJ00S1T4XVC8HRGRS/p-1-0>
- **Código:** `apps/web/src/ui/` (tokens e estilos), `apps/web/src/ui/redesign*.css`
- **Spec da decisão:** [specs/2026-11-18-redesign-mobile-design.md](superpowers/specs/2026-11-18-redesign-mobile-design.md)

## 1. Princípios

- **Mobile-first** (390 px de referência; testar a 360 px). Desktop só amplia.
- **Dois temas, claro e escuro**, escolhidos pela pessoa (botão sol/lua no cabeçalho das telas raiz). Todo
  componente funciona nos dois; nunca desenhe só um.
- **Âmbar é a cor de ação e de tom**; o resto é neutro. Uma cor forte por tela.
- Informação direto na superfície; cartões só para agrupar (lista, repertório, formulário).
- Alvos de toque de pelo menos 44 px (exceção consciente: pílulas de tom nas listas, 28 px, porque a
  linha inteira é o alvo principal).
- Texto em pt-BR; identificadores de código em inglês.

## 2. Tokens (cores)

Definidos em `ui/styles.css`: `:root` (claro) e `:root[data-theme='dark']` (escuro). **Os dois blocos têm
exatamente os mesmos nomes** (guardado por `themeTokens.test.ts`). Nunca escreva cor fixa (`#hex`/`rgb`) fora
deles; as únicas exceções são o papel branco do PDF (`#ffffff`), o verde da marca WhatsApp (`#25d366`) e
sombras pretas neutras (`rgb(0 0 0 / x%)`).

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--color-bg` | `#f4f5f7` | `#0a0b0d` | fundo da página (= `THEME_COLORS` em `lib/theme.ts`) |
| `--color-surface` | `#ffffff` | `#15171b` | cartões, barras, diálogos |
| `--color-elevated` | `#e9ecef` | `#1d2026` | campos, pílulas neutras, botões secundários |
| `--color-text` | `#111318` | `#f5f5f6` | texto principal |
| `--color-muted` | `#52525b` | `#9a9aa2` | texto secundário |
| `--color-border`, `--color-border-strong` | preto 8% / 14% | branco 8% / 14% | bordas |
| `--color-accent` | `#d97706` | `#f5a623` | **preenchimento** âmbar: botão de ação, FAB, tom escolhido |
| `--color-accent-text` | `#b45309` | `#f5a623` | âmbar como **texto/ícone pequeno** (contraste) |
| `--color-accent-soft` | âmbar 14% | âmbar 14% | fundo suave de destaque (tom padrão, banner, pad tocando) |
| `--color-accent-border` | `rgb(217 119 6 / 40%)` | `rgb(245 166 35 / 40%)` | borda âmbar 40%: pílula de papel admin, pílula Aguardando, contador, Sim, campo em foco |
| `--color-on-accent` | `#15120a` | `#15120a` | texto sobre `--color-accent` |
| `--color-primary`, `--color-on-primary` | `#111318` / `#fff` | `#fff` / `#0a0b0d` | ação neutra: avatar, chip ativo, botão do login |
| `--color-success`, `--color-success-soft` | `#15803d` | `#34d399` | verde: tom já salvo, "Próximo", ok |
| `--color-error`, `--color-error-soft` | `#dc2626` | `#f87171` | erro, apagar, parar |
| `--color-warn`, `--color-info`, `--color-purple` (cada um com `-soft`: `--color-warn-soft`, `--color-info-soft`, `--color-purple-soft`) | ver `styles.css` | idem | pílulas de status da importação |
| `--color-scrim` | preto 45% | preto 70% | fundo de diálogo |
| `--shadow-accent`, `--shadow-pop` | ver `styles.css` | idem | sombras (FAB e elementos flutuantes) |

Regras de contraste: texto âmbar usa **sempre** `--color-accent-text`; `--color-accent` só como fundo/ícone/
texto grande. Botão âmbar leva texto `--color-on-accent` (escuro) nos dois temas. Verde de texto no claro é
`#15803d` (o `#16a34a` não passa 4,5:1).

Novo token: crie nos **dois** blocos, na mesma mudança, e na tabela acima e no Paper (seção 9).

## 3. Tipografia

- Família: `system-ui` (corpo e títulos) e a pilha mono `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`
  para **tons e acordes** (tile, pílulas, nota do pad, painel Mudar tom). O Paper usa Inter e Roboto Mono
  como aproximação visual.
- Escala: sobretítulo (eyebrow) 11 px, 700, caixa alta, espaçamento 0,08em, cor `--color-muted`; **título de tela**
  2 rem, 800, −0,02em; título de cartão/diálogo 1,125 rem, 800; corpo 15 px; apoio 13 px; microtexto 10–11 px
  (rótulos de aba, selos).
- Pares: peso 800 no título × 400–600 no apoio. Números e tons em mono, 700.

## 4. Forma e espaçamento

- Raios: pílula `999px` (botões, abas, chips, barras); cartões de lista `18px`; cartões grandes
  (repertório, perfil, menu) `24px`; campos `12px`; diálogos `22px`; folha inferior `24px` no topo; tile de tom `13px`.
- Margens laterais da página 16–20 px; espaços entre itens 8, 10, 12, 16 px.
- Barras flutuantes (dock e barra da cifra): 12–16 px das bordas, 16–20 px do fundo, `border-radius` pílula
  (28 px quando a barra quebra em duas linhas), borda `--color-border-strong`, fundo `surface` 92% com blur
  (`-webkit-backdrop-filter` também).

## 4a. Estrutura dos estilos

`ui/styles.css` é a base (tokens e componentes antigos). Os arquivos `redesign*.css` refinam por cima e são
importados em `main.tsx` **nesta ordem**: `redesign.css` (cabeçalhos, barra inferior, Mais, Busca, Pad, listas),
`redesign-cifra.css` (barra de ações e painel Mudar tom), `redesign-setlists.css` (repertórios),
`redesign-forms.css` (login, formulários, diálogos), `redesign-states.css` (alertas, avisos, aviso de
atualização), `redesign-stats.css` (estatísticas), `redesign-install.css` (convites de instalação e de avisos, classe `.convite`, componente `ConviteCard`). Área nova → arquivo novo (ou seção dele), importado depois dos existentes, **escopado** pelo
componente (`.song-card .chip`, não `.chip`) e só com tokens. `themeTokens.test.ts` lê todos eles.

## 5. Componentes e padrões

| Padrão | Como é | Onde no código |
|---|---|---|
| **Cabeçalho de tela** | sobretítulo + título grande à esquerda; botão sol/lua (44 px, círculo) à direita | `ScreenHeader` |
| **Barra inferior** | 5 abas (Músicas, Repertório, Busca, Pad, Mais), pílula flutuante, aba ativa com fundo suave; **só nas 5 telas raiz**. Com o pad tocando, **bolinha verde** (`--color-success`, 8 px) no canto do ícone da aba Pad, em qualquer tela com a barra | `BottomNav`, `navTabs.ts` |
| **Telas de detalhe** | tela cheia, sem barra inferior, link `‹ Voltar` (cifra, repertório, cantor, Nova cifra, Importar, Pessoas). O `‹` da cifra volta pelo histórico à tela anterior (mesma busca, aba e tipo); sem entrada anterior no app (link direto), vai para `/`. Repertório volta sempre ao repertório | cada página, `useViewerSetlist` |
| **Linha de música** | tile `TOM` (tom padrão) + título/cantor + chevron; pílulas dos tons salvos embaixo (padrão em âmbar suave) | `SongList`, `KeyChips compact` |
| **Cantor** | círculo com 2 iniciais + nome + contagem | `ArtistList`, `ui/initials.ts` |
| **Segmento** | Músicas / Harpa / Cantores em pílula | `HomePage` `.tabs` |
| **Bloco fixo de busca** | no topo ao rolar a lista (`position: sticky`, `z-index` 10, abaixo da barra inferior): na **Busca** leva campo + filtros; na **Home** leva campo + segmento (o card do próximo culto vem logo abaixo). Fundo `--color-bg`, 8 px de respiro embaixo para o primeiro cartão não ficar cortado colado no bloco | `.search-sticky`, `HomePage`, `BuscaPage` |
| **Cartão de repertório** | selo (Próximo verde, Agendado/Realizado neutro), título, prévia de 4 louvores com tom, `+ N` | `SetlistsTab` |
| **Barra da cifra** | pílula flutuante: WhatsApp (glifo verde; abre a folha de compartilhar do aparelho), **Pad** (texto; "Pad G" em âmbar tocando), **Mudar tom** (âmbar). Sem download (⬇) e sem ícone de nota musical | `ViewerPage`, `viewer/barIcons.tsx` |
| **PDF em tela cheia** | quadradinho 36 px no canto superior direito da 1ª página (`aria-label="Tela cheia"`; claro: `--color-primary`, escuro: `--color-elevated` com borda); aberto, a folha cobre a tela toda (overlay CSS + Fullscreen API onde existir), rola sozinha e o mesmo botão vira "Sair da tela cheia" (44 px, fixo no canto); Esc também fecha | `PdfFrame`, `.pdf-frame` |
| **Anterior · N de M · Próxima** | pílulas dentro da barra da cifra; avisos de repertório flutuam sem empurrar o PDF | `SetlistBar` |
| **Compartilhar repertório** | botão redondo 48 px no canto inferior esquerdo da tela do repertório (glifo WhatsApp verde, qualquer papel; some em repertório removido). Abre a folha de compartilhar com a lista e o link; sem Web Share (computador) copia e mostra "Link copiado." por alguns segundos | `SetlistPage`, `setlists/shareMessage.ts`, `redesign-setlists.css` |
| **Painel Mudar tom** | folha inferior: 12 tons (salvos em verde, escolhido em âmbar), − ½ / + ½, Cancelar/Confirmar; **sem** stepper − + no cabeçalho | `KeyPanel` |
| **Aba Pad** | **status, grade de 12 tons e volume**: card de status de **112 px fixos** (desligado e tocando; uma linha sob o título: dica "Toque em um tom para tocar", música/repertório ou aviso de falha), toque num tom para tocar (ou trocar com transição, se já toca), sequência do repertório, Parar. Rótulo "Tons · toque para trocar" acima da grade 3 × 4 nos dois estados. Tom atual em âmbar com ATIVO; tom **já salvo no aparelho** (cache do pad) e que não toca, com **borda âmbar** (`.is-cached`). O pad iniciado pela aba é de origem livre e não para ao trocar de tela | `PadPage`, `padStaysOn` (origem `free`), `.pad-tones` |
| **Aba Mais** | perfil + selo de papel; **Admin** (só admin → Pessoas), **Importar** (só admin → importação em lote), **Avisos** (linha de menu com ação e estado, acima de Pessoas; só membro e admin), **Pessoas** (músicos) cinza "Em breve", Sair | `MaisPage` |
| **Linha de menu com ação e estado** | `.menu-row` com ícone à esquerda, título + apoio (muted) no meio e pílula de 44 px à direita. Pílula primária (`.btn-primary`, âmbar) para Ativar; secundária (`--color-elevated`) para Desativar; sem pílula em bloqueado, iPhone fora da tela inicial e sem suporte. Com avisos ativos, segunda linha "Enviar aviso de teste" (texto em `--color-accent-text`). Estados: carregando, pode ativar, ativando, ativa, desativando, bloqueada, iPhone fora da tela inicial, sem suporte, erro (texto muted igual a "pode ativar", com pílula "Tentar de novo"). Ver `src/push/AvisosRow.tsx`, `ui/redesign-push.css` | `AvisosRow`, `redesign-push.css` |
| **Aviso do sistema** | título e corpo; `tag` por repertório e tipo (`setlist-<id>-novo` para o repertório novo, `setlist-<id>-ensaio` para os três lembretes do ensaio, que se substituem; com `renotify`, o aviso que substitui outro alerta de novo; `aviso-teste` para o teste; ver `apps/functions/src/push/newSetlist.ts` e `rehearsal.ts`); badge monocromático (`/icons/badge-96.png`: branco com transparência); ícone da PWA (`/icons/icon-192.png`) | notificação do sistema (`firebase-messaging-sw.js`) |
| **Botões** | secundário: pílula `--color-elevated`; **ação**: pílula âmbar (`.btn-primary`, peso 800); neutro: `--color-primary` (login, chip ativo, avatar) | `styles.css`, `redesign-forms.css` |
| **Campo de busca** | pílula 46 px; × à direita (alvo 44 px, disco 22 px `--color-elevated`, ícone `--color-muted`) só enquanto há texto; limpa pelo mesmo `onChange` e devolve o foco ao campo; o × nativo do `type=search` é escondido | `SearchInput`, `.search-field` |
| **Campos** | 46 px, raio 12, rótulo 13 px muted, selo "· lido do PDF" verde | `.input`, `.field` |
| **Dia + Hora do ensaio** | `fieldset` com legenda "Hora do ensaio (opcional)" (13 px muted, sem borda); Dia (`type="date"`) e Hora (`type="time"`) lado a lado (proporção 3:2) em `.rehearsal-row`, cada um com rótulo 13 px muted. O × (`.search-clear` + `.rehearsal-clear`: alvo 44 px, disco 22 px `--color-elevated`, ícone `--color-muted`) só aparece enquanto há dia ou hora e limpa os dois. Ajuda embaixo em `.field-help` (13 px muted): "Quem ativou os avisos é lembrado na véspera, no dia e 1 hora antes."; erro de campo só texto | `SetlistFormDialog`, `redesign-forms.css` |
| **Linha do ensaio** | Na tela do repertório: relógio 14 px em `--color-accent-text` (`aria-hidden`) + "Ensaio dom · 22/11 às 18h30" em `--color-text`, peso 600 (sempre dia da semana abreviado e data, nunca "hoje" nem "amanhã"; abreviações `dom seg ter qua qui sex sáb`); depois da hora passar, linha e relógio em `--color-muted`. No cartão "Próximo culto", a segunda linha é sempre `--color-muted`, peso 400, sem relógio. Sem hora, nada. A hora se edita no menu ⋯ da tela do repertório, em "Editar data, rótulo e ensaio". | `RehearsalLine`, `redesign-setlists.css` |
| **Alertas** | caixa suave vermelha (alerta de página); aviso de sucesso `.notice`; erro de campo só texto | `redesign-states.css` |
| **Diálogos** | cartão 22 px com ações em pílula. **Destrutivo** = Cancelar neutro à esquerda + botão de confirmar vermelho sólido à direita (`--color-error`, texto `--color-on-primary`), ambos 46 px; foco inicial no Cancelar; Escape cancela; sem digitar nada para confirmar | `.dialog`, `ConfirmDialog`, `.confirm-actions` |
| **Aviso de atualização** | pílula no topo, centralizada, botão âmbar "Atualizar" | `UpdatePrompt` |
| **Convite (cartão do topo da aba Músicas)** | cartão fixo no topo da aba Músicas, só membro e admin, abaixo da barra de status; componente `ConviteCard` (classe `.convite`; título 15 px 800, apoio 13 px muted; "×" com aria-label "Agora não", alvo 44 px e disco 28 px; pílula âmbar de 36 px com alvo 44 px). **Instalar** (`InstallCard`): logo `icons/icon.svg` 48 px, título "Cifras como app", apoio "Abra direto da tela inicial"; Android/Chromium: "Adicionar" abre o diálogo de instalação; iPhone/iPad com Safari: sem botão, apoio "Toque em Compartilhar e depois em Adicionar à Tela de Início". Some no app instalado e em outros navegadores sem o evento. **Avisos** (`AvisosCard`): só no app instalado e com status "disponível"; tile do sino 48 px em `--color-accent-soft` (traço `--color-accent-text`), título "Ative os avisos", apoio "Repertório novo e lembrete do ensaio", pílula "Ativar" (durante o toque: "Ativando…", desabilitada). Os dois nunca aparecem juntos. "×" dispensa por 30 dias, com chave própria em cada convite | `ConviteCard`, `InstallCard`, `AvisosCard`, `pwa/useInstallPrompt.ts`, `ui/redesign-install.css` |
| **Entrada do ministério** (telas 34 a 37: escolha, confirmar pedido, pedido enviado, pedido recusado) | cartão de lista de 24 px com linhas de 72 px (tile, nome, cidade, chevron); diálogo de confirmação sobre o scrim; "Pedido enviado" com ícone de 64 px e cartão do pedido; "Sair" sempre visível. Visitante sem ministério vê só ela, em qualquer rota | `.entry-card`, `.entry-row`, `.entry-footer`, `.entry-alert`, `.entry-icon`, `.entry-sent` em `ui/redesign-ministries.css` (a tela de acesso pendente `AccessPending` e `ui/redesign-access.css` saem na Tarefa 25) |
| **Contador** (pedidos pendentes) | pílula âmbar 24 px com número; some com zero; acima de 99 mostra "99+"; `aria-hidden` (o rótulo da linha diz a quantidade) | `.count-badge` em `ui/redesign-ministries.css` |
| **Pílula de papel** | 20 px, raio 6; variantes membro (neutra), admin (âmbar 40% na borda) e admin da app (fundo `--color-primary`); texto sempre visível, nunca só cor | `.role-badge--member`, `.role-badge--admin`, `.role-badge--app` em `ui/redesign-ministries.css` (base `.role-badge` em `ui/redesign.css`) |
| **Pílula de estado** | 22 px, âmbar: "Aguardando", "N pedidos", "1 pedido"; linha sem pedidos reserva 22 px de largura | `.mn-status-pill` em `ui/redesign-ministries.css` |
| **Seletor de papel** | pílula de 36 px visuais com alvo de 44 px (`::before`); neutra (Membro, Não), ativa (Admin, Sim, âmbar) e desabilitada (a própria pessoa, `aria-disabled`, sem chevron); abre `role="menu"` | `.mn-role-select`, `.mn-role-select--active`, `.mn-role-select--disabled`, `.mn-role-select--yesno` (Sim/Não, sem chevron) em `ui/redesign-ministries.css` |
| **Linha de pessoa** | cartão de 18 px com avatar de 44 px (iniciais de `initialsOf`; a própria pessoa com fundo `--color-primary`), nome, e-mail e seletor de papel à direita | `.person-row`, `.person-row-avatar`, `.person-row-avatar--self` em `ui/redesign-ministries.css`; `ui/initials.ts` |
| **Cartão de pedido** | cartão de 18 px com avatar, nome, e-mail, "Pediu em dd/mm" (ou linha de destino na Gestão) e duas pílulas de 44 px: Recusar (neutra) e Aprovar (`.btn-primary`) | `.request-card`, `.request-card-actions`, `.request-card-decline`, `.request-card-approve` em `ui/redesign-ministries.css` |
| **Chip de destino** | "Quer entrar em" + pílula de 26 px com tile mini e "{Ministério} · {Cidade}" (só na Gestão) | `.dest-chip`, `.dest-chip-label` em `ui/redesign-ministries.css`; tile `.min-tile--mini` |
| **Tile do ministério** | quadrado com as 2 iniciais (`initialsOf`: sem "de", "da", "do", "das", "dos", "e"; "Casa de Oração" = CO); tamanhos padrão 44, diálogo 48, compacto 40 e mini 18 | `.min-tile` (`--dialog`, `--compact`, `--mini`) em `ui/redesign-ministries.css`; `ui/initials.ts` |
| **Menu de ação** | pop-over de 216 px (no máximo a largura da tela menos 32 px) colado ao seletor; itens de 44 px; item destrutivo em `--color-error`; fecha com toque fora e Esc; `role="menu"` | `.action-menu`, `.action-menu-item`, `.action-menu-item--danger` em `ui/redesign-ministries.css` |
| **Folha e scrim** | folha inferior de 24 px no topo, alça de 40 x 4, título 18/800, ações de 46 px (Cancelar `flex: 1`, primária `flex: 1.5`); fundo atrás em `--color-scrim`; `role="dialog"`, Esc e toque no scrim fecham | `.sheet`, `.sheet-handle`, `.sheet-actions`, `.sheet-scrim` em `ui/redesign-ministries.css`; diálogo de confirmação em `.dialog` |
| **Esqueleto** | blocos `--color-elevated` sem borda (título, linha, tile, avatar, pílula); pulso de 1,2 s, estático com `prefers-reduced-motion`; contêiner com `aria-busy="true"` e "Carregando…" oculto | `.skeleton` e variantes `.skeleton-title`, `.skeleton-line`, `.skeleton-tile`, `.skeleton-avatar`, `.skeleton-pill` em `ui/redesign-ministries.css` |
| **Estados de bloco** | vazio (`.empty-card`, cartão de 18 px; `.empty-card--search`, de 24 px e centralizado; título 15/700 e apoio 13 muted); erro (`.error-box`, caixa `--color-error-soft`, texto em `--color-error`, "Tentar de novo" em `.btn-primary`); sucesso (`.notice`, prefixo "✓"); informativo (caixa `--color-elevated` com borda) | `.empty-card`, `.error-box` em `ui/redesign-ministries.css`; `.notice` em `ui/redesign-states.css` |
| **Títulos de bloco do Mais e da Gestão** | cartão de perfil de 24 px com avatar quadrado de 56 px (`--color-primary`), eyebrow, título de seção 18/800 e contagem em 13 muted | `.mn-profile-card`, `.mn-profile-avatar`, `.section-eyebrow`, `.mn-section-title`, `.section-count` em `ui/redesign-ministries.css` |
| **Faixa de teste** | faixa no topo, só no site de teste (`louvor-hajaluz-teste`): texto "TESTE · #N" (13 px, negrito, centralizado) sobre `--color-warn-soft`, com `--color-warn`; no topo da página, rola com o conteúdo; nunca cobre controles (sem `sticky` nem `fixed`), com `env(safe-area-inset-top)`. Não aparece em produção (sem `VITE_TEST_BANNER`) | `TestBanner`, `.test-banner` |

Textos fixos dos avisos (pt-BR, usar exatamente):

- Linha Avisos: "Receba repertório novo e lembrete do ensaio neste aparelho"; "Ativados neste aparelho"; "Bloqueados no navegador. Libere as notificações nas configurações do site e volte aqui"; "Instale o app na tela inicial para receber avisos" + "No Safari: Compartilhar › Adicionar à Tela de Início"; "Seu navegador não permite avisos"; "Não foi possível ativar os avisos. Tente de novo."; "Aviso de teste enviado. Ele chega em instantes."; "Não foi possível enviar o teste.". Estados transitórios: "Verificando…", "Ativando…", "Desativando…" (texto muted, pílula desabilitada). Pílulas: "Ativar" (primária), "Desativar" (secundária), "Tentar de novo" (primária, em erro) e "Enviar aviso de teste" (segunda linha, com avisos ativos). Erros usam a caixa vermelha de alerta (`.push-alert`); o sucesso do teste usa `.notice`.
- Aviso do sistema: "Novo repertório" / "{rótulo} · {dia} {dd/mm}"; "Ensaio amanhã às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores." (24 h antes); "Ensaio hoje às {hora}" / mesmo corpo (08h00 do dia do ensaio, só para ensaio às 11h00 ou depois); "Ensaio em 1 hora" ou "Ensaio em {N} min" / "{rótulo} · {hoje|amanhã} às {hora}. Toque para ver os louvores." (até 60 min antes; N ≥ 59 vira "1 hora"); "Ensaio mudou para {hora}" ou "Ensaio mudou para {dia-sem dd/mm} às {hora}" / "{rótulo} · {dia-sem dd/mm}. Toque para ver os louvores."; "Aviso de teste" / "Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.". `{hora}` no formato `18h30`; `{dia-sem dd/mm}` no formato `sáb 21/11`.

Estados obrigatórios por tela: **carregando, vazio, erro**. Ver a tela "Estados e avisos" no Paper.

## 6. Regras de produto que afetam o visual

- Papéis: visitante não vê nada além da tela de acesso pendente; membro sobe cifras e troca tom; só admin cria e edita repertórios e gerencia. Controles que o papel não pode usar
  **não aparecem** (exceto o item "Em breve" de Pessoas).
- Mudar tom: o espaçamento afasta acordes vizinhos; **não** existe aviso de "acorde encosta". Vermelho só
  para o que não coube (vizinho que não é acorde ou margem).
- O PDF é sempre papel branco, inclusive no tema escuro.
- WhatsApp: o botão usa o glifo, mas abre a folha de compartilhar do aparelho (Web Share API).

## 7. Acessibilidade

- Botão só com ícone leva `aria-label` (nome da ação). `aria-current="page"` só para a página atual
  (a pílula de tom padrão na lista usa classe `is-default`, não `aria-current`).
- Foco visível (`:focus-visible` com `--color-accent`), alvos ≥ 44 px, sem informação só por cor.
- O botão de tema diz para qual tema vai ("Mudar para o tema claro/escuro").

## 8. Paper: mapa das telas

Linha 1 (originais): `01 Músicas`, `02 Repertório`, `03 Busca`, `04 Pad (tocando; bolinha verde na aba)`, `05 Mais (admin)`,
`06 Cifra (overlay)`. Demais: `04b Pad (desligado, layout antigo)`, `04c Pad (desligado, como no app; tons salvos com borda âmbar)`, `05b Mais (membro/visitante; obsoleta: visitante não vê Mais)`, `07 Músicas (membro)`,
`08 Cantores`, `09 Cantor`, `10 Cifra (PDF)`, `10b Cifra (PDF em tela cheia)`, `11 Mudar tom (painel)`, `12 Repertório (editar)`,
`13 Repertório (visitante; obsoleta: visitante não vê repertórios)`, `14 Adicionar louvor`, `15 Tom do item`, `16 Repertório · menu e diálogos`,
`17 Cifra no repertório`, `18 Cifra · menu admin`, `19 Admin · editar e apagar`, `20 Login`, `21 Nova cifra`,
`22 Nova cifra · escolher / erro`, `23 Importar em lote`, `24 Pessoas`, `25 Estados e avisos`,
`28 · Músicas · convite para instalar`, `29 · Músicas · convite para instalar (iPhone)`, `32 · Músicas · convite para ativar avisos`, `30 · Avisos · estados`, `31 · Aviso do sistema`, `33 · Visitante sem acesso` (tela de acesso pendente, escura).
Pacote dos ministérios (escuro): `34 Escolha seu ministério`, `35 Confirmar pedido`, `36 Pedido enviado`, `37 Pedido recusado`, `38 Mais (membro)`, `39 Mais (admin do ministério)`, `40 Mais (admin da app e da Haja Luz)`, `41 Pessoas do ministério`, `42 Gestão`, `43 Ministérios`, `44 Novo ministério`, `45 Ministério (detalhe)`, `46 Estatísticas da app`, `47 Estatísticas do ministério`, `48 Admins da app`, `49 Repertório não encontrado`, `50 Ministérios · estados`.
**Tema claro:** `L1 Músicas`, `L2 Repertório`, `L3 Cifra`, `L4 Mudar tom`, `L5 Pad tocando (bolinha verde na aba)`, `L6 Mais (admin)`,
`L7 · Músicas · convite para instalar (claro)`, `L8 · Músicas · convite para instalar (iPhone, claro)`, `L9 · Avisos · estados (claro)`, `L10 · Músicas · convite para ativar avisos (claro)`, `L11 · Mais (membro, claro)`, `L12 · Mais (admin do ministério, claro)`, `L13 · Mais (admin da app e da Haja Luz, claro)`
(tokens `--color-light-*`; o Paper não troca variáveis por artboard, então o claro são artboards próprios).
Numeração nova continua a sequência; telas claras seguem `L<n>`.

## 9. Fluxo: Paper sempre em dia

1. **Antes** de implementar uma tela nova ou mudar uma existente, veja/atualize o desenho no Paper
   (agente `designer`, MCP `paper`). Tokens novos entram no Paper (`create_tokens`/`set_tokens`) e aqui.
2. **No mesmo PR** do código, o Paper tem que refletir o resultado final (escuro **e** claro quando a tela
   é uma das raiz). Marque no PR o que foi atualizado.
3. Nome do artboard: `NN · Nome` (e `L<n> · Nome (claro)`); posição em grade (colunas de 470 px, linhas de 944 px).
   Conferir com `get_screenshot` e chamar `finish_working_on_nodes`.
4. Para ler valores do Paper no código use `get_jsx`/`get_tokens` (nunca medir em screenshot).
5. Se o Paper MCP estiver indisponível (limite, offline): escreva no PR "Paper pendente: <o que>" e atualize
   assim que possível; não deixe virar esquecimento.
6. Decisões de produto de tela (ex.: o que cada papel vê) ficam registradas aqui na seção 5/6.

## 10. Checklist de PR de UI

- [ ] Só tokens (sem cor fixa); claro **e** escuro conferidos
- [ ] Estados vazio, carregando, erro (e visitante) tratados
- [ ] Alvos ≥ 44 px, `aria-label` nos botões de ícone, 360 px sem rolagem horizontal
- [ ] Padrão das seções 4–5 seguido; estilo novo escopado no `redesign*.css` certo
- [ ] Paper atualizado (escuro e claro) e este documento ajustado se o padrão mudou
