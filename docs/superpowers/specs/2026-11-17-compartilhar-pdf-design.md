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
