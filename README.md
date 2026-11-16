# Church Cifras

Site de cifras para o ministério de louvor de uma igreja.
Permite cadastrar músicas a partir de PDFs, visualizar a cifra no navegador e trocar o tom.
Também gera o PDF da cifra já transposta, pronto para o culto.

- Documento de design: [docs/superpowers/specs/2026-11-13-church-cifras-design.md](docs/superpowers/specs/2026-11-13-church-cifras-design.md)
- Regras do projeto: [AGENTS.md](AGENTS.md)

## Rodar localmente

Pré-requisito: Docker Desktop em execução.

```bash
docker compose up --build
```

- Site: http://localhost:5173
- Emulator UI: http://localhost:4000

Os dados dos emuladores ficam em `./emulator-data` (importados na subida e exportados ao encerrar). Para parar: `docker compose down`.

Notas: a primeira subida leva ~30–60 s (download dos emuladores, depois em cache) e a função `health` pode levar ~20 s a mais para aparecer. Após mudar o `package-lock.json`, use `docker compose up --build -V` (renova os volumes de `node_modules`).

### Testar login localmente

No popup do emulador de Auth, escolha **Add new account** e use o e-mail `admin@cifras.local` para virar admin. Qualquer outro e-mail entra como Visitante.

### Subir uma cifra localmente

1. Entre como `admin@cifras.local` (veja acima); só membros e admins podem subir cifras.
2. Clique em **Nova cifra** e escolha um PDF próprio, de uma cifra que você tenha o direito de usar.
3. Confira título, artista e tom sugeridos, ajuste se precisar e salve.
4. A música aparece na busca; o campo de tons da música é atualizado em alguns segundos pela função `onArrangementWritten`.

Nunca commite PDFs reais (veja [AGENTS.md](AGENTS.md)).

Para verificar o fluxo de ponta a ponta contra os emuladores (upload, regras, gatilho e `replaceArrangement`), com o ambiente no ar (`docker compose up -d --build`):

```bash
npm run smoke:upload
```

O script imprime `OK` e sai com 0, ou o passo que falhou e sai com 1.

### Mudar tom

Membros e admins veem **Mudar tom** no visualizador. Como funciona:

1. A cifra aberta é sempre transposta a partir de um PDF feito à mão (o tom aberto, ou o `derivedFromKey` dele, ou o primeiro feito à mão). Sem PDF feito à mão, o botão fica desabilitado.
2. Ao escolher um tom, a prévia é desenhada na hora sobre a página: os acordes novos aparecem sobre um retângulo branco; os alterados em amarelo e os que podem encostar no vizinho em vermelho. A página em si não é renderizada de novo.
3. **Confirmar** gera um PDF novo (retângulo branco sobre cada acorde e sobre o indicador de tom, com o texto novo por cima), grava em `songs/{id}/{tom}-{fileId}.pdf` e cria o tom como `generated`. Se alguém salvou o mesmo tom antes, o arquivo é descartado e o existente é aberto.
4. `pdf-lib` e `fontkit` só carregam quando o painel é aberto (nunca para quem só lê a cifra).

Limitações conhecidas:

- O acorde antigo continua no PDF, escondido sob o novo. Copiar texto do PDF gerado traz o acorde antigo.
- O indicador de tom (`Tom: E` ou `(E)` no título) é reescrito em preto, sem a cor original e sem preservar link.
- Os PDFs gerados embutem as fontes completas (o subset do fontkit descarta glifos), por isso ficam de 7 a 13 vezes maiores que o original. A Fase 7 trará TTFs pré-reduzidos (acordes + Latin-1).
