# Deploy em produção

O deploy roda sozinho no GitHub Actions a cada push em `main` (ou manualmente em Actions > Deploy > Run workflow).
Enquanto a configuração abaixo não existir, o workflow termina com sucesso e mostra o aviso
`Deploy ignorado: produção ainda não configurada (docs/deploy.md)`.
Se apenas parte da configuração existir (alguma variável ou segredo faltando), o workflow **falha** listando o que falta.

## 1. Criar o projeto Firebase

1. Acesse o [console do Firebase](https://console.firebase.google.com/) e crie um projeto (ex.: `church-cifras`).
2. Anote o **ID do projeto**.

## 2. Ativar o plano Blaze

Cloud Functions exige o plano Blaze (pago conforme o uso, com cota gratuita). Em **Uso e faturamento**, altere o plano para Blaze.

## 3. Ativar os serviços

- **Authentication**: Build > Authentication > Começar > provedor **Google**. Mantenha **somente** o provedor Google ativo: deixe **E-mail/senha** e **Anonymous** (anônimo) **desativados**. As regras tratam qualquer usuário autenticado como leitor, então o login anônimo daria acesso de leitura a qualquer pessoa; e o papel Admin só é concedido a e-mails verificados, o que o Google garante e o cadastro por e-mail/senha não.
- **Firestore**: Build > Firestore Database > Criar banco de dados, região **`southamerica-east1`** (São Paulo).
- **Storage**: Build > Storage > Começar (use a mesma região, `southamerica-east1`). Atenção: um bucket em `southamerica-east1` fica fora da cota gratuita do Storage; o custo é irrisório para PDFs.

### APIs do Google Cloud

Para publicar Functions, as seguintes APIs precisam estar ativas: Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc e Pub/Sub (a API de Firebase Extensions não é necessária). O gatilho do repertório novo (`onSetlistWritten`) usa Eventarc, que entrega por Pub/Sub.
O primeiro deploy pode pedir para ativá-las. Recomendado: ativar as APIs pelo console (APIs e serviços > Biblioteca) ou rodar um deploy manual **apenas de Functions** uma vez: `npx firebase deploy --only functions --project <id>`.

> **Atenção:** nunca faça deploy do Hosting a partir de um build local (`firebase deploy` sem `--only`, ou `--only hosting`). O build de produção precisa das variáveis `VITE_FIREBASE_*` e `VITE_USE_EMULATORS=false` definidas pela CI; um build local pode publicar o site apontando para os emuladores ou com configuração errada. O Hosting só é publicado pelo workflow de deploy.

### Domínios autorizados

Em Authentication > Settings > **Authorized domains**, adicione `louvor-hajaluz.web.app` e `louvor-hajaluz.firebaseapp.com` (e o domínio customizado, se houver). Só os domínios do site padrão do projeto (`<projeto>.web.app` e `<projeto>.firebaseapp.com`) vêm autorizados; sites extras do Hosting não.

### Sites do Hosting

O app é publicado no site **`louvor-hajaluz`** (`https://louvor-hajaluz.web.app`), criado em Hosting > **Adicionar outro site** (ou `firebase hosting:sites:create louvor-hajaluz`). **Crie o site antes do primeiro push para `main`**: sem ele o `firebase deploy` do workflow falha.

O site padrão do projeto (`<projeto>.web.app`) só redireciona (301) para o novo, mantendo o caminho, para os links antigos continuarem funcionando; ele não pode ser apagado ou renomeado. O `firebase.json` traz o ID desse site (`cifras-louvor-5dd50`) fixo: para publicar em outro projeto, troque-o pelo ID do novo projeto.

Quem já visitou o endereço antigo tem o service worker do app registrado nele, que serviria o `index.html` em cache e impediria o redirecionamento. Por isso o `/sw.js` do site padrão **não** é redirecionado: ele serve `hosting/legacy/sw.js`, um worker que se desinstala, limpa os caches e recarrega as abas abertas, que então seguem o 301 para o site novo. Não remova esse arquivo enquanto houver clientes no endereço antigo. No `firebase.json`, a raiz `/` tem uma regra própria (um grupo de captura vazio quebraria o destino) e o regex das demais rotas significa "qualquer caminho não vazio, exceto `/sw.js`" (o RE2 do Firebase não tem lookahead).

Mantenha `VITE_FIREBASE_AUTH_DOMAIN` apontando para `<projeto>.firebaseapp.com`: o popup do login Google usa as páginas reservadas `/__/auth/*` desse domínio, que o Firebase atende antes dos redirecionamentos.

## 4. Criar o app Web

1. Em Configurações do projeto > Seus apps, adicione um app **Web**.
2. Copie os valores de `firebaseConfig`.

## 5. Variáveis do GitHub (`vars`)

No repositório: Settings > Secrets and variables > Actions > aba **Variables**. Crie:

| Variável | Valor |
| --- | --- |
| `FIREBASE_PROJECT_ID` | ID do projeto |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` (Firebase › Configurações do projeto › Cloud Messaging › "ID do remetente"); opcional, usada pela tela de avisos push (#99) |
| `VITE_FIREBASE_VAPID_KEY` | chave **pública** de push da Web (Cloud Messaging › Configuração da Web › Certificados push da Web › "Gerar par de chaves"); opcional, usada pela tela de avisos push (#99), que só aparece com as duas definidas |
| `ADMIN_EMAILS` | e-mails dos administradores, separados por vírgula (ex.: `a@igreja.org,b@igreja.org`) |

Esses valores não são segredos (os `VITE_*` vão para o site publicado; `ADMIN_EMAILS` é gravado em `apps/functions/.env.<projectId>` durante o deploy). A comparação de e-mails ignora maiúsculas.

## 6. Service account (`secrets`)

1. No Google Cloud Console do projeto: IAM e administrador > Contas de serviço > Criar conta de serviço.
2. Conceda os papéis **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**, **Cloud Build Editor** (`roles/cloudbuild.builds.editor`), **Artifact Registry Administrator** (`roles/artifactregistry.admin`), **Cloud Run Admin** (`roles/run.admin`) e **Cloud Scheduler Admin** (`roles/cloudscheduler.admin`, para criar o job diário de Estatísticas). A lista exigida pela documentação do Firebase pode mudar; consulte-a se o deploy falhar por permissão.
3. Em Chaves > Adicionar chave > JSON, baixe o arquivo.
4. No GitHub, aba **Secrets**, crie `FIREBASE_SERVICE_ACCOUNT` com o **conteúdo inteiro** do JSON.
5. Apague o arquivo JSON local. Nunca o commite.

## 7. Administradores

Defina `ADMIN_EMAILS` como variável do repositório (seção 5). O workflow de deploy a grava em `apps/functions/.env.<projectId>` antes de publicar as Functions. Quem entra com um desses e-mails no primeiro login vira Admin; os demais entram como Visitante e um admin altera o papel na página Pessoas. Como `ADMIN_EMAILS` é exigida pela checagem, configuração parcial faz o deploy falhar. O valor não pode conter quebra de linha, aspas, `#`, `\` nem `=`; o workflow rejeita esses caracteres.

`ADMIN_EMAILS` vale **só no primeiro login** de cada pessoa (quando o perfil é criado). Mudar a variável depois não promove nem rebaixa quem já entrou; use a página Pessoas.

### Recuperação sem nenhum admin

Se ninguém tiver o papel Admin (por exemplo, o único admin foi rebaixado), use uma das opções:

- Confirme que o e-mail está em `ADMIN_EMAILS`, apague o usuário em Authentication > Users no console do Firebase, apague também o documento `users/<uid>` no Firestore e entre de novo com Google (o primeiro login cria o perfil como Admin).
- Ou defina manualmente, pelo console/Admin SDK, o custom claim `role: "admin"` do usuário e o campo `role: "admin"` em `users/<uid>`; depois a pessoa precisa sair e entrar de novo.

## 8. CORS do bucket do Storage

A Fase 5 lê os bytes dos PDFs no navegador (pdf.js), o que exige CORS no bucket de produção. O bucket padrão vem de `VITE_FIREBASE_STORAGE_BUCKET`.

1. Copie `cors.json` (raiz do repositório) e troque `<projeto>` pelo ID do projeto. A lista já inclui as origens do site `louvor-hajaluz` e do site padrão; acrescente o domínio próprio, se houver.
2. Autentique com `gcloud auth login` e aplique:

```bash
gsutil cors set cors.json gs://<bucket>
gsutil cors get gs://<bucket>
```

Só é preciso repetir se a origem mudar. Os emuladores locais não precisam disso.

## 9. Publicar

O release sai pelo fluxo do agente: o orquestrador abre o PR `develop` -> `main` e faz o merge com `gh pr merge <n> --merge --match-head-commit <sha>` (merge commit, nunca squash), sob as travas do git-guard (CI verde, fora da janela do culto, sem incidente aberto). Depois do merge, o workflow **Deploy** publica hosting, functions, regras do Firestore e regras do Storage, e a checagem confere a versão no ar e o carregamento da página. Se a checagem falha num push para a `main`, o workflow volta para o último Deploy verde e abre uma issue `incidente`, que bloqueia o próximo release até ser fechada (ver o roteiro em `.claude/skills/entregar-issue/SKILL.md`, § Produção e incidente). A mudança que instalou este fluxo (SDLC com agentes) é o último release feito à mão.

### Loops do pad

Os 12 loops do pad ambiente (Fase 9) não vão no git nem no Hosting: são enviados uma vez ao Storage, em `pads/<versão>/<arquivo>.m4a`.

1. Produza os loops a partir dos MP3 de origem (fora do repositório, em `fixtures/private/`):

   ```bash
   node scripts/pads/produce.mjs --src fixtures/private/pads-src --out fixtures/private/pads
   ```

2. Ouça os arquivos de `fixtures/private/pads/teste-3x/` (intro uma vez e o loop três vezes): a emenda não pode estalar nem engasgar. O aceite é de ouvido, pelo dono.
3. Envie com credenciais ADC (por exemplo `gcloud auth application-default login`; nunca guarde credenciais no repositório) e o `--bucket` igual ao `VITE_FIREBASE_STORAGE_BUCKET` do deploy:

   ```bash
   node scripts/pads/upload.mjs --dir fixtures/private/pads/loops \
     --report fixtures/private/pads/relatorio.json --bucket <bucket>
   ```

   O script imprime o destino (bucket, produção ou emulador, versão e número de arquivos), confere tudo contra `apps/web/src/pad/padManifest.json` e se recusa a sobrescrever: se algum dos 12 objetos já existir, aborta e lista quais.

**Versão.** Os arquivos são imutáveis e ficam 1 ano em cache nos aparelhos. Para regenerar os loops, suba a `version` em `padManifest.json` (`v1` -> `v2`) e lance o app junto com o novo envio; nunca troque o conteúdo de uma versão publicada.

**Regras.** Os objetos ficam ilegíveis (403) até o deploy das regras do Storage (`pads/` só para autenticados, escrita negada); publique as regras antes de testar no app.

**Se o envio for pulado.** A cifra e o resto do app funcionam normalmente; só o botão do pad mostra "Pad indisponível · tentar de novo".

## 10. Repertórios: TTL e índice (depois do primeiro deploy)

Os repertórios somem sozinhos 30 dias após o culto (campo `expiresAt`). Depois do primeiro deploy com a Fase 8, confira no console do Firebase, em Firestore > TTL e índices:

- a política de TTL da coleção `setlists` no campo `expiresAt` está ativa;
- o índice ascendente de `setlists.expiresAt` está criado e ativo;
- a conta de serviço do deploy consegue gerenciar índices (se o deploy falhar ao criar o índice, conceda o papel de administrador do Cloud Datastore/Firestore a ela).

## 11. Estatísticas: Cloud Scheduler e setlistUsage

- O Firebase CLI normalmente ativa sozinho a API `cloudscheduler.googleapis.com` no primeiro deploy da função `countSetlistUsage`. Se o CLI ou a conta de deploy não conseguir ativá-la, ative-a manualmente antes do primeiro deploy (APIs e serviços > Biblioteca, ou `gcloud services enable cloudscheduler.googleapis.com --project <id>`); sem ela, o deploy da função falha.
- Depois do deploy, confira no console do Google Cloud (Cloud Scheduler) que o job `firebase-schedule-countSetlistUsage-southamerica-east1` existe e roda todo dia às 04:00 (horário de Brasília, `America/Sao_Paulo`).
- Após o primeiro deploy, force a execução do job no Cloud Scheduler ("Forçar execução") e abra Estatísticas uma vez como admin para conferir os dados reais.
- A coleção `setlistUsage` **não** deve ter política de TTL (Firestore > TTL e índices): ela guarda o histórico de uso das músicas, que precisa durar.
- A primeira visita de um admin a Estatísticas já conta os repertórios fechados que ainda existem; o job diário faz o mesmo para os demais.

## 12. Preencher as letras das músicas já enviadas

Músicas enviadas antes da busca por letra não têm `songLyrics/{songId}`. O script lê o PDF do arranjo feito à mão de cada uma e cria o documento só quando ele não existe; rodar de novo não grava nada.

Rode **depois** do deploy (release já em `main`), a partir da **raiz do repositório**. Num Cloud Shell novo, a sequência completa é esta (troque `<url-do-repositório>`, `<id-do-projeto>` e `<bucket>`; o bucket é o mesmo de `VITE_FIREBASE_STORAGE_BUCKET`):

```bash
git clone <url-do-repositório> church-cifras && cd church-cifras
git checkout main && git pull
nvm install && nvm use          # Node do .nvmrc; o pdfjs-dist exige Node >= 22.13
npm ci                          # na raiz
gcloud config set project <id-do-projeto>
npm run lyrics:backfill -- --bucket <bucket> --dry-run
```

Fora do Cloud Shell, faça antes `gcloud auth application-default login`. Se preferir não mudar o projeto do `gcloud`, exporte `GOOGLE_CLOUD_PROJECT=<id-do-projeto>`.

O `--dry-run` mostra quantas letras seriam gravadas, quais músicas não têm PDF ou texto extraível e uma amostra das primeiras linhas de cada letra. Confira as amostras e, no cabeçalho da saída, se `projeto:` e `bucket:` são os de produção (e que não aparece nenhuma linha `..._EMULATOR_HOST`). Só então rode sem `--dry-run`:

```bash
npm run lyrics:backfill -- --bucket <bucket>
```

Com algumas centenas de PDFs, cada execução leva alguns minutos; o progresso sai em `processadas n/total` (a cada 25 músicas) no stderr.

Saída com `falhas` diferente de zero encerra com código 1; as músicas com falha aparecem listadas e podem ser reexecutadas com segurança. Use `--samples <n>` para mudar o número de amostras (padrão 3).

## 13. Site de teste

O site **`louvor-hajaluz-teste`** (`https://louvor-hajaluz-teste.web.app`) é um terceiro site de Hosting no mesmo projeto, para testar uma branch antes da produção. Ele mostra a faixa "TESTE · #N" no topo, para não ser confundido com o app de verdade. Só o workflow **Site de teste** publica nele, sempre disparado a partir da `main` (Actions > Site de teste > Run workflow, com a branch e o número da issue). O deploy de produção não lista esse site, então nunca o recebe.

Passos únicos (feitos uma vez pela pessoa responsável):

1. Crie o site: `firebase hosting:sites:create louvor-hajaluz-teste`.
2. Em Authentication > Settings > **Authorized domains**, adicione `louvor-hajaluz-teste.web.app`, para o login funcionar no site de teste.
3. Aplique o `cors.json` atualizado no bucket do Storage (`gsutil cors set cors.json gs://<bucket>`, como na seção 8), para os PDFs carregarem no site de teste.
4. Se a chave de API do navegador tiver restrição de referenciador HTTP (Google Cloud > APIs e serviços > Credenciais), acrescente `https://louvor-hajaluz-teste.web.app/*` às referências permitidas.

## 14. Build das funções falha com `Cannot read properties of null (reading 'edgesOut')`

A Cloud Build instala `apps/functions/package.json` sozinho (npm 10, sem lockfile). No npm 10.9.x o par `firebase-admin` + `firebase-functions` quebra a resolução de dependências com esse erro, e **todas** as funções falham no deploy (inclusive as que não mudaram; o erro só aparece quando o código das funções muda, porque o Firebase pula funções sem alteração). Reproduzido localmente com `npx npm@10.9.9 install` numa pasta só com esse `package.json`; no npm 11 funciona.

A correção é o arquivo `apps/functions/.npmrc` com `legacy-peer-deps=true`. Não o remova; o teste `tests/config/workspace-deps.test.ts` cobre a presença dele e que o deploy não o ignora. Se o erro voltar mesmo assim, a alternativa é versionar um `package-lock.json` gerado com o npm 11 dentro de `apps/functions` (a Cloud Build passa a usar `npm ci`), sem nenhum pacote `@cifras/*`.

## 15. Avisos de repertório novo (#101)

Passos manuais da pessoa responsável, nesta ordem.

**Antes do deploy que traz a #101:**

- Confira se as APIs `pubsub.googleapis.com` e `eventarc.googleapis.com` já estão ativas (APIs e serviços > Ativadas). Provavelmente estão: o `onArrangementWritten` já é um gatilho do Firestore na mesma região em produção e usa Eventarc. Se estiverem, pule este passo; se não, ative-as (APIs e serviços > Biblioteca, ou `gcloud services enable pubsub.googleapis.com eventarc.googleapis.com --project <id>`).
- Confira se a conta de serviço do deploy já tem o papel **Eventarc Admin** (`roles/eventarc.admin`); pelo mesmo motivo, provavelmente tem. Se estiver, pule; se não, dê o papel. Sem ele, o deploy da função `onSetlistWritten` falha. Confirme o nome do papel na documentação oficial do Firebase e do Google Cloud no momento do passo, porque ele pode mudar.
- Se o primeiro deploy falhar com erro de permissão do agente de serviço do Eventarc, rode o deploy de novo: costuma passar na segunda tentativa.

**Depois do deploy:**

- O primeiro deploy do gatilho pode levar alguns minutos até ele começar a disparar. Espere antes de testar um aviso.
- Em Firestore > TTL e índices, confira que a política de TTL de `avisosEnviados` no campo `expiresAt` está ativa. Se o deploy não a tiver criado, ative-a à mão.
- Não há índice de campo para `avisosEnviados.expiresAt`: é esperado.
- Em Cloud Run ou em Functions, confira que a função `onSetlistWritten` existe na região `southamerica-east1`.

**Atenção:** não apague a coleção `avisosEnviados` à mão. Ela é a trava que impede aviso repetido do mesmo repertório.

## 16. Lembretes do ensaio (#102)

**Antes do deploy que traz a #102:** nada além dos passos da #101 (§15). As APIs `pubsub`, `eventarc` e `cloudscheduler` e o papel Eventarc Admin já são exigidos pela #101 (§15) e pelo `countSetlistUsage` (§11).

**Depois do deploy:**

- Em Cloud Scheduler (console do Google Cloud), confira que o job `firebase-schedule-sendRehearsalReminders-southamerica-east1` existe, roda a cada minuto (`* * * * *`, horário de Brasília, `America/Sao_Paulo`) e que a última execução não tem erro.
- Custo: cerca de 43.200 execuções por mês (1 por minuto). O Cloud Scheduler dá 3 jobs gratuitos por conta de faturamento; este é o 2º (o 1º é `countSetlistUsage`, §11). Confirme o limite atual na documentação do Google Cloud no momento do passo; acima dele, o custo é de centavos por job.
- Não há TTL nem índice novo: a política de TTL de `avisosEnviados` já foi conferida na §15, e a consulta por `rehearsalAt` usa o índice automático de campo único.
- Se o job não existir ou não rodar, veja o log da função `sendRehearsalReminders` em Cloud Functions; a falha não abre incidente automático (é agendada, sem volta), então confira à mão depois de cada deploy que mexa nela.
- Sem migração: marcas antigas `perto` e `agora` ficam; um aviso já enviado antes do deploy não se repete.

**Teste no aparelho (passo da pessoa, critério 8 da #102; atualizado pela #121):** Android e iPhone com iOS 16.4+, com o app instalado em produção (`https://louvor-hajaluz.web.app`) e os avisos ativados. Crie o repertório também em produção: aparelho só recebe aviso de repertório da mesma origem. Com um ensaio marcado para amanhã, às HHhMM: chega "Ensaio amanhã às HHhMM" na véspera, entre HHhMM e HHhMM+10 min (horário de Brasília), com o app fechado. No dia, entre 08h00 e 08h10, se o ensaio for às 11h00 ou depois: "Ensaio hoje às HHhMM". Uma hora antes: "Ensaio em 1 hora". Mude a hora do ensaio depois de um aviso: o próximo aviso devido chega com "Ensaio mudou para HHhMM" (ou "Ensaio mudou para dom 22/11 às HHhMM", se o dia mudou), uma vez, e pode ser horas depois. Para ver a véspera sem esperar um dia, marque o ensaio para amanhã com um horário alguns minutos antes da hora atual (ex.: são 18h20, marque amanhã às 18h15); o aviso chega em até um minuto. Deixe o aviso anterior na bandeja para conferir que o próximo alerta de novo. Desligue `config/push` (`enabled: false`) e confira que nada chega.

## 17. Visitantes sem acesso (#126)

- As Rules de Firestore e Storage mudam neste release: quem não é membro nem admin deixa de ler cifras, repertórios e pads. Publicar `firestore` e `storage` já faz parte do deploy; não há passo novo de configuração.
- **Antes de publicar**, avise os admins para liberarem em **Pessoas** as pessoas que hoje usam o app como visitante (elas são o público afetado). Sem a liberação, essas pessoas veem só a tela "Acesso ainda não liberado" depois do deploy.
- Quem for liberado precisa entrar de novo no app para ver o conteúdo (o token é renovado sozinho com a tela aberta, mas entrar de novo é o caminho garantido).
