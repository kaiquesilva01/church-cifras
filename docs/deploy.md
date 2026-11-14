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

Em Authentication > Settings > **Authorized domains**, adicione o domínio customizado, se houver. `*.web.app` e `*.firebaseapp.com` já vêm por padrão.

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
2. Conceda os papéis **Firebase Admin**, **Cloud Functions Admin**, **Service Account User**, **Cloud Build Editor** (`roles/cloudbuild.builds.editor`), **Artifact Registry Administrator** (`roles/artifactregistry.admin`) e **Cloud Run Admin** (`roles/run.admin`). A lista exigida pela documentação do Firebase pode mudar; consulte-a se o deploy falhar por permissão.
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

## 8. Publicar

Faça o PR `develop` -> `main` e aprove o merge. O workflow **Deploy** publica hosting, functions, regras do Firestore e regras do Storage.
