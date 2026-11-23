# Visitante sem acesso (#126) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitante (papel padrão, claim `role` ausente ou `viewer`) não lê mais nada: vê só a tela "Acesso ainda não liberado", e as Rules do Firestore e do Storage barram a leitura de quem não é membro ou admin.

**Architecture:** As Rules passam a exigir `isEditor()` em toda leitura que hoje exige só `signedIn()`, exceto `users/{uid}` (cada pessoa lê o próprio doc, o que o AuthProvider precisa). No cliente, o `AuthProvider` lê o claim `role` do token (a mesma fonte das Rules) e expõe `access` (`checking` | `blocked` | `granted`). Um layout route `RequireAccess`, entre `RequireAuth` e os provedores de dados, troca tudo por `AccessPending` quando o acesso não está liberado, em qualquer URL, sem montar nenhum provedor, listener ou rota de dados.

**Tech Stack:** React 19 + react-router (BrowserRouter/MemoryRouter), Firebase Auth/Firestore/Storage, Security Rules com `@firebase/rules-unit-testing` e Vitest, Playwright (E2E), CSS com tokens de `ui/styles.css`.

**Spec:** `docs/superpowers/specs/2026-11-13-church-cifras-design.md` (§5 a §9 e §11) e `docs/superpowers/specs/2026-11-20-sdlc-agentes-design.md`. Critérios de aceite e decisões: Análise Agêntica da issue #126 (critérios 1 a 9).

## Global Constraints

- Textos de UI exatos (pt-BR): título "Acesso ainda não liberado"; corpo "Peça a um admin do ministério para liberar a sua conta. Depois que ele liberar, é só entrar de novo."; rótulo do cartão "Conta"; botão "Sair"; nota do login "Quem entra pela primeira vez precisa da liberação de um admin do ministério para ver as cifras."
- Nenhum `#hex` nem `rgb()` novo em CSS; só tokens de `ui/styles.css` (ver "Tokens usados" na Task 4).
- Nenhum token novo: o desenho usa `--color-accent-soft`, `--color-accent`, `--color-surface`, `--color-elevated`, `--color-border`, `--color-border-strong`, `--color-muted`, `--color-text`.
- Tela de acesso só no tema escuro no Paper (decisão da issue); no código ela usa tokens e funciona nos dois temas.
- Texto de UI e docs em pt-BR; identificadores em inglês; commits em Conventional Commits em inglês.
- Subagentes não commitam nem fazem push: cada task termina com "Ponto de commit (orquestrador)", com a mensagem sugerida.
- Não tocar em `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`.
- `test:rules` roda os emuladores de Firestore (8080) e Storage (9199): não rodar duas vezes ao mesmo tempo. No Windows sem Java: `docker compose run --rm --no-deps emulators npm run test:rules`.
- Functions usam `firebase-admin` (Admin SDK): ignoram Rules. Nenhuma Function muda por esta entrega.

## Review Focus

1. Usuário sem claim `role` no token (conta nova ou token antigo) lê alguma coleção ou caminho: deve ser negado. Teste de Rules sem claim em Firestore e Storage (Tasks 1 e 2) e em App (Task 5).
2. Admin libera o visitante com a tela aberta: o gate deve liberar sem recarregar, pela renovação do token. Teste no AuthProvider (Task 3) e no E2E (Task 8).
3. Membro é rebaixado para visitante com o app aberto: os provedores desmontam e a tela de acesso aparece. Teste no AuthProvider e no App (Tasks 3 e 5).
4. Link direto (`/musicas/<id>`, `/pessoas`, `/repertorios/<id>`) de visitante: mostra a tela, não monta `ViewerRoute` nem o provedor de dados. Teste em routes (Task 5).
5. Falha ao ler o claim (token ou rede): o cliente não libera os dados. Decisão: `access` vira `blocked`, com a tela. Teste no AuthProvider (Task 3).

## Decisões deste plano

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Fonte do papel no cliente para o gate | Claim do token (`getClaimRole`), não o doc `users/{uid}` | As Rules leem o token. Com o doc, um membro recém-liberado podia montar os listeners com o token antigo e tomar `permission-denied` sem nova tentativa |
| `AuthState.role` | Continua vindo do doc (rótulos e menus, como hoje) | Mudança mínima; o gate é que usa o claim |
| Leitura do próprio `users/{uid}` | Continua `signedIn()` | O AuthProvider lê o papel do doc logo após o login |
| Onde fica a barreira | Layout route `RequireAccess` entre `RequireAuth` e os provedores | Os provedores e as rotas de dados só montam depois do gate: zero listener para visitante |
| Liberação com a tela aberta | Automática: o listener do doc segue ativo na tela, `syncClaim` renova o token, o claim muda e o gate libera | Não exige código extra; o texto "é só entrar de novo" continua verdadeiro como fallback (ver Lacunas, item 2) |
| URL de visitante | Mostra a tela na própria URL, sem `Navigate` | Critério 1: "o link direto cai na tela" |
| Push | `PushProvider` só revalida com `access === 'granted'` | Mesmo critério do resto do app |
| Prefetch de `ViewerRoute` (`main.tsx`) | Mantido | Só baixa o JS da rota; não chama Firestore nem Storage (critério 8 fala de dados) |

