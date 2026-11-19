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

Para publicar Functions, as seguintes APIs precisam estar ativas: Cloud Functions, Cloud Build, Artifact Registry, Cloud Run e Eventarc (a API de Firebase Extensions não é necessária).
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
| `ADMIN_EMAILS` | e-mails dos administradores, separados por vírgula (ex.: `a@igreja.org,b@igreja.org`) |

Esses valores não são segredos (os `VITE_*` vão para o site publicado; `ADMIN_EMAILS` é gravado em `apps/functions/.env.<projectId>` durante o deploy). A comparação de e-mails ignora maiúsculas.

## 6. Service account (`secrets`)

1. No Google Cloud Console do projeto: IAM e administrador > Contas de serviço > Criar conta de serviço.
2. Conceda os papéis **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**, **Cloud Build Editor** (`roles/cloudbuild.builds.editor`), **Artifact Registry Administrator** (`roles/artifactregistry.admin`) **Cloud Run Admin** (`roles/run.admin`) e **Cloud Scheduler Admin** (`roles/cloudscheduler.admin`, para criar o job diário de Estatísticas). A lista exigida pela documentação do Firebase pode mudar; consulte-a se o deploy falhar por permissão.
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

Faça o PR `develop` -> `main` e aprove o merge. O workflow **Deploy** publica hosting, functions, regras do Firestore e regras do Storage.

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
