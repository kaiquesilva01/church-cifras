# Compartilhar repertório por link (WhatsApp)

Design curto, aprovado pela pessoa no Paper (telas 12 e 13) em 2026-11-19.

## Intenção

Quem monta o repertório quer mandar o link no WhatsApp e quem abrir cair direto naquele repertório.
Quem recebe é do ministério e já entra no app com Google.

## Metas

- Botão flutuante do WhatsApp no canto inferior esquerdo (lado oposto ao "Adicionar") em `/repertorios/:id`,
  para qualquer papel (visitante, membro e admin). Telas 12 e 13 do Paper.
- Mensagem com título, data, lista de louvores com tom e o link do repertório.
- Abrir o link sem estar logado leva ao login e, depois de entrar, volta ao repertório (não à home).
- Tela do visitante igual à 13 do Paper: contagem de louvores, tom em pílula, louvor sem sublinhado com
  chevron à direita e o aviso "Somente leitura".

## Fora de escopo

- Link público (sem login) e mudanças nas Security Rules: qualquer pessoa logada já lê `setlists`.
- A linha "Pad desligado · Ligar" da tela 13: o app só mostra o mini player com o pad tocando; fica para a fase do pad.

## Abordagens consideradas

1. **Web Share (escolhida)**: igual ao botão da cifra; o usuário escolhe o app (normalmente WhatsApp). Sem
   Web Share (computador), copia a mensagem e avisa "Link copiado".
2. Link direto `wa.me`: abre o WhatsApp em qualquer dispositivo, mas foge do padrão da cifra.

## Decisões

- O link vai dentro do `text` (sem `url` separado): alguns apps descartam `url` quando há `text`.
- Link = `window.location.origin + /repertorios/<id>`. Louvores removidos do catálogo ficam fora da lista.
- Redirecionamento pós-login: `RequireAuth` passa `state.from`; `LoginPage` só aceita caminhos internos
  (começam com `/`, não com `//`, e diferentes de `/login`), senão vai para `/`.
- Cor do WhatsApp: reaproveita `.whatsapp-icon` (exceção de marca já existente), sem `#hex` novo.

## Fica para quem implementa

Nomes de arquivos, testes e CSS, seguindo `docs/design-system.md`.
