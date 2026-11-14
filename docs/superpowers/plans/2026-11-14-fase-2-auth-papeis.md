# Fase 2 — Login e papéis: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo acesso exige login com Google; quem entra pela primeira vez vira **visitante** (ou **admin** se o e-mail estiver em `ADMIN_EMAILS`); o admin muda papéis na tela **Pessoas**; as regras do Firestore/Storage garantem isso no backend.

**Architecture:** Papel guardado em dois lugares: custom claim `role` no token (lido pelas Security Rules) e `users/{uid}.role` (lido pela interface e pela tela Pessoas). Cloud Functions são o único escritor: `onUserCreated` (gatilho de Auth v1) cria o doc e o claim; `setUserRole` (callable, só admin) altera ambos. O site observa `users/{uid}` e força `getIdToken(true)` quando o papel muda. Lógica de decisão em funções puras testadas; handlers recebem dependências injetadas.

**Tech Stack:** firebase-functions 7.4.0 (`firebase-functions/v1` para o gatilho de Auth, v2 `onCall`), firebase-admin 14.5.1, React 19 + `react-router` (exato, última estável), Firebase JS SDK 13.3.0, Vitest + Testing Library, `@firebase/rules-unit-testing`.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§2 papéis, §6.5 `users`, §6.7, §6.8, §6.10 Pessoas)

## Global Constraints

- Papéis: `'viewer' | 'member' | 'admin'`; rótulos pt-BR: Visitante, Membro, Admin. Padrão no 1º login: `viewer`.
- `ADMIN_EMAILS`: lista separada por vírgula, comparação **sem diferenciar maiúsculas** e com `trim`. Param `defineString('ADMIN_EMAILS')`. Local: `apps/functions/.env.demo-church-cifras` **commitado** com `ADMIN_EMAILS=admin@cifras.local` (fictício). Produção: `vars.ADMIN_EMAILS` escrito pelo deploy em `apps/functions/.env.$FIREBASE_PROJECT_ID`.
- Functions na região `southamerica-east1`.
- Login: `signInWithPopup` com `GoogleAuthProvider` (redirect quebra no celular).
- Ninguém altera o **próprio** papel (evita admin se trancar fora).
- Leitura de qualquer dado: só autenticado. `users/{uid}`: o próprio usuário ou admin lê; **nenhuma escrita pelo cliente**.
- Identificadores em inglês; textos de UI em pt-BR; versões exatas; TS strict.
- Commits Conventional + `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git add <caminhos>` e `git commit` separados.

## Review Focus