## Mapa de critérios

| Critério (issue #126) | Tasks |
| --- | --- |
| 1 Visitante vê só a tela; qualquer rota cai nela | 4, 5, 8 |
| 2 Membro e admin seguem como hoje | 5, 8 |
| 3 Rules do Firestore: leituras exigem `isEditor()` | 1 |
| 4 Rules do Storage: `songs/` e `pads/` exigem `isEditor()` | 2 |
| 5 Sem escrita de visitante; `test:rules` com matriz | 1, 2 |
| 6 Admin libera; visitante entra de novo e vê o app | 3, 5, 8 |
| 7 Nota do login coerente | 5 |
| 8 Nenhuma chamada a Firestore/Storage antes da tela | 3, 5, 8 |
| 9 Docs e Paper atualizados | 6, 7 |

## Grupos e ordem

| Grupo | Tasks | Dono | Arquivos (não se repetem entre tasks paralelas) |
| --- | --- | --- | --- |
| A (paralelo) | 0 Paper de referência; 1 Rules Firestore; 2 Rules Storage; 3 AuthProvider | designer; backend-dev; backend-dev; frontend-dev | Task 0: só Paper. Task 1: `firestore.rules`, `tests/rules/firestore.rules.test.ts`, `tests/rules/setlists.rules.test.ts`, `tests/rules/push.rules.test.ts`, `tests/rules/acesso.rules.test.ts` (novo). Task 2: `storage.rules`, `tests/rules/storage.rules.test.ts`. Task 3: `apps/web/src/auth/*`, `apps/web/src/push/PushProvider*`, e os testes com `AuthContext.Provider` (lista pelo `typecheck`) |
| B | 4 Tela e gate | frontend-dev | `apps/web/src/routes/AccessPending*`, `apps/web/src/routes/RequireAccess*`, `apps/web/src/ui/redesign-access*`, `apps/web/src/main.tsx` (uma linha), `apps/web/src/ui/themeTokens.test.ts` (uma linha) |
| C | 5 Ligação no App e login | frontend-dev | `apps/web/src/App.tsx`, `apps/web/src/App*.test.tsx`, `apps/web/src/routes/routes.test.tsx`, `apps/web/src/routes/LoginPage.tsx` |
| D (paralelo) | 6 Docs; 7 Paper final; 8 E2E | frontend-dev; designer; qa | Task 6: `docs/sistema.md`, `docs/design-system.md`, `docs/deploy.md`. Task 7: só Paper. Task 8: `e2e/**` |

Ordem: A → B → C → D. Dentro do grupo A, as tasks 1 e 2 rodam `test:rules` e não devem rodar ao mesmo tempo (emuladores); a 3 pode rodar em paralelo com elas.

Nota de dono: a Task 0 e a Task 7 são do `designer` e a Task 8 é do `qa` (etapa 5 do roteiro, AGENTS.md §Fluxo, tabela de agentes). Fora da divisão só backend/frontend pedida; confirmar com o orquestrador (Lacunas, item 3).

---

### Task 0: Valores do Paper para a tela de acesso (designer)

**Files:** nenhum arquivo do repositório. Leitura do Paper (artboard `31 · Visitante sem acesso`, escuro).

**Interfaces:**
- Consumes: o artboard já desenhado (issue #126, seção Design).
- Produces: para a Task 4, valores exatos (via `get_jsx`/`get_computed_styles`, não por screenshot) de: tamanho do bloco do ícone (64 px), tamanho do ícone interno, espessura da borda do ícone (âmbar), padding lateral da tela, distância entre título, texto, cartão e botão, altura e raio do cartão (18 px), altura do botão Sair (54 px) e raio pílula, tamanhos de fonte e pesos já listados na issue (30/800/-0,02em; 15 muted; 11 caixa alta; 15/600).

- [ ] **Step 1: Ler o artboard e registrar os valores**

Chamar `get_guide` (`paper-mcp-instructions`), `get_font_family_info` e `get_jsx` do artboard `31 · Visitante sem acesso`. Montar uma lista com nome do elemento, propriedade e valor, e devolvê-la ao orquestrador junto com a Task 4.

Expected: lista completa dos valores das propriedades usadas na Task 4 (sem medir em screenshot).

- [ ] **Step 2: Confirmar o nome do artboard**

Confirmar se o nome final é `31 · Visitante sem acesso` ou outro número livre (ver Lacunas, item 1).

Ponto de commit: nenhum (Paper não entra no git).

---

### Task 1: Security Rules do Firestore (backend-dev)

**Files:**
- Modify: `firestore.rules` (linhas 141 a 179: regras de `artists`, `songs`, `arrangements`, `songLyrics` e `setlists`)
- Modify: `tests/rules/firestore.rules.test.ts` (linhas 112 a 122 e 486 a 497)
- Modify: `tests/rules/setlists.rules.test.ts` (bloco `describe('read')`, linhas 92 a 104)
- Modify: `tests/rules/push.rules.test.ts` (bloco "controle positivo", linhas 65 a 73)
- Create: `tests/rules/acesso.rules.test.ts` (matriz por caminho e por papel)

**Interfaces:**
- Consumes: `isEditor()` já existe em `firestore.rules` (linha 13). Não mudar `signedIn()`, `role()`, `validSong`, `validSetlist`, `validRehearsal`.
- Produces: leitura de `songs`, `songs/{id}/arrangements/{slug}`, `songLyrics/{id}`, `setlists/{id}` e `artists/{id}` só com `isEditor()`. `users/{uid}` inalterado. Escrita inalterada.

- [ ] **Step 1: Escrever a matriz de testes (antes da regra)**

Criar `tests/rules/acesso.rules.test.ts` com `describe('acesso por papel (#126)')`. Seed com `withSecurityRulesDisabled`: `songs/s1`, `songs/s1/arrangements/a1`, `songLyrics/s1`, `artists/ar1`, `setlists/n1` (com os campos de `setlistData` de `setlists.rules.test.ts`), e `users/vis` (own doc). Contextos:
- `visitante sem claim`: `env.authenticatedContext('vis')`
- `visitante viewer`: `env.authenticatedContext('vis', { role: 'viewer' })`
- `membro`: `env.authenticatedContext('m1', { role: 'member' })`
- `admin`: `env.authenticatedContext('a1', { role: 'admin' })`
- `deslogado`: `env.unauthenticatedContext()`

Para cada caminho (`getDoc`) e cada lista (`getDocs` de `collection(db,'songs')`, `collection(db,'artists')`, e `query(collection(db,'setlists'), where('expiresAt','>', Timestamp.fromDate(new Date())))`), `it.each` com:
- visitante sem claim e visitante viewer: `assertFails`
- membro e admin: `assertSucceeds`
- deslogado: `assertFails`

Em `users/vis`: visitante lê o próprio doc com `assertSucceeds` (é o que o AuthProvider usa).

Expected antes da regra: os casos de visitante falham em `assertFails` (a regra atual deixa passar).

- [ ] **Step 2: Atualizar os testes que assumiam leitura de visitante**

- `firestore.rules.test.ts`, `'allows signed-in read of songs, arrangements and artists'`: trocar `authenticatedContext('u1')` por `authenticatedContext('m1', { role: 'member' })` e renomear para `'allows member read of songs, arrangements and artists'`.
- `firestore.rules.test.ts`, `'signed-in reads songLyrics'`: idem, com membro; renomear para `'member reads songLyrics'`.
- `setlists.rules.test.ts`, `describe('read')`: `it.each` só com `member` e `admin`; acrescentar `it('denies viewer', ...)` usando `viewerDb()` e `assertFails(getDoc(existing(viewerDb())))`.
- `push.rules.test.ts`, bloco "controle positivo": `it.each(['member', 'admin'] as const)` (renomear o describe para "controle positivo: membro e admin leem songs"); acrescentar `it('nega leitura de songs para viewer', ...)`.

Expected: a suíte de Rules ainda falha só nos casos novos de visitante (regra não mudou).

- [ ] **Step 3: Rodar `test:rules` e confirmar o vermelho**

Run: `npm run test:rules` (Windows sem Java: `docker compose run --rm --no-deps emulators npm run test:rules`)
Expected: FAIL nos casos "visitante ... denied" (`artists`, `songs`, `arrangements`, `songLyrics`, `setlists`, listas); os demais passam.

- [ ] **Step 4: Trocar a regra de leitura**

Em `firestore.rules`, nas regras de `artists/{id}`, `songs/{songId}`, `songs/{songId}/arrangements/{slug}`, `songLyrics/{songId}` e `setlists/{setlistId}`, trocar cada `allow read: if signedIn();` por:

```
      allow read: if isEditor();
```

Não tocar em `match /users/{uid}` (linha 137) nem no catch-all (`match /{document=**}`).

Expected: `artists` tem `allow read: if isEditor();` e `allow write: if false;` (a regra continua fechada para escrita).

- [ ] **Step 5: Rodar `test:rules` e confirmar o verde**

Run: `npm run test:rules`
Expected: todos os testes passam, inclusive a criação de música e de letra por membro (`'allows member to create song with arrangement in one batch'`, `'member creates songLyrics together with the song'`): `existsAfter`/`get` nas regras de escrita não passam pela regra de leitura. Se algum desses falhar, parar e reportar.

Ponto de commit (orquestrador): `fix(rules): restrict Firestore reads to members and admins (#126)`

---

### Task 2: Security Rules do Storage (backend-dev)

**Files:**
- Modify: `storage.rules` (linhas 9 a 12 e 25 a 28)
- Modify: `tests/rules/storage.rules.test.ts`

**Interfaces:**
- Consumes: `isEditor()` (linha 5 de `storage.rules`).
- Produces: leitura de `songs/**` e `pads/{version}/{fileName}` só com `isEditor()`. Escrita inalterada (criação de PDF por membro/admin; nada em `pads/`).

- [ ] **Step 1: Atualizar e ampliar os testes (antes da regra)**

Em `storage.rules.test.ts`:
- `'allows signed-in read under songs/'` (role viewer): trocar para `'allows member read under songs/'` com `authenticatedContext('m1', { role: 'member' })`.
- Acrescentar `'denies viewer read under songs/'` (`role: 'viewer'`) e `'denies read under songs/ without role claim'` (`authenticatedContext('u1')`), com `assertFails(getBytes(...))`.
- `'allows signed-in viewer to read pads/'`: trocar para `'allows member read pads/'` (role member); acrescentar `'denies viewer read pads/'` e `'denies read pads/ without role claim'`.
- `'denies signed-in read of the old flat pads/ path'`: trocar o contexto para `role: 'member'`, para que o teste prove o caminho e não o papel.
- Manter `'denies unauthenticated read under songs/'` e `'denies unauthenticated read under pads/'`.
- Matriz de escrita: para visitante sem claim e viewer, `uploadBytes` em `songs/s1/...pdf` continua `assertFails` (já existe em `'denies viewer upload'`; acrescentar o caso sem claim).

Expected: os novos casos de visitante em leitura falham antes da regra.

- [ ] **Step 2: Rodar `test:rules` e confirmar o vermelho**

Run: `npm run test:rules` (não em paralelo com a Task 1)
Expected: FAIL só nos casos de leitura de visitante em `songs/` e `pads/`.

- [ ] **Step 3: Trocar as duas regras de leitura**

Em `storage.rules`:

```
    match /songs/{allPaths=**} {
      allow read: if isEditor();
      allow update, delete: if false;
    }
```

```
    match /pads/{version}/{fileName} {
      allow read: if isEditor();
      allow write: if false;
    }
```

Expected: a regra de criação em `songs/{songId}/{fileName}` e o catch-all não mudam.

- [ ] **Step 4: Rodar `test:rules` e confirmar o verde**

Run: `npm run test:rules`
Expected: tudo passa.

Ponto de commit (orquestrador): `fix(rules): restrict Storage reads of songs and pads to members and admins (#126)`

---

### Task 3: Claim do token e `access` no AuthProvider (frontend-dev)

**Files:**
- Modify: `apps/web/src/auth/useAuth.ts` (tipo `AuthState`)
- Modify: `apps/web/src/auth/AuthProvider.tsx`
- Modify: `apps/web/src/auth/AuthProvider.test.tsx`
- Modify: `apps/web/src/push/PushProvider.tsx` (uma linha de elegibilidade)
- Modify: `apps/web/src/push/PushProvider.test.tsx`
- Modify: os arquivos com `AuthContext.Provider` e literal de `AuthState` que o `typecheck` apontar (ver Step 5). Lista conhecida: `more/MaisPage.test.tsx`, `people/PeoplePage.test.tsx`, `routes/LoginPage.test.tsx`, `routes/RequireAuth.test.tsx`, `search/HarpaSection.test.tsx`, `search/HomePage.test.tsx`, `setlists/SetlistPage.pad.test.tsx`, `setlists/SetlistPage.test.tsx`, `viewer/ViewerBack.test.tsx`, `viewer/ViewerPage.manage.test.tsx`, `viewer/ViewerPage.pad.test.tsx`, `viewer/ViewerPage.setlist.test.tsx`, `viewer/ViewerPage.test.tsx`, `viewer/ViewerPage.transpose.test.tsx`.

**Interfaces:**
- Consumes: `gateway.getClaimRole(): Promise<Role | undefined>` e `gateway.refreshToken()` (já existem em `AuthGateway`). `canEdit(role)` de `auth/roles.ts`.
- Produces:
  - `export type AccessState = 'checking' | 'blocked' | 'granted';` em `useAuth.ts`
  - `AuthState` ganha `access: AccessState` (campo obrigatório). `role` e `status` não mudam de forma.
  - Regra: `access` é `'checking'` enquanto `status !== 'signed-in'` ou o claim não foi lido; `'granted'` se `canEdit(claimRole ?? 'viewer')`; senão `'blocked'`.

- [ ] **Step 1: Escrever os testes do AuthProvider (antes do código)**

Em `AuthProvider.test.tsx`, o gateway de teste precisa de `getClaimRole` controlável (já é). Acrescentar, com os helpers existentes do arquivo:
- `'access is checking until the claim is read'`: `getClaimRole` devolve uma Promise não resolvida; `access` é `checking`.
- `'viewer claim is blocked'`: claim `viewer`; `access` é `blocked`.
- `'member and admin claims are granted'`: `it.each(['member','admin'])`.
- `'missing claim is blocked'`: claim `undefined`.
- `'users doc says member but claim says viewer: refreshes token and grants'`: `getClaimRole` devolve `viewer` e depois de `refreshToken()` devolve `member`; doc emite `member`; `access` vai de `checking`/`blocked` para `granted` sem recarregar.
- `'demotion with app open turns blocked'`: depois de `granted`, claim muda para `viewer` e o doc emite `viewer` com refresh; `access` volta a `blocked`.
- `'failed claim read is blocked and warns'`: `getClaimRole` rejeita; `access` é `blocked`; `console.warn` chamado.

Expected: FAIL (campo `access` não existe).

- [ ] **Step 2: Escrever o teste do PushProvider**

Em `PushProvider.test.tsx`, acrescentar `'does not revalidate while access is not granted'`: `role: 'member'` com `access: 'blocked'` não chama `service.revalidate`. E `'revalidates with access granted and member role'`.

Expected: FAIL.

- [ ] **Step 3: Implementar o tipo e o estado**

Em `useAuth.ts`: exportar `AccessState` e acrescentar `access: AccessState;` em `AuthState`.

Em `AuthProvider.tsx`:
- Novo estado `claim: { loaded: boolean; role: Role | undefined }`, zerado (`loaded: false`) quando o `uid` muda.
- Um `useEffect` com dependências `[gateway, uid]` lê `gateway.getClaimRole()` e grava `{ loaded: true, role }`. Em erro: `console.warn('Falha ao ler o papel do token', error)` e `{ loaded: true, role: undefined }` (vira `blocked`).
- Em `syncClaim`, depois de `refreshToken()`, reler `getClaimRole()` e gravar no estado (se `active`). Manter a lógica atual de comparação.
- No `useMemo` de `value`: `access = status !== 'signed-in' || !claim.loaded ? 'checking' : canEdit(claim.role ?? 'viewer') ? 'granted' : 'blocked'`. Importar `canEdit` de `./roles`.
- `role` continua `doc.role ?? 'viewer'`.

Expected: o `AuthProvider.test.tsx` passa.

- [ ] **Step 4: PushProvider**

Em `PushProvider.tsx`: ler `access` de `useAuth()` e trocar `const eligible = canEdit(role);` por `const eligible = access === 'granted' && canEdit(role);`.

Run: `npm test -w @cifras/web -- PushProvider AuthProvider`
Expected: PASS.

- [ ] **Step 5: Corrigir os literais de `AuthState` nos testes**

Run: `npm run typecheck`
Expected: erros de propriedade `access` ausente nos arquivos da lista. Em cada literal de `AuthState` acrescentar `access: 'granted'` (os casos com `role: 'viewer'` também recebem `'granted'`: esses testes não testam o gate). Repetir até o `typecheck` passar.

- [ ] **Step 6: Rodar testes e lint**

Run: `npm test -w @cifras/web` e `npm run lint`
Expected: PASS.

Ponto de commit (orquestrador): `feat(auth): expose token-based access state (#126)`

---

### Task 4: Tela de acesso e guard `RequireAccess` (frontend-dev)

**Files:**
- Create: `apps/web/src/routes/AccessPending.tsx`
- Create: `apps/web/src/routes/AccessPending.test.tsx`
- Create: `apps/web/src/routes/RequireAccess.tsx`
- Create: `apps/web/src/routes/RequireAccess.test.tsx`
- Create: `apps/web/src/ui/redesign-access.css`
- Create: `apps/web/src/ui/redesign-access.test.ts`
- Modify: `apps/web/src/main.tsx` (acrescentar `import './ui/redesign-access.css';` junto dos outros `redesign-*.css`)
- Modify: `apps/web/src/ui/themeTokens.test.ts` (acrescentar `readFileSync(resolve(import.meta.dirname, 'redesign-access.css'), 'utf8')` à soma `redesignCss`)

**Interfaces:**
- Consumes: `useAuth()` com `user`, `signOut`, `access` (Task 3). Valores de `Paper` (Task 0).
- Produces:
  - `export function AccessPending(): JSX.Element` em `routes/AccessPending.tsx`
  - `export function RequireAccess(): JSX.Element` em `routes/RequireAccess.tsx` (layout route; renderiza `<Outlet />` quando `granted`)

**Tokens usados** (`redesign-access.css`, somente estes): `--color-accent-soft` (fundo do ícone), `--color-accent` (borda do ícone), `--color-surface` (cartão), `--color-border` (borda do cartão), `--color-elevated` (botão Sair), `--color-border-strong` (borda do botão), `--color-muted` (texto), `--color-text` (título e e-mail).

- [ ] **Step 1: Testes do componente (antes do código)**

`AccessPending.test.tsx` (com `AuthContext.Provider` e um `AuthState` com `access: 'blocked'`, `user` de `testUser`):
- `'shows the title as h1'`: `getByRole('heading', { level: 1, name: 'Acesso ainda não liberado' })`.
- `'explains who to ask'`: texto exato do Global Constraints.
- `'shows the account e-mail in the card'`: `getByText('Conta')` e `getByText('maria@example.com')`.
- `'signs out with the existing signOut'`: clique em "Sair" chama `signOut` uma vez.
- `'shows an alert when sign out fails'`: `signOut` rejeita; `role="alert"` com "Não foi possível sair. Tente de novo.".
- `'has no app navigation'`: `queryByRole('navigation')` é nulo.

`RequireAccess.test.tsx` (`MemoryRouter` com `<Route element={<RequireAccess />}><Route path="*" element={<p>app</p>} /></Route>`):
- `'checking shows the loading status'`: `role="status"` com "Carregando…"; "app" ausente.
- `'blocked renders the pending screen for any path'`: path `/musicas/s1`; heading da tela; "app" ausente.
- `'granted renders the child route'`: "app" presente.

`redesign-access.test.ts` (no padrão de `redesign-push.test.ts`): nenhum `#` seguido de hex e nenhum `rgb(` no arquivo; todo seletor começa com `.access-`.

Expected: FAIL (arquivos não existem).

- [ ] **Step 2: Implementar `AccessPending`**

Estrutura (classes com prefixo `access-`):

```tsx
<main className="access-screen">
  <span className="access-mark" aria-hidden="true">{/* svg cadeado 28 px, stroke="currentColor" */}</span>
  <h1 className="access-title">Acesso ainda não liberado</h1>
  <p className="access-text">Peça a um admin do ministério para liberar a sua conta. Depois que ele liberar, é só entrar de novo.</p>
  <div className="access-card">
    <span className="access-card-label">Conta</span>
    <span className="access-card-email">{user?.email ?? ''}</span>
  </div>
  <button type="button" className="access-exit" onClick={...} disabled={busy}>Sair</button>
  {failed && <p role="alert" className="error">Não foi possível sair. Tente de novo.</p>}
</main>
```

`onClick`: `setBusy(true)`; `signOut().catch(() => { setBusy(false); setFailed(true); })`. Usar `useAuth()` para `user` e `signOut`.

Expected: testes de `AccessPending` passam.

- [ ] **Step 3: Implementar `RequireAccess`**

```tsx
export function RequireAccess() {
  const { access } = useAuth();
  if (access === 'checking') return <p role="status" className="status">Carregando…</p>;
  if (access === 'blocked') return <AccessPending />;
  return <Outlet />;
}
```

Expected: testes de `RequireAccess` passam.

- [ ] **Step 4: CSS**

Em `redesign-access.css`, usar os tokens da lista e os valores de Task 0: ícone em bloco 64 px com fundo `--color-accent-soft` e borda `--color-accent`; título 30 px, peso 800, `letter-spacing: -0.02em`; texto 15 px em `--color-muted`; cartão com `--color-surface`, raio 18 px e borda `--color-border`; rótulo 11 px, caixa alta, `--color-muted`; e-mail 15 px, peso 600; botão Sair com altura 54 px, raio pílula, `--color-elevated` e borda `--color-border-strong`, texto `--color-text`; foco com `:focus-visible` em `--color-accent`. Centralizar a coluna. Nada de `#hex`.

Run: `npm test -w @cifras/web -- redesign-access themeTokens AccessPending RequireAccess`
Expected: PASS.

Ponto de commit (orquestrador): `feat(web): access pending screen and route guard (#126)`

---

### Task 5: Ligação no App e nota do login (frontend-dev)

**Files:**
- Modify: `apps/web/src/App.tsx` (rotas, linhas 65 a 151)
- Modify: `apps/web/src/App.test.tsx`, `apps/web/src/App.import.test.tsx`, `apps/web/src/App.upload.test.tsx`, `apps/web/src/App.uploadError.test.tsx`
- Modify: `apps/web/src/routes/routes.test.tsx`
- Modify: `apps/web/src/routes/LoginPage.tsx` (linha 60)

**Interfaces:**
- Consumes: `RequireAccess` (Task 4), `access` (Task 3).
- Produces: nenhuma interface nova; a árvore de rotas muda.

- [ ] **Step 1: Testes (antes do código)**

Em `routes.test.tsx`:
- `'login explains that access needs an admin release'`: substituir o teste atual de "começa como visitante" por `getByText('Quem entra pela primeira vez precisa da liberação de um admin do ministério para ver as cifras.')`.
- `it.each(['/', '/busca', '/pad', '/mais', '/musicas/s1', '/repertorios/r1', '/pessoas', '/nova', '/importar'])('visitor sees only the access screen at %s', ...)`: `setup(path, 'viewer')`; heading "Acesso ainda não liberado" visível; `queryByRole('navigation', { name: 'Principal' })` nulo.
- `'visitor does not start any data provider'`: `setup('/', 'viewer')`; o `fakeCatalogApi` e o `fakeSetlistApi` recebem `overrides` com `vi.fn` (ou `vi.spyOn`) nos métodos de listagem/assinatura; `expect(spy).not.toHaveBeenCalled()`. Usar os nomes reais dos métodos chamados por `SongsProvider` e `SetlistsProvider` (ver `catalog/catalogApi.ts` e `setlists/setlistApi.ts`).
- `'member is redirected to the app after the claim arrives'`: `gateway.claimRole = 'viewer'`; emitir `member` no doc; o `refreshToken` do fake muda o claim para `member`; a página de Início aparece.
- Os testes existentes que usam `setup(path, 'member' | 'admin')` seguem como estão.

Nos quatro `App*.test.tsx`: a `setup(role)` passa a definir `gateway.claimRole = role` antes de `emitRole(role)` (a leitura do claim é assíncrona: as funções `setup` ficam `async`, com `await act(async () => ...)`, e os testes que dependem da tela aguardam com `findBy*`). Testes que hoje esperam o app com papel `viewer` passam a esperar a tela de acesso, ou usam `member`.

Expected: FAIL nos casos novos (rotas ainda não protegidas).

- [ ] **Step 2: Árvore de rotas**

Em `App.tsx`, dentro de `<Route element={<RequireAuth />}>`, inserir um layout route `RequireAccess` que envolve o layout dos provedores:

```tsx
<Route element={<RequireAuth />}>
  <Route element={<RequireAccess />}>
    <Route
      element={
        <SongsProvider api={catalogApi}>
          ... (bloco atual sem alterações)
        </SongsProvider>
      }
    >
      ...rotas atuais...
    </Route>
  </Route>
</Route>
```

Importar `RequireAccess` de `./routes/RequireAccess`. Não tocar em `/login` nem no `path="*"`.

- [ ] **Step 3: Nota do login**

Em `LoginPage.tsx` linha 60, trocar o texto para `Quem entra pela primeira vez precisa da liberação de um admin do ministério para ver as cifras.`

Run: `npm test -w @cifras/web`
Expected: PASS, inclusive `routes.test.tsx`.

- [ ] **Step 4: Checagem de tipos e lint**

Run: `npm run typecheck` e `npm run lint`
Expected: PASS.

Ponto de commit (orquestrador): `feat(web): gate data routes behind access state (#126)`

---

### Task 6: Docs (frontend-dev)

**Files:**
- Modify: `docs/sistema.md` (hoje exatamente 300 linhas; o alvo é "até cerca de 300"; enxugar outras linhas para compensar o que entrar)
- Modify: `docs/design-system.md`
- Modify: `docs/deploy.md`

**Interfaces:** nenhuma.

- [ ] **Step 1: `docs/sistema.md`**

- Seção Telas: a linha do `/login` segue; as demais rotas passam de "logado" para "membro e admin"; acrescentar linha "Qualquer rota, visitante | Tela 'Acesso ainda não liberado' (e-mail e Sair)". Atualizar o parágrafo "Tudo fora de `/login` exige login (`RequireAuth`)" para "exige login e liberação (`RequireAccess`)".
- Seção Papéis: linha Visitante passa a "Nada: vê só a tela 'Acesso ainda não liberado'". Trocar "Só o provedor Google..., porque qualquer logado conta como leitor" por texto que diga que a leitura exige membro ou admin. Trocar "Pad e compartilhamento ... liberados a todos os papéis" por "a membro e admin".
- Seção Firestore: "Leitura: qualquer logado, exceto `users`" passa para "Leitura: membro e admin, exceto `users` (cada um lê o próprio; admin lê todos)". `artists/*` continua como está, com nota de que a regra existe mas é fechada na prática (ver Lacunas, item 7).
- Seção Storage: "logado" vira "membro e admin" nas linhas de `songs/` e `pads/`.
- Limites conhecidos: acrescentar o limite aceito de PDFs e pad em cache no aparelho de quem perdeu o acesso.
- Enxugar linhas para ficar em ~300.

- [ ] **Step 2: `docs/design-system.md`**

- §5: nova linha da tabela "**Tela de acesso pendente**" (escura; cadeado em bloco 64 px, título, texto, cartão com a conta, botão Sair; `AccessPending`, `RequireAccess`, `redesign-access.css`).
- §6: a linha "visitante só lê e baixa" passa a "visitante não vê nada além da tela de acesso pendente".
- §8: acrescentar `31 · Visitante sem acesso` (ou o número confirmado na Task 0); marcar como obsoletos `13 Repertório (visitante)` e `05b Mais (membro/visitante)` se o designer confirmar (Lacunas, item 1). A frase "somente leitura para visitante" da seção §5 (Estados obrigatórios) sai.

- [ ] **Step 3: `docs/deploy.md`**

Acrescentar `## 17. Visitantes sem acesso (#126)` com: as Rules mudam no release (publicar `firestore` e `storage` já fazem parte do deploy); antes de publicar, avisar os admins para liberar em **Pessoas** as pessoas que hoje usam o app como visitante; quem for liberado entra de novo para ver o app. Sem passo novo de configuração.

Run: `npm run lint` e `npm run test:harness`
Expected: PASS (o `test:harness` confere o `design-system`: todo token documentado).

Ponto de commit (orquestrador): `docs: document visitor access gate and release note (#126)`

---

### Task 7: Paper final (designer)

**Files:** nenhum no repositório.

**Interfaces:** nenhuma.

- [ ] **Step 1: Artboard da tela**

Criar ou confirmar `31 · Visitante sem acesso` (escuro, 390 px) com os valores de Task 0. Conferir com `get_screenshot`. Chamar `finish_working_on_nodes`.

- [ ] **Step 2: Telas que mudam de texto**

Atualizar `20 · Login` com a nota nova ("Quem entra pela primeira vez precisa da liberação de um admin do ministério para ver as cifras."). Revisar `13 Repertório (visitante)` e `05b Mais (membro/visitante)` (Lacunas, item 1).

- [ ] **Step 3: Registro**

No PR, escrever o que foi atualizado no Paper (escuro e claro quando for tela raiz). Se o Paper MCP estiver indisponível: "Paper pendente: <o que>".

Ponto de commit: nenhum (Paper).

---

### Task 8: E2E Playwright (qa, etapa 5)

**Files:**
- Modify: `e2e/fixtures/app.ts` (extrair `signInWithPopup` em um helper com parâmetro de espera: `'nav'` (padrão, como hoje) ou `'access'`, que espera o heading "Acesso ainda não liberado"; exportar `signInToAccessScreen(page, account)`)
- Modify: `e2e/visitor.spec.ts` (reescrito)
- Modify: `e2e/avisos.spec.ts` (teste `'visitante não vê "Avisos" na aba Mais'`, linha 97: remover; a cobertura de membro segue no mesmo arquivo)
- Modify: `e2e/setlists.spec.ts` (linha 360 e teste da linha 708: trocar `newAccount('visitante')` por um membro promovido pelo admin, como em `e2e/people.spec.ts`)

**Interfaces:**
- Consumes: `signInWithPopup`, `expectRole`, `createGoogleUser`, `waitForUserDoc` (existentes).
- Produces: `signInToAccessScreen(page: Page, account: Account): Promise<void>`.

- [ ] **Step 1: Escrever o fluxo (antes de ajustar os specs)**

`visitor.spec.ts`, teste único `'visitor sees only the access screen until an admin releases the account'`:
1. Criar a conta e `waitForUserDoc`.
2. `signInToAccessScreen`: heading "Acesso ainda não liberado" visível; e-mail da conta no cartão; sem `role="navigation"` "Principal".
3. Visitar `/musicas/<id>` e `/pessoas` (`page.goto`): ainda a tela; sem `Principal`.
4. Coletar `console` com "permission" e garantir que não há erro de permissão desde o login (critério 8).
5. Clicar "Sair" (volta ao login).
6. Admin promove a conta (fluxo de `people.spec.ts`), a pessoa entra de novo e vê `Principal` e "Nova cifra" (membro).

- [ ] **Step 2: Rodar E2E**

Run (CI ou local): `npm run test:e2e`
Expected: `visitor.spec.ts` verde; `avisos.spec.ts` e `setlists.spec.ts` verdes sem os casos de visitante.

Ponto de commit (orquestrador): `test(e2e): visitor sees only the access screen (#126)`

---

## Verificação final (orquestrador, antes do PR)

- [ ] `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:harness`, `npm run test:rules` verdes.
- [ ] `npm run test:e2e` verde (CI).
- [ ] `git grep "começa como visitante" -- apps e2e docs` sem resultados.
- [ ] `git grep "signedIn()" -- firestore.rules` mostra só a regra de `users`.

## Review Focus: onde cada linha é testada

- Linha 1 (sem claim): Task 1 (matriz, "sem claim") e Task 2 (`'denies read under songs/ without role claim'`).
- Linha 2 (libera com tela aberta): Task 3 (`'users doc says member but claim says viewer...'`) e Task 8 (passo 6).
- Linha 3 (rebaixamento): Task 3 (`'demotion with app open turns blocked'`) e Task 5.
- Linha 4 (link direto): Task 5 (`'visitor sees only the access screen at %s'`).
- Linha 5 (falha ao ler claim): Task 3 (`'failed claim read is blocked and warns'`).

## Lacunas e dúvidas (devolver ao orquestrador)

1. **Número do artboard:** `docs/design-system.md` §8 já usa `31 · Aviso do sistema`. O nome pedido, `31 · Visitante sem acesso`, repete o número. Sugestão: confirmar com o designer se o Paper tem o nome certo, ou usar o próximo número livre (`32`). Também há artboards que ficam obsoletos: `13 Repertório (visitante)`, `05b Mais (membro/visitante)` e o texto "somente leitura para visitante" da seção 5.
2. **Liberação automática ou "é só entrar de novo":** o plano deixa a tela trocar sozinha quando o claim muda (o listener do doc segue ativo). O texto do cartão ("é só entrar de novo") continua valendo como fallback. Confirmar com o `product-owner` que a troca automática é aceitável.
3. **Dono do E2E:** o AGENTS.md dá E2E ao `qa` (etapa 5); o plano segue essa divisão, que fica fora do pedido de só backend/frontend. Confirmar.
4. **Cache de quem perdeu acesso:** PDFs no cache do service worker (`cifras-pdfs`) e o pad em cache continuam no aparelho de quem perdeu o acesso (limite aceito na issue). Não há código novo para isso. O `signOut` já limpa esses caches.
5. **Falha ao ler o claim:** o plano escolhe bloquear (`blocked`), com a tela de acesso. Um membro com falha de rede no token veria a tela. A alternativa seria ficar em "Carregando…" para sempre. Confirmar.
6. **Tamanho do `sistema.md`:** o arquivo já está com 300 linhas, o teto. A Task 6 exige enxugar para não passar disso.
7. **Divergência `artists`:** a regra de `artists` existe (leitura `signedIn()`); o `sistema.md` diz "negada". O cliente não lê `artists`. O plano troca a leitura para `isEditor()` e registra a divergência; quem decide se a regra fica ou sai é a pessoa.
8. **Prefetch de JS:** `main.tsx` baixa o chunk de `ViewerRoute` antes do login em link direto. Não chama Firestore nem Storage. Mantido. Se a pessoa quiser zero download para visitante, o prefetch precisaria esperar o claim.
9. **Textos novos sem desenho:** "Não foi possível sair. Tente de novo." (erro do botão Sair) e a nota do login. O designer confirma.
10. **Tamanho do Task 3:** a mudança de `AuthState` toca em ~15 arquivos de teste (literal `access: 'granted'`). É mecânica, mas grande; o `typecheck` guia a lista.
11. **Testes de App ficam assíncronos:** a leitura do claim é uma Promise; as `setup` dos testes de App passam a ser `async`. Risco de tempo de execução e de testes instáveis; o `frontend-dev` deve usar `findBy*` e não `getBy*` logo após `setup`.
12. **Rules de escrita que usam `get`/`existsAfter`:** o plano assume que não passam pela regra de leitura. Os testes existentes de criação (`'allows member to create song with arrangement in one batch'`, `'member creates songLyrics together with the song'`) são a prova; se falharem, parar.
