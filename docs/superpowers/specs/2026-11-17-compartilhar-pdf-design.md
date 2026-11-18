# Compartilhar PDF no visualizador — design

Data: 2026-11-17. Tamanho: mudança pequena (design curto).

## Intenção e porquê

O ministério de louvor manda a cifra para os músicos pelo WhatsApp. Hoje é preciso baixar o PDF e depois anexá-lo à mão. Um botão "Compartilhar" no visualizador abre o compartilhamento nativo do aparelho com o PDF do tom aberto já anexado.

## Objetivos

- Botão "↗ Compartilhar" na barra inferior do visualizador (`.viewer-bar`), logo depois de `⬇ PDF`.
- Compartilha o arquivo PDF do tom exibido, com o mesmo nome do download (`pdfFileName(título, cantor, tom)`).
- Todos os papéis (visitante, membro, admin): quem pode baixar pode compartilhar.

## Não-objetivos

- Link público ou link da cifra: o spec exige login e não tem link público.
- Link `wa.me` ou envio por texto: não anexa o PDF.
- Fallback de download onde o compartilhamento de arquivo não existe.

## Anti-objetivos

- Botão visível que não funciona.
- Compartilhar o PDF de outro tom que não o exibido (com o painel "Mudar tom" aberto, vale o que o download já usa: `displayed`).
- Atrasar a abertura da cifra: nada novo é carregado; os bytes já estão em memória.

## Restrições

- Web Share API com arquivos: `navigator.canShare({ files })` e `navigator.share({ files })`.
- `share()` precisa rodar dentro do gesto do toque (iOS): os bytes já estão em memória, sem `await` antes da chamada.
- Texto de UI em pt-BR; identificadores em inglês.

## Approaches

1. **Web Share API com arquivo (escolhida).** Anexa o PDF de verdade no WhatsApp. Só existe onde o navegador suporta (Android, iOS, parte dos navegadores de desktop).
2. Link `wa.me` com texto: não anexa arquivo. Descartada.
3. Compartilhar link da cifra: exige login, sem link público. Descartada.

Decisão do usuário: onde o navegador não suporta compartilhar arquivo, **o botão fica escondido** (o `⬇ PDF` continua disponível). A alternativa, mostrar o botão e baixar com aviso, foi descartada por duplicar o botão de PDF.

## Comportamento

- Suporte detectado uma vez (`navigator.share` e `navigator.canShare` existem e `canShare({ files: [arquivo] })` é verdadeiro); sem suporte, o botão não renderiza.
- Desabilitado enquanto o PDF não carregou (`current?.status !== 'ready'`), como o `⬇ PDF`.
- Usuário cancela a folha (`AbortError`): silencioso.
- Outro erro: aviso curto em pt-BR ("Não foi possível compartilhar. Tente de novo.").
- Testes com `navigator.share`/`canShare` simulados (jsdom não os tem): suportado, não suportado, cancelamento, erro, nome e tipo do arquivo.

## Fica para o builder

- Posição e visual exatos na barra, incluindo celular de ~360px com `SetlistBar` + `PDF` + `Compartilhar` + `Mudar tom`: definidos pelo agente `designer`.
- Onde extrair a lógica (helper em `apps/web/src/viewer/`, ao lado de `fileName.ts`) e onde mostrar o erro.

## Layout

Definido pelo `designer`, mobile-first, conferido contra `apps/web/src/ui/styles.css` e `viewerLayoutCss.test.ts`. Não há mockup novo na §6.10 para este botão; vale a linguagem visual existente da barra (glifo + `.btn`).

### (a) Ordem

`⬇ PDF`, `Compartilhar`, `♪ Mudar tom`. Os dois botões de arquivo ficam juntos à esquerda; `Mudar tom` continua sendo a ação primária empurrada à direita (`margin-left: auto`, regra existente). Sem `Mudar tom` (visitante), `PDF` e `Compartilhar` ficam à esquerda e a barra tem espaço livre à direita.

### (b) Rótulo

