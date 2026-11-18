# Redesign mobile (Fase 10) — Documento de Design

- **Data:** 2026-11-18
- **Status:** aprovado pelo dono do produto na conversa (design no Paper, arquivo "Church - Cifras")
- **Fase:** 10 (acrescenta-se à §11 do [design principal](2026-11-13-church-cifras-design.md))

> Convenção: **[decidido]** = definido pelo dono do produto.

## 1. Intenção

Nova identidade visual mobile (âmbar, tipografia forte, barra de navegação inferior) em **dois temas, claro e escuro**,
escolhidos pela pessoa. Nenhuma regra de negócio muda.

## 2. Decisões [decidido]

- **Tema:** claro e escuro; botão sol/lua no cabeçalho das telas; a escolha fica no aparelho e, sem escolha, segue o sistema.
  Paleta clara vem do HTML de referência do dono (`html.light`); a escura, do Paper.
- **Aba Pad:** só status e volume (nota atual, música/contexto, sequência de tons do repertório, parar). Sem escolha manual de nota.
- **Cifra:** sem − / + no cabeçalho; os tons salvos são atalhos e **Mudar tom** continua na barra de baixo.
  Barra: ⬇ (ícone), WhatsApp (folha de compartilhar do aparelho), **Pad** (texto), **Mudar tom**.
- **Mudar tom:** sem aviso de acorde encostando (o espaçamento já afasta); vermelho só para o que não coube.
- **Aba Mais:** perfil e papel; **Admin** só para admin (leva a Pessoas); **Pessoas** (músicos) e **Importar** em cinza "Em breve"; Sair.
- Navegação inferior: Músicas, Repertório, Busca, Pad, Mais; telas de detalhe e formulários ficam em tela cheia.

## 3. Fatias (um PR cada, para `develop`)

1. **Tokens e tema** — `:root` claro + `[data-theme='dark']`, `ThemeProvider`, `ThemeToggle`, script anti-flash. *(este PR)*
2. Shell e navegação (barra inferior, rotas `/busca`, `/pad`, `/mais`).
3. Músicas, Cantores, Cantor.
4. Cifra (barra de ações) e painel Mudar tom.
5. Repertórios.
6. Formulários e admin (Login, Nova cifra, Importar, Pessoas, diálogos).
7. Aba Pad (status e volume).
8. Estados e PWA.

## 4. Acessibilidade

- Texto âmbar usa `--color-accent-text` (mais escuro no claro); o âmbar de preenchimento só em botões, FAB e ícones.
- Verde de texto no claro é `#15803d` (a referência usa `#16a34a`, abaixo de 4.5:1 em texto pequeno).
- Botão de tema com `aria-label` que diz para qual tema vai.
