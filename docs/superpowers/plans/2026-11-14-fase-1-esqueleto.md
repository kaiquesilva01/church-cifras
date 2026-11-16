# Fase 1 — Esqueleto do monorepo, Docker e CI: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose up` sobe o site React (Vite) conectado aos emuladores do Firebase (Auth, Firestore, Storage, Functions, UI), com uma função Node de saúde chamada pelo site; CI valida tudo em PR e o deploy para produção fica pronto (dispara em push na `main`).

**Architecture:** npm workspaces (`apps/web`, `apps/functions`; `packages/*` vazio até a Fase 3). O site fala direto com o Firebase via SDK; em dev, conecta nos emuladores quando `VITE_USE_EMULATORS=true`. Functions empacotadas com `tsup` em `apps/functions/lib/index.js` (inclui pacotes do workspace nas próximas fases). Projeto Firebase local `demo-church-cifras` (prefixo `demo-` = só emulador, sem credenciais). Regras começam negando tudo.

**Tech Stack:** Node 22 (runtime das Functions e imagens Docker), TypeScript strict, React + Vite, Vitest + Testing Library, ESLint (flat config) + Prettier, Firebase JS SDK, firebase-functions v2, firebase-admin, firebase-tools, `@firebase/rules-unit-testing`, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§4, §5.2, §7, §8, §9, §11 item 1)

## Global Constraints

- Tudo roda localmente com **`docker compose up`** (spec §7); nenhum passo local exige credencial real.
- Projeto Firebase local: `demo-church-cifras`. Produção: id vem de `vars.FIREBASE_PROJECT_ID` no GitHub; credencial em `secrets.FIREBASE_SERVICE_ACCOUNT`.
- Portas: web `5173`, Emulator UI `4000`, Auth `9099`, Firestore `8080`, Storage `9199`, Functions `5001`, Hub `4400`, Logging `4500`.
- Versões de dependências **exatas** (sem `^`/`~`), escolhidas como a última estável no momento da implementação (`npm view <pkg> version`), exceto quando este plano fixa uma.
- Functions: runtime `nodejs22`, região `southamerica-east1`.
- TypeScript `strict: true` em todos os pacotes; identificadores em inglês, textos de UI em pt-BR.
- Nunca commitar PDFs, `.env`, credenciais, `emulator-data/`, `lib/`, `dist/`.
- Commits: Conventional Commits em inglês + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Comandos de git: `git add <caminhos>` e `git commit` em comandos separados (hook ativo).

## Review Focus

1. **Docker no Windows sem hot reload**: bind mount do Windows não propaga eventos de arquivo → Vite e tsup precisam de polling quando `CHOKIDAR_USEPOLLING=true` — verificado na Task 4 Step 4.
2. **`node_modules` do host sobrescrevendo o do contêiner** (binários nativos Windows × Linux) → volumes anônimos para `node_modules` — verificado na Task 4.
3. **Emuladores inacessíveis do host**: emuladores escutando em `127.0.0.1` dentro do contêiner → `host: "0.0.0.0"` em todos — teste `firebase.json binds every emulator to 0.0.0.0` (Task 3).
4. **Site apontando para produção em dev** (ou emulador em produção) → conexão aos emuladores só com `VITE_USE_EMULATORS=true` — teste `connects to emulators only when flag is true` (Task 2).
5. **Deploy rodando sem projeto configurado** → workflow pula com aviso claro se `FIREBASE_PROJECT_ID`/secret ausentes, em vez de falhar obscuro — Task 5 Step 2.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json` | Workspaces + scripts raiz (`lint`, `typecheck`, `test`, `build`, `format`, `test:rules`, `test:harness`) |
| `tsconfig.base.json` | Config TS compartilhada (strict) |
| `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.nvmrc` | Qualidade de código |
| `apps/functions/src/health.ts` | `buildHealth(now: Date): HealthStatus` (puro) |
| `apps/functions/src/index.ts` | Exporta a callable `health` |
| `apps/functions/tsup.config.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts` | Build/teste das Functions |
| `apps/web/src/lib/firebase.ts` | `createFirebase(env): FirebaseServices` — init + emuladores |
| `apps/web/src/App.tsx`, `main.tsx`, `index.html`, `vite.config.ts` | Casca do site |
| `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules` | Config Firebase |
| `tests/rules/*.test.ts` | Testes de regras no emulador |
| `tests/config/firebase-json.test.ts` | Valida `firebase.json` |
| `docker/dev.Dockerfile`, `docker-compose.yml`, `.dockerignore` | Ambiente local |
| `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` | CI/CD |
| `docs/deploy.md` | Passo a passo para o dono configurar produção |

---

### Task 1: Ferramentas raiz e Functions com `health`

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.nvmrc`, `apps/functions/{package.json,tsconfig.json,tsup.config.ts,vitest.config.ts}`, `apps/functions/src/{health.ts,index.ts}`
- Test: `apps/functions/src/health.test.ts`

**Interfaces:**
- Produces: `HealthStatus = { status: 'ok'; service: 'church-cifras'; time: string }`; `buildHealth(now: Date): HealthStatus`; callable `health` (região `southamerica-east1`) retornando `buildHealth(new Date())`. Scripts raiz: `npm run lint|typecheck|test|build|format`, `npm run test:harness` = `node --test ".claude/**/*.test.mjs"`. Workspace `@cifras/functions` com `build` (tsup → `lib/index.js`, formato cjs, target node22, `noExternal: [/^@cifras\//]`) e `build:watch`.