Só ícone: glifo `↗` (`<span aria-hidden="true">↗</span>`, no mesmo estilo dos glifos `⬇` e `♪`), com `aria-label="Compartilhar"` e `title="Compartilhar"`. O nome acessível é "Compartilhar" em todos os casos. Alvo de toque 44x44 px.

Motivo: o botão com texto (`↗ Compartilhar`, ~140 px) soma 70 + 140 + 130 + 16 = 356 px e estoura os 328 px úteis de 360 px de largura. Só ícone soma 70 + 44 + 130 + 16 = 260 px.

### (c) Encaixe em 360 px (sem `flex-wrap`, sem rolagem horizontal)

Largura útil da barra: 360 - 2x16 = 328 px; `gap: 8px`. Esquema (larguras aproximadas):

```
Membro/admin  | [⬇ PDF 70] [↗ 44]            [♪ Mudar tom 130] |   260 px, sobra 68 px
Visitante     | [⬇ PDF 70] [↗ 44]                              |   122 px
Repertório    | [SetlistBar, largura total, linha 1]           |
(membro)      | [⬇ PDF 70] [↗ 44]            [♪ Mudar tom 130] |   linha 2
```

- Fora de repertório a barra continua em uma única linha, sem `flex-wrap` (o teste exige isso). O `.viewer.has-setlist .viewer-bar`, que já pode quebrar, mantém `SetlistBar` (`flex-basis: 100%`) na linha 1 e os botões na linha 2; os três botões cabem na linha 2 (260 px), então a barra não ganha uma terceira linha.
- Ausente (navegador sem suporte a compartilhar arquivo): o botão não renderiza e a barra fica exatamente como hoje. Não deixar espaço reservado nem separador.
- O parágrafo `#no-source` (`.muted`) já existente continua como último item da barra; não muda.

### (d) Classes e CSS

Usar `className="btn btn-icon"` (botão secundário, mesmas cores que `⬇ PDF`: `--color-surface`, `--color-border-strong`, `--color-text`, `--radius`). Sem cor nova, sem token novo.

`.btn-icon` hoje tem `min-width: 36px` e `padding: 6px 8px` (usado em listas de repertório); a barra exige 44 px. Uma regra nova, escopada à barra para não alterar os outros usos, colocada logo depois de `.viewer-bar .btn-primary` em `styles.css`:

```css
.viewer-bar .btn-icon {
  min-width: 44px;
  padding: 8px;
}
```

A altura de 44 px já vem de `.btn` (`min-height: 44px`). A regra não usa `flex-wrap` e não toca `.viewer-bar` em si.

### (e) Estados

| Estado | Visual | Comportamento |
| --- | --- | --- |
| Normal | `.btn.btn-icon`, glifo `↗` | Toque chama `navigator.share` |
| Desabilitado (PDF carregando, `current?.status !== 'ready'`) | `disabled`; `.btn:disabled` (`opacity: 0.6`, cursor padrão), igual ao `⬇ PDF` | Sem ação |
| Enviando (folha de compartilhamento aberta) | `disabled` e `aria-busy="true"`, mesmo visual do desabilitado | Impede toque duplo; volta ao normal quando a promessa resolve ou é cancelada |
| Cancelado (`AbortError`) | Volta ao normal | Silencioso |
| Erro | Sem mudança no botão (volta ao normal); aviso no corpo da página | Ver abaixo |

Erro: `<p role="alert" className="error">Não foi possível compartilhar. Tente de novo.</p>` no corpo da página, logo depois de `<SetlistNotices … />` e antes do bloco que escolhe entre erro/vazio/PDF (mesma posição e estilo do "Não foi possível abrir o PDF."), nunca na barra fixa (que não tem espaço e fica sob o polegar). Some ao iniciar nova tentativa, ao trocar de tom e ao trocar de música. Não é preciso estado vazio: o botão ausente cobre "sem suporte" e o desabilitado cobre "sem PDF/carregando". Foco visível: `:focus-visible` global já cobre o botão.