1. **Claim ausente logo após o 1º login** (o gatilho roda depois do login): a UI deve tratar `role` indefinido como `viewer` e atualizar sozinha quando o doc aparecer — teste `treats missing role as viewer and refreshes token when users doc changes` (Task 3).
2. **E-mail de admin com maiúsculas/espaços** (`" Admin@Cifras.local "`) — teste `matches admin emails case-insensitively` (Task 1).
3. **Admin tentando mudar o próprio papel** pela API, mesmo com a UI desabilitada — teste `rejects changing own role` (Task 1).
4. **Usuário mexendo no próprio doc `users` pelo console do navegador** para virar admin — teste de regra `denies user writing own users doc` (Task 2).
5. **Variável de ambiente faltando no build** (site em branco sem explicação) — teste `throws listing every missing env key` (Task 3).

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/functions/src/roles.ts` | `Role`, `ROLES`, `parseAdminEmails`, `roleForNewUser`, `validateRoleChange` (puros) |
| `apps/functions/src/users.ts` | `createUserProfile(deps, user)`, `changeUserRole(deps, request)` (handlers com deps injetadas) |
| `apps/functions/src/index.ts` | Exporta `health`, `onUserCreated`, `setUserRole` ligando deps reais (admin SDK) |
| `apps/functions/.env.demo-church-cifras` | `ADMIN_EMAILS` local fictício |
| `firestore.rules`, `storage.rules` | Regras da fase |
| `tests/rules/*.test.ts` | Testes de regras com controles positivos |
| `apps/web/src/lib/env.ts` | `readWebEnv(raw): WebEnv` |
| `apps/web/src/auth/AuthProvider.tsx`, `useAuth.ts` | Sessão, papel, signIn/signOut |
| `apps/web/src/routes/*` | `LoginPage`, `HomePage`, `PeoplePage`, `RequireAuth`, `RequireRole` |
| `apps/web/src/ui/AppShell.tsx`, `styles.css` | Cabeçalho e tokens visuais |
| `apps/web/src/people/peopleApi.ts` | `listUsers`, `setUserRole` (Firestore + callable) |

---

### Task 1: Papéis nas Functions

**Files:**
- Create: `apps/functions/src/roles.ts`, `apps/functions/src/users.ts`, `apps/functions/.env.demo-church-cifras`
- Modify: `apps/functions/src/index.ts`, `.gitignore` (adicionar `!apps/functions/.env.demo-church-cifras` depois de `.env.*`)
- Test: `apps/functions/src/roles.test.ts`, `apps/functions/src/users.test.ts`

**Interfaces:**
- Produces:
  - `type Role = 'viewer' | 'member' | 'admin'`; `ROLES: readonly Role[]`.
  - `parseAdminEmails(raw: string | undefined): string[]` (lowercase, trim, sem vazios).
  - `roleForNewUser(email: string | undefined, adminEmails: string[]): Role`.
  - `validateRoleChange(input: { callerUid: string | undefined; callerRole: unknown; targetUid: unknown; newRole: unknown }): { ok: true; targetUid: string; newRole: Role } | { ok: false; code: 'unauthenticated' | 'permission-denied' | 'invalid-argument' | 'failed-precondition'; message: string }`.
  - `UserDeps = { setClaims(uid: string, claims: { role: Role }): Promise<void>; writeUser(uid: string, data: Record<string, unknown>, merge: boolean): Promise<void>; userExists(uid: string): Promise<boolean>; now(): Date }`.
  - `createUserProfile(deps: UserDeps, user: { uid: string; email?: string; displayName?: string; photoURL?: string }, adminEmails: string[]): Promise<Role>` — grava `users/{uid}` `{ displayName, email, photoURL, role, createdAt }` e o claim.
  - `changeUserRole(deps: UserDeps, input: Parameters<typeof validateRoleChange>[0]): Promise<{ uid: string; role: Role }>` — lança `HttpsError(code, message)` quando inválido; grava claim + `{ role, roleUpdatedAt }` (merge).
  - Exports: `onUserCreated` = `functions.region('southamerica-east1').auth.user().onCreate(...)` (v1); `setUserRole` = `onCall({ region: 'southamerica-east1' }, ...)`.

- [ ] **Step 1: Testes que falham** (`roles.test.ts`):
  - `parses admin emails trimming and lowercasing` — `parseAdminEmails(' A@x.com, ,b@Y.com ')` → `['a@x.com','b@y.com']`; `undefined` → `[]`.
  - `matches admin emails case-insensitively` — `roleForNewUser(' Admin@Cifras.local ', ['admin@cifras.local'])` → `'admin'`; outro e-mail → `'viewer'`; `undefined` → `'viewer'`.
  - `rejects unauthenticated caller` → code `unauthenticated`.
  - `rejects non-admin caller` (callerRole `'member'`) → `permission-denied`.
  - `rejects changing own role` (callerUid === targetUid) → `failed-precondition`.
  - `rejects unknown role` (`'owner'`) and non-string target → `invalid-argument`.
  - `accepts admin changing another user` → `{ ok: true, targetUid: 'u2', newRole: 'member' }`.
- [ ] **Step 2: Testes que falham** (`users.test.ts`, deps falsas gravando chamadas):
  - `creates viewer profile and claim` — grava `users/u1` com `role:'viewer'`, `createdAt` = `now()`, e `setClaims('u1',{role:'viewer'})`.
  - `creates admin profile for admin email`.
  - `changeUserRole sets claim and merges role` — grava `{ role:'member', roleUpdatedAt }` com `merge: true`.
  - `changeUserRole throws HttpsError with validation code` — `permission-denied`.
  - `changeUserRole fails when target user does not exist` → `not-found` (usa `userExists`).
- [ ] **Step 3:** `npm test -w @cifras/functions` → FAIL.
- [ ] **Step 4:** Implementar; em `index.ts` ligar deps reais (`getAuth().setCustomUserClaims`, `getFirestore().doc('users/'+uid).set(data,{merge})`, `.get().exists`) e o param `defineString('ADMIN_EMAILS')` (`.value()` dentro do handler). Criar `apps/functions/.env.demo-church-cifras` com `ADMIN_EMAILS=admin@cifras.local` e a negação no `.gitignore`.
- [ ] **Step 5:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build -w @cifras/functions` → verde; `git check-ignore apps/functions/.env.demo-church-cifras` → nada (não ignorado).
- [ ] **Step 6: Commit** — `feat(functions): create user profiles and manage roles`.

---

### Task 2: Regras do Firestore e Storage

**Files:**
- Modify: `firestore.rules`, `storage.rules`, `tests/rules/firestore.rules.test.ts`, `tests/rules/storage.rules.test.ts`

**Interfaces:**
- Produces: `users/{uid}`: read se `request.auth.uid == uid` ou `role == 'admin'`; write `false`. `artists/{id}`, `songs/{id}`, `songs/{id}/arrangements/{key}`: read se autenticado; write `false` (Fase 4 abre). Demais caminhos: negado. Storage `songs/{allPaths=**}`: read se autenticado; write `false` (Fase 4). Função `role()` = `request.auth.token.role` com padrão `'viewer'` quando ausente.

- [ ] **Step 1: Testes que falham** (semear dados com `withSecurityRulesDisabled`):
  - Firestore: `allows user to read own users doc`, `denies user reading another users doc`, `allows admin to read any users doc` (`authenticatedContext('a1',{role:'admin'})`), `denies user writing own users doc` (inclusive `{role:'admin'}`), `denies admin writing users doc from client`, `allows signed-in read of songs, arrangements and artists`, `denies unauthenticated read of songs`, `denies client writes to songs`, `denies access to unknown collections`.
  - Storage: `allows signed-in read under songs/`, `denies unauthenticated read under songs/`, `denies uploads` (até a Fase 4), `denies reads outside songs/`.
- [ ] **Step 2:** `npm run test:rules` → FAIL.
- [ ] **Step 3:** Escrever as regras.
- [ ] **Step 4:** `npm run test:rules` → PASS.
- [ ] **Step 5: Commit** — `feat(rules): restrict reads to signed-in users and users docs to owner or admin`.

---

### Task 3: Sessão, login e rotas no site

**Files:**
- Create: `apps/web/src/lib/env.ts`, `apps/web/src/auth/{AuthProvider.tsx,useAuth.ts,roles.ts}`, `apps/web/src/routes/{LoginPage.tsx,HomePage.tsx,RequireAuth.tsx,RequireRole.tsx}`, `apps/web/src/ui/{AppShell.tsx,styles.css}`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/App.tsx` (vira o roteador; remove a checagem de saúde da tela), `apps/web/src/App.test.tsx`
- Test: `apps/web/src/lib/env.test.ts`, `apps/web/src/auth/AuthProvider.test.tsx`, `apps/web/src/routes/routes.test.tsx`

**Interfaces:**
- Consumes: `createFirebase` (Fase 1); `users/{uid}` com `role` (Task 1).
- Produces:
  - `readWebEnv(raw: Record<string, string | undefined>): WebEnv` — lança `Error('Configuração ausente: <KEY1>, <KEY2>')` listando todas as chaves `VITE_*` ausentes ou vazias.
  - `type Role = 'viewer' | 'member' | 'admin'`; `ROLE_LABELS: Record<Role,string>` = Visitante/Membro/Admin; `canEdit(role)` (member|admin); `isAdmin(role)`.
  - `AuthGateway` (injetável, para testes): `{ onUser(cb: (u: SessionUser | null) => void): () => void; onUserDoc(uid: string, cb: (role: Role | undefined) => void): () => void; refreshToken(): Promise<void>; signIn(): Promise<void>; signOut(): Promise<void> }` com `SessionUser = { uid: string; displayName: string | null; email: string | null; photoURL: string | null }`; implementação real `createAuthGateway(services)` usando `onAuthStateChanged`, `onSnapshot(doc(db,'users',uid))`, `getIdToken(user,true)`, `signInWithPopup(auth,new GoogleAuthProvider())`, `signOut`.
  - `AuthProvider({ gateway, children })` + `useAuth(): { status: 'loading' | 'signed-out' | 'signed-in'; user: SessionUser | null; role: Role; signIn(): Promise<void>; signOut(): Promise<void> }` — `role` é `'viewer'` enquanto o doc não tem papel.
  - Rotas: `/login` (pública; redireciona para `/` se logado), `/` (Início, exige login), `/pessoas` (exige `admin`; outros → `/`).
  - `App({ gateway })` monta `AuthProvider` + `BrowserRouter`; testes usam `MemoryRouter` via prop `initialPath?: string`.

- [ ] **Step 1: Testes que falham.**
  - `env.test.ts`: `returns typed env when complete`; `throws listing every missing env key` (faltando `VITE_FIREBASE_API_KEY` e `VITE_FIREBASE_APP_ID` → mensagem contém as duas).
  - `AuthProvider.test.tsx` (gateway falso controlável): `starts loading then signed-out`; `treats missing role as viewer and refreshes token when users doc changes` (doc sem role → `viewer`; doc passa a `member` → `role` = `member` e `refreshToken` chamado 1×); `signs out`.
  - `routes.test.tsx`: `redirects signed-out user to login` (texto `Entrar com Google`); `login button calls signIn`; `shows home for signed-in viewer without Pessoas link`; `shows Pessoas link for admin`; `redirects non-admin away from /pessoas`; `header shows role label and Sair`.
- [ ] **Step 2:** `npm test -w @cifras/web` → FAIL.
- [ ] **Step 3:** Implementar. Visual (spec §6.10, mockups): `styles.css` com tokens em `:root` — `--color-accent: #4f46e5`, `--color-bg: #f2f2f4`, `--color-surface: #ffffff`, `--color-text: #111111`, `--color-muted: #666666`, `--color-success: #167a4f`, `--radius: 10px`, fonte `system-ui`; mobile-first, largura máxima 960px. Login: título `Cifras · Louvor`, subtítulo `Acervo de cifras do ministério de louvor`, botão `Entrar com Google`, mensagem de erro `Não foi possível entrar. Tente de novo.` Cabeçalho: título, link `Pessoas` (admin), iniciais/nome, rótulo do papel, botão `Sair`. Início: `Olá, <primeiro nome>` e `A busca de cifras chega em breve.` `main.tsx`: `readWebEnv(import.meta.env)`; se lançar, renderizar a mensagem de erro em vez do app.
- [ ] **Step 4:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` → verde; sem warnings de `act()`.
- [ ] **Step 5: Commit** — `feat(web): add google sign-in, session roles and protected routes`.

---

### Task 4: Tela Pessoas

**Files:**
- Create: `apps/web/src/people/{peopleApi.ts,PeoplePage.tsx}`
- Modify: rota `/pessoas` (Task 3) passa a renderizar `PeoplePage`
- Test: `apps/web/src/people/PeoplePage.test.tsx`

**Interfaces:**
- Consumes: `setUserRole` callable (Task 1); `useAuth` (Task 3).
- Produces: `PeopleApi = { listUsers(): Promise<PersonRow[]>; setRole(uid: string, role: Role): Promise<void> }` com `PersonRow = { uid: string; displayName: string; email: string; role: Role }`; `createPeopleApi(services)` (Firestore `getDocs(query(collection(db,'users'), orderBy('displayName')))` + `httpsCallable(functions,'setUserRole')`); `PeoplePage({ api })`.

- [ ] **Step 1: Testes que falham** (`PeopleApi` falsa):
  - `lists people with role labels` (Nome, E-mail mascarado `k•••@gmail.com`, seletor com `Visitante/Membro/Admin`).
  - `disables role select on own row and marks it (você)`.
  - `changes role and shows confirmation` → `setRole('u2','member')` e texto `Papel atualizado`.
  - `shows error and restores previous role when change fails` → texto `Não foi possível alterar o papel.` e seletor volta ao valor anterior.
  - `shows empty state` → `Ninguém entrou ainda.`
- [ ] **Step 2:** FAIL. **Step 3:** Implementar (tabela no computador, lista em cards no celular via CSS). **Step 4:** `npm test`, lint, typecheck, build → verde.
- [ ] **Step 5: Commit** — `feat(web): add people page for admins to manage roles`.

---

### Task 5: Deploy, docs e verificação no Docker

**Files:**
- Modify: `.github/workflows/deploy.yml`, `docs/deploy.md`, `README.md`

- [ ] **Step 1: Deploy.** Incluir `ADMIN_EMAILS` (var) nas exigências da etapa de checagem (nenhum → aviso e pula; parcial → erro). Antes do deploy: `printf 'ADMIN_EMAILS=%s\n' "$ADMIN_EMAILS" > "apps/functions/.env.$FIREBASE_PROJECT_ID"` (via `env:`). Validar com actionlint (Docker).
- [ ] **Step 2: Docs.** `docs/deploy.md`: `ADMIN_EMAILS` como variável do repositório (vírgulas); texto do aviso de "não configurado" igual ao do workflow e que configuração parcial falha; nota: bucket em `southamerica-east1` fica fora da cota gratuita do Storage (custo irrisório para PDFs). README: "Testar login localmente": no popup do emulador escolha **Add new account** e use `admin@cifras.local` para virar admin; qualquer outro e-mail entra como Visitante.
- [ ] **Step 3: Verificar no Docker.** `docker compose up -d --build`; criar usuário admin pelo Auth emulator (`POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key` com `admin@cifras.local`) e um visitante; após ~5 s ler `http://localhost:8080/v1/projects/demo-church-cifras/databases/(default)/documents/users/<uid>` com header `Authorization: Bearer owner` → `role` `admin` / `viewer`; `accounts:lookup` (com `Authorization: Bearer owner`) → `customAttributes` contém `"role":"admin"`. Abrir `http://localhost:5173` → tela de login renderiza. `docker compose down`. Registrar saídas no relatório.
- [ ] **Step 4: Commit** — `chore(deploy): pass admin emails to functions and document local login`.

---

### Task 6: PR, revisão e merge (orquestrador)

- [ ] Checks locais completos (lint, typecheck, test, test:harness, test:rules, build, format:check).
- [ ] `git push -u origin feat/auth-roles`; `gh pr create --base develop`; CI verde.
- [ ] Revisão final (code-reviewer) → correções → comentário no PR → `gh pr merge <n> --squash`.