- [ ] **Step 1: Raiz.** `package.json` com `"private": true`, `"workspaces": ["apps/*", "packages/*"]`, `"engines": {"node": ">=22"}`, scripts que delegam com `--workspaces --if-present`. `.nvmrc` = `22`. `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes: false`, `module`/`moduleResolution` `Bundler`, `target ES2022`, `skipLibCheck`. ESLint flat config com `typescript-eslint` recommended + `eslint-plugin-react-hooks` para `apps/web`; Prettier `singleQuote`, `semi: true`, `printWidth: 100`.
- [ ] **Step 2: Teste que falha** — `health.test.ts`: `returns ok status with ISO time` → `buildHealth(new Date('2026-01-02T03:04:05.000Z'))` deepEquals `{ status: 'ok', service: 'church-cifras', time: '2026-01-02T03:04:05.000Z' }`.
- [ ] **Step 3:** `npm install` e `npm test -w @cifras/functions` → FAIL (módulo inexistente).
- [ ] **Step 4:** Implementar `health.ts` e `index.ts` (`onCall({ region: 'southamerica-east1' }, () => buildHealth(new Date()))`), configs de tsup/vitest/tsconfig (estende a base; `types: ["node"]`). `package.json` do workspace: `"main": "lib/index.js"`, `"engines": {"node": "22"}`.
- [ ] **Step 5:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build -w @cifras/functions` → tudo verde; `apps/functions/lib/index.js` existe.
- [ ] **Step 6: Commit** — `chore: add monorepo tooling and functions health endpoint`.

---

### Task 2: Site React com conexão aos emuladores

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,.env.example}`, `apps/web/src/{main.tsx,App.tsx,lib/firebase.ts,vite-env.d.ts,test/setup.ts}`
- Test: `apps/web/src/lib/firebase.test.ts`, `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes: callable `health` (Task 1).
- Produces: `createFirebase(env: WebEnv): FirebaseServices` com `FirebaseServices = { app, auth, db, storage, functions }`; `WebEnv` = campos `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`, `VITE_USE_EMULATORS`, `VITE_EMULATOR_HOST`. Functions do cliente na região `southamerica-east1`. Workspace `@cifras/web`.

- [ ] **Step 1: Testes que falham.**
  - `firebase.test.ts` (mock de `firebase/*` com `vi.mock`): `connects to emulators only when flag is true` → com `VITE_USE_EMULATORS: 'true'` e host `localhost`, `connectAuthEmulator` chamado com `'http://localhost:9099'`, `connectFirestoreEmulator(db,'localhost',8080)`, `connectStorageEmulator(storage,'localhost',9199)`, `connectFunctionsEmulator(functions,'localhost',5001)`; com `'false'` nenhum `connect*` chamado. `uses southamerica-east1 for functions` → `getFunctions(app,'southamerica-east1')`.
  - `App.test.tsx`: `renders app title` → texto `Cifras · Louvor`; `shows backend status from health` (com `callHealth` injetado via prop resolvendo `{status:'ok'}`) → `Servidor: ok`; `shows offline when health fails` → `Servidor: indisponível`.
- [ ] **Step 2:** Rodar `npm test -w @cifras/web` → FAIL.
- [ ] **Step 3:** Implementar. `App` recebe `callHealth: () => Promise<{status: string}>` por prop (default: `httpsCallable(functions,'health')` a partir de `createFirebase(import.meta.env)` em `main.tsx`). `.env.example` com os 7 campos e valores locais (`demo-church-cifras`, `VITE_USE_EMULATORS=true`, `VITE_EMULATOR_HOST=localhost`, apiKey `demo-key`). `vite.config.ts`: `server: { host: true, port: 5173, watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' } }`, Vitest `environment: 'jsdom'`, setup com `@testing-library/jest-dom`.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` (raiz) → verde.
- [ ] **Step 5: Commit** — `feat(web): add react shell connected to firebase emulators`.

---

### Task 3: Configuração do Firebase e testes de regras

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `tests/package.json` (workspace `@cifras/tests`), `tests/vitest.config.ts`, `tests/rules/firestore.rules.test.ts`, `tests/rules/storage.rules.test.ts`, `tests/config/firebase-json.test.ts`
- Modify: `package.json` (workspaces += `"tests"`; script `test:rules`)

**Interfaces:**
- Produces: `npm run test:rules` = `firebase emulators:exec --only firestore,storage --project demo-church-cifras "npm run test:rules -w @cifras/tests"`. `firebase.json` com `hosting.public = "apps/web/dist"` + rewrite `** → /index.html` + header `Cache-Control: public, max-age=31536000, immutable` para `/assets/**`; `functions.source = "apps/functions"`, `runtime: "nodejs22"`, `predeploy: ["npm run build -w @cifras/functions"]`; emulators com as portas das Global Constraints, `host: "0.0.0.0"` em cada um, `ui.enabled: true`, `singleProjectMode: true`. `.firebaserc`: `{"projects": {"default": "demo-church-cifras"}}`.

- [ ] **Step 1: Testes que falham.**
  - `firebase-json.test.ts` (lê o JSON, sem emulador): `firebase.json binds every emulator to 0.0.0.0`; `uses the agreed ports` (auth 9099, firestore 8080, storage 9199, functions 5001, ui 4000, hub 4400, logging 4500); `functions run on nodejs22 from apps/functions`; `hosting serves apps/web/dist as SPA`.
  - `firestore.rules.test.ts`: `denies unauthenticated read` e `denies authenticated write` em `anything/doc` (`assertFails`).
  - `storage.rules.test.ts`: `denies unauthenticated read` e `denies authenticated upload`.
- [ ] **Step 2:** `npm run test:rules` → FAIL (arquivos inexistentes). Requer Java 17+ e firebase-tools no host (firebase-tools como devDependency raiz; `npx firebase`).
- [ ] **Step 3:** Escrever configs e regras (`allow read, write: if false;` em ambos — a Fase 2 abre o necessário).
- [ ] **Step 4:** `npm run test:rules` → PASS; `npm test` (inclui `tests/config`) → PASS.
- [ ] **Step 5: Commit** — `chore(firebase): add emulator config and deny-all rules with tests`.

---

### Task 4: Docker Compose (ambiente local completo)

**Files:**
- Create: `docker/dev.Dockerfile`, `docker-compose.yml`, `.dockerignore`, `apps/web/.env.docker`
- Modify: `README.md` (seção "Rodar localmente"), `AGENTS.md` (`## Comandos`)

**Interfaces:**
- Consumes: scripts e portas das Tasks 1–3.
- Produces: `docker compose up` sobe `emulators`, `functions` (build watch) e `web`; dados persistidos em `./emulator-data`.

- [ ] **Step 1: Imagem.** `docker/dev.Dockerfile`: `FROM node:22-bookworm-slim`; instala `openjdk-17-jre-headless`; `WORKDIR /app`; copia `package.json`, `package-lock.json` e os `package.json` de cada workspace; `npm ci`. `firebase-tools` vem das devDependencies (usar `npx firebase`).
- [ ] **Step 2: Compose.** Serviços com `build: { context: ., dockerfile: docker/dev.Dockerfile }` e imagem `church-cifras-dev`; volumes `.:/app` + volumes anônimos `/app/node_modules`, `/app/apps/web/node_modules`, `/app/apps/functions/node_modules`, `/app/tests/node_modules`; `environment: CHOKIDAR_USEPOLLING=true`.
  - `functions`: `npm run build:watch -w @cifras/functions` (tsup `--watch` com polling).
  - `emulators`: `npx firebase emulators:start --project demo-church-cifras --import=./emulator-data --export-on-exit=./emulator-data`; portas 4000, 9099, 8080, 9199, 5001, 4400, 4500; `depends_on: functions`.
  - `web`: `npm run dev -w @cifras/web` com `env_file: apps/web/.env.docker` (mesmo conteúdo do `.env.example`); porta 5173; `depends_on: emulators`.
  - `.dockerignore`: `node_modules`, `**/node_modules`, `dist`, `lib`, `emulator-data`, `.git`, `.superpowers`, `fixtures/private`.
- [ ] **Step 3: Verificar.** Garantir Docker Desktop rodando. `docker compose up -d --build`; aguardar; `curl -s http://localhost:4000` → HTTP 200; `curl -s http://localhost:5173` → HTML com `<div id="root">`; `curl -s -X POST -H "Content-Type: application/json" -d '{"data":{}}' http://localhost:5001/demo-church-cifras/southamerica-east1/health` → JSON com `"status":"ok"`.
- [ ] **Step 4: Hot reload.** Alterar `buildHealth` para incluir um campo temporário, confirmar que o curl do Step 3 reflete em ≤ 30 s, reverter. Registrar no relatório.
- [ ] **Step 5:** `docker compose down`. Atualizar README ("Rodar localmente": pré-requisitos Docker Desktop; `docker compose up --build`; URLs: site 5173, Emulator UI 4000) e `AGENTS.md` `## Comandos` (docker, `npm test`, `npm run lint`, `npm run typecheck`, `npm run test:rules`, `npm run test:harness`).
- [ ] **Step 6: Commit** — `chore(docker): run web, functions and firebase emulators with compose`.

---

### Task 5: CI e deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `docs/deploy.md`

**Interfaces:**
- Consumes: scripts raiz.
- Produces: CI em `pull_request` para `develop` e `main` + `push` em `develop`; deploy em `push` para `main`.

- [ ] **Step 1: `ci.yml`.** `ubuntu-latest`; `actions/checkout`, `actions/setup-node` (`node-version-file: .nvmrc`, cache npm), `actions/setup-java` (temurin 17); `npm ci`; `npm run lint`; `npm run typecheck`; `npm test`; `npm run test:harness`; `npm run test:rules`; `npm run build`. Actions pinadas por versão maior estável (ex.: `@v4`).
- [ ] **Step 2: `deploy.yml`.** `on: push: branches: [main]` + `workflow_dispatch`; `concurrency: production`; passo inicial que verifica `vars.FIREBASE_PROJECT_ID` e `secrets.FIREBASE_SERVICE_ACCOUNT` via env e, se vazios, escreve `::notice::Deploy ignorado: configure FIREBASE_PROJECT_ID e FIREBASE_SERVICE_ACCOUNT (docs/deploy.md)` e encerra com sucesso (passos seguintes condicionados a uma saída `configured == 'true'`). Se configurado: mesmo setup do CI, `npm ci`, build do web com `VITE_FIREBASE_*` vindos de `vars` e `VITE_USE_EMULATORS=false`, `google-github-actions/auth` com `credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}`, `npx firebase deploy --only hosting,functions,firestore,storage --project ${{ vars.FIREBASE_PROJECT_ID }} --non-interactive --force`.
- [ ] **Step 3: `docs/deploy.md` (pt-BR).** Passo a passo: criar projeto Firebase; ativar plano Blaze; ativar Authentication (Google), Firestore (região `southamerica-east1`), Storage; criar app Web e copiar config para `vars` (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`) + `FIREBASE_PROJECT_ID`; criar service account com papéis Firebase Admin + Cloud Functions Admin + Service Account User e salvar o JSON em `secrets.FIREBASE_SERVICE_ACCOUNT`; definir `ADMIN_EMAILS` (usado na Fase 2).
- [ ] **Step 4: Validar sintaxe.** `npx --yes @action-validator/cli .github/workflows/ci.yml` e `deploy.yml` (ou `actionlint` se disponível) → sem erros.
- [ ] **Step 5: Commit** — `ci: add pull request checks and firebase deploy workflow`.

---

### Task 6: PR, revisão e merge (orquestrador)

- [ ] `npm ci && npm run lint && npm run typecheck && npm test && npm run test:harness && npm run test:rules && npm run build` → verde.
- [ ] `git push -u origin chore/monorepo-skeleton`; `gh pr create --base develop`.
- [ ] Aguardar CI verde (`gh pr checks <n> --watch`).
- [ ] Revisão do code-reviewer → correções → comentário de revisão no PR → `gh pr merge <n> --squash`.
