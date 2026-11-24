# Ministérios: Pacote (#136) Implementation Plan

> **Para workers agentes:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Entregar para a pessoa, num release só, o uso do app por ministério: entrada pelo Google com pedido de entrada, cliente lendo e gravando repertórios em `ministries/{mid}/setlists`, Mais por papel, Pessoas do ministério, Gestão da app, Estatísticas por ministério, Rules e Functions que conferem os claims novos, avisos filtrados pelo vínculo e o espelho desligado.

**Architecture:** O documento de vínculo (`ministries/{mid}/members/{uid}`) é a verdade. Repertórios são protegidos por Rules que leem o documento (`exists()`/`get()`), catálogo e Storage leem o claim `hasMinistry`/`canUploadSong`/`appAdmin`, que as Functions recalculam do documento. O cliente observa o próprio vínculo por consulta de grupo (campo `uid`), força o refresh do token quando o claim diverge e limpa o cache local quando o vínculo some. O `role` antigo fica só como fallback para tokens sem o claim novo, até a limpeza (#137).

**Tech Stack:** TypeScript `strict`; React + React Router (`apps/web`); Cloud Functions v2 em `southamerica-east1`; firebase-admin 14; Vitest 5 (`apps/functions`, `apps/web`); `@firebase/rules-unit-testing` no emulador (`tests/rules`); Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-23-131-ministerios-design.md` (§3, §4.4, §4.5, §4.6 passo 2, §5, §6 item 2, §7, §8). Plano da Preparação, que este pacote consome: `docs/superpowers/plans/2026-11-23-135-ministerios-preparacao.md` (seção "Decisões tomadas na execução").

**Nomes que este plano fixa (vindos da #135):** claims `role`, `appAdmin`, `hasMinistry`, `canUploadSong`; documentos `ministries/{mid}`, `ministries/{mid}/members/{uid}`, `ministries/{mid}/requests/{uid}`, `ministries/{mid}/setlists/{sid}`, `setlistUsage/{sid}` com `ministryId`; id da Haja Luz `hajaluz`; campo `uid` em `members` e `requests` (cópia do id do documento).

---

## Restrições globais

- Não tocar `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md` (travas). A entrega não precisa mexer em nenhuma.
- Nenhum PDF, áudio ou e-mail real no repositório. Testes usam e-mails fictícios (`pessoa@exemplo.test`).
- Textos de UI e mensagens de erro para a pessoa em pt-BR; identificadores em inglês; commits em Conventional Commits, em inglês (o orquestrador commita).
- Toda mudança em Rules ou Functions passa por `npm run test:rules` antes do PR (spec §7). Sem Java no host: `docker compose run --rm --no-deps emulators npm run test:rules`.
- Testes filtrados, nunca a suíte inteira no agente: `npm run test -w @cifras/functions -- src/<pasta>` e `npm run test -w @cifras/web -- <caminho>` (confirmar o nome do workspace web no `package.json`).
- Uso de `setCustomUserClaims`: substitui o objeto inteiro. Todo writer de claims passa os **quatro** campos (`buildClaims`).
- Limites do Firebase: consulta de grupo em `members` e `requests` usa índice de grupo já criado na #135; `setlists` ganha dois índices de grupo novos (Tarefa 2). Sem índice ativo, a consulta falha com `failed-precondition`.
- Não publicar nas quintas e domingos das 16h30 às 23h59 (America/Sao_Paulo). A migração já foi rodada na #135; este pacote não roda script.
- **Teste no celular obrigatório:** o pacote toca `apps/web/src/setlists/` e `apps/web/src/viewer/`. Espera o "ok" da pessoa, com `teste-celular-ok` no PR (AGENTS "Teste no celular").

---

## Recomendação de entrega: PR único ou integração

**Recomendação: três entregas, sendo a segunda o pacote inteiro em um PR só para a `develop`.**

1. **Pré-entrega P (Tarefas 1 e 2)**, sub-issue própria e PR próprio para a `develop`, liberado **antes** do pacote. Motivo: o site de teste usa as Rules e Functions de produção (spec §7). Sem P em produção, o cliente novo não consegue ler o próprio vínculo nem o próprio pedido no site de teste (a Preparação só deixa ler `members`/`requests` pelo admin ou pela app admin), e o teste no celular cai em "sem acesso" para qualquer pessoa sem ministério. P é invisível para quem usa e cabe no AGENTS (entrega inteira, testada, sem mudança de interface).
2. **Pacote (Tarefas 3 a 27)**, branch `feat/136-ministerios-pacote`, PR único para `develop`, aberto como rascunho cedo, com um commit por tarefa (ou por grupo). Motivo: Rules, Functions e cliente precisam sair juntos (o cliente novo lê o caminho novo; a raiz `setlists` fica só leitura; o espelho some). Dividir em PRs obriga uma branch de integração, que só agrega risco: o hook de Stop abre o release sempre que a `develop` difere da `main`, e não sabemos se o git-guard aceita `--base` diferente de `develop` (confirmar antes de criar sub-PRs). Se a revisão ficar grande demais, o `code-reviewer` revisa por grupo de commits, não por PR.
3. Limpeza (#137), depois de conferido em produção (spec §4.6 passo 3).

Ordem de release: P merge → release de P (Rules, índices, Functions de P) → índices de grupo em "Ativado" → pacote faz `git merge origin/develop` (merge, sem rebase) → teste no celular → PR do pacote → release do pacote com merge commit, fora da janela.

---

## Contratos entre pacotes

### C1. Claims (Functions gravam; Rules, Storage e cliente leem)

| Claim | Significado | Quem lê |
| --- | --- | --- |
| `appAdmin` | admin da app (`users/{uid}.appAdmin`) | Rules (catálogo, avisos de Gestão), Storage, cliente |
| `hasMinistry` | pertence a pelo menos um ministério | Rules (catálogo, tom gerado, Storage), cliente (`access`) |
| `canUploadSong` | admin de algum ministério **ou** admin da app | Rules (música nova, tom feito à mão, letra), cliente (botões) |
| `role` | **legado**; só fallback para token sem o claim novo, até #137 | Rules (somente quando `hasMinistry` não existe no token) |

Regra de leitura nas Rules: se o token **tem** `hasMinistry`, ele manda e `role` é ignorado; se **não tem** (token emitido antes da Preparação), vale `role` como antes. Isso faz a remoção valer já no próximo refresh, sem aceitar `role` de token novo.

### C2. Caminhos de Firestore

| Caminho | Quem lê | Quem grava |
| --- | --- | --- |
| `ministries/{mid}` | qualquer logado | Functions (`createMinistry`, `updateMinistry`) |
| `ministries/{mid}/members/{uid}` | a própria pessoa; admin do `mid`; admin da app; consulta de grupo por `uid` (a própria) | Functions |
| `ministries/{mid}/requests/{uid}` | a própria pessoa; admin do `mid`; admin da app; consulta de grupo por `uid` (a própria) | Functions (e a pessoa, só cancelar, via callable) |
| `ministries/{mid}/setlists/{sid}` | membro do `mid`; escrita: admin do `mid` | cliente (com `validSetlist`) |
| `setlists/{sid}` (raiz) | só membro da Haja Luz (`ministries/hajaluz/members`) | ninguém (congelada) |
| `setlistUsage/{sid}` | só Functions | Functions (com `ministryId`) |
| `users/{uid}` | a própria pessoa; admin da app | Functions |

### C3. Callables usadas pelo cliente (existem da #135; nomes fixos)

| Callable | Entrada (chaves) | Quem pode |
| --- | --- | --- |
| `requestMinistryAccess` | `{ ministryId }` | sem ministério |
| `cancelMinistryRequest` | `{ ministryId }` | a própria pessoa |
| `approveMinistryRequest` | `{ ministryId, uid }` | admin do `ministryId` ou admin da app |
| `rejectMinistryRequest` | `{ ministryId, uid }` | idem |
| `setMinistryMemberRole` | `{ ministryId, uid, role: 'member' \| 'admin' }` | idem; não rebaixa o último admin, a menos que seja admin da app |
| `removeMinistryMember` | `{ ministryId, uid }` | idem |
| `createMinistry` | `{ name, city }` → `{ ministryId }` | admin da app |
| `updateMinistry` | `{ ministryId, name, city }` | admin da app |
| `setAppAdmin` | `{ uid, appAdmin }` (confirmar as chaves em `ministries/admin.ts`) | admin da app; não altera o próprio |
| `getStats` | `{ ministryId? }` (novo nesta entrega) | admin da app (geral + ministério opcional) ou admin do `ministryId` |

Removida nesta entrega: `setUserRole` (a tela Pessoas antiga sai). `registerDevice` e `sendTestPush` passam a exigir vínculo; `replaceArrangement`, `discardUpload`, `updateSongMeta`, `deleteArrangement`, `deleteSong` passam pelos guards da Tarefa 7.

### C4. Contrato de `useAuth` (`apps/web/src/auth/useAuth.ts`)

```ts
export type MinistryRole = 'member' | 'admin';
export type CurrentMinistry = { id: string; name: string; city: string; role: MinistryRole };
export type AccessState = 'checking' | 'granted' | 'blocked';
export interface AuthState {
  status: 'loading' | 'signed-in' | 'signed-out';
  user: SessionUser | null;
  /** granted quando o token tem hasMinistry ou appAdmin; blocked caso contrário. */
  access: AccessState;
  appAdmin: boolean;
  canUploadSong: boolean;
  /** Único vínculo da pessoa (a interface aceita um). null sem ministério. */
  ministry: CurrentMinistry | null;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
```

`role` sai do `AuthState`. Predicados em `apps/web/src/auth/permissions.ts` (substituem `canEdit`, `isAdmin`, `canEditSetlists`):

```ts
export const canListSetlists = (s: AuthState) => s.access === 'granted' && s.ministry !== null;
export const canChangeKey = (s: AuthState) => s.access === 'granted';          // Mudar tom: todo membro
export const canEditSetlist = (s: AuthState) => s.ministry?.role === 'admin';   // repertório: admin do ministério
export const canManageSongs = (s: AuthState) => s.appAdmin;                     // apagar/corrigir cifra
export const canUpload = (s: AuthState) => s.canUploadSong;                     // Nova cifra, Importar
export const isMinistryAdmin = (s: AuthState) => s.ministry?.role === 'admin';
export const isAppAdmin = (s: AuthState) => s.appAdmin;
```

### C5. Gateway do cliente (`apps/web/src/auth/gateway.ts`)

Substitui `getClaimRole` por `getClaims(): Promise<{ appAdmin: boolean; hasMinistry: boolean; canUploadSong: boolean }>` (lê `getIdTokenResult(auth.currentUser).claims`, com `=== true`). Mantém `refreshToken`, `onUserDoc` (agora entrega `{ appAdmin }`), `prepareSignIn`, `signIn`, `signOut`. Acrescenta:

- `onMemberships(uid, cb: (m: Array<{ ministryId: string; role: MinistryRole }>) => void): () => void`: `onSnapshot(query(collectionGroup(db, 'members'), where('uid', '==', uid)))`, `ministryId` = `snap.ref.parent.parent?.id`.
- `onMinistry(ministryId, cb: (m: { name: string; city: string } | null) => void): () => void`: `onSnapshot(doc(db, 'ministries', ministryId))`.
- `forgetLocalData(): Promise<void>`: `terminate(db)`, `clearIndexedDbPersistence(db)`, `caches.delete('cifras-pdfs')` (ignorando falhas), depois `reload()`. Usada quando o vínculo some (Tarefa 15).

### C6. Camada de dados de ministérios no cliente (`apps/web/src/ministries/ministriesApi.ts`)

```ts
export interface MinistriesApi {
  listMinistries(): Promise<Array<{ id: string; name: string; city: string; nameNormalized: string }>>;
  subscribeMyRequests(uid: string, cb: (r: Array<{ ministryId: string; status: 'pending' | 'rejected' }>) => void, onError: (e: unknown) => void): () => void;
  countPending(ministryId: string): Promise<number>;           // admin do ministério
  countPendingAll(): Promise<number>;                           // admin da app (consulta de grupo, status == pending)
  listRequests(ministryId: string): Promise<PersonRow[]>;       // pedidos pendentes do ministério
  listMembers(ministryId: string): Promise<PersonRow[]>;        // membros do ministério
  listAllPendingRequests(): Promise<Array<PersonRow & { ministryId: string }>>; // Gestão
  callable: { requestAccess, cancelRequest, approve, reject, setRole, removeMember, createMinistry, updateMinistry, setAppAdmin, getStats };
}
export type PersonRow = { uid: string; displayName: string | null; email: string | null; photoURL: string | null; role?: MinistryRole; createdAt?: Date | null };
```

Consultas de leitura usam o SDK do cliente (Rules já permitem); escritas só por callable (C3). Todas as chamadas que dependem do resultado da gravação tratam falha depois de gravar: a mensagem é "Não foi possível concluir. Tente de novo." (a callable é segura para repetir; item 8a da #135).

### C7. Rotas (`apps/web/src/App.tsx`, Tarefa 25)

| Rota | Quem | Tela |
| --- | --- | --- |
| `/` `/busca` `/pad` `/mais` `/cantores/:id` `/musicas/:id` | membro, admin do ministério, admin da app | como hoje |
| `/repertorios/:id` | com ministério | repertório do ministério atual; não existe nele: "Repertório não encontrado" |
| `/nova`, `/importar` | `canUpload` | como hoje |
| `/pessoas` | admin do ministério | Pessoas do ministério (pedidos e membros) |
| `/estatisticas` | admin do ministério | Estatísticas do ministério (só ranking) |
| `/gestao` | admin da app | Gestão (pedidos de todos, Ministérios, Admins da app, linha de Estatísticas da app) |
| `/gestao/ministerios` · `/gestao/ministerios/:mid` | admin da app | lista e detalhe (Pessoas do ministério daquele `mid`) |
| `/gestao/estatisticas` | admin da app | Estatísticas da app |
| `/gestao/admins` | admin da app | Admins da app |
| entrada (sem ministério) | sem ministério | Escolha seu ministério, Confirmar, Pedido enviado, Pedido recusado |

---

## Revisão de foco (Review Focus)

1. **Consulta de grupo alargada:** a regra de `members`/`requests` por `resource.data.uid` não pode dar leitura de vínculo alheio. Testes em `tests/rules/ministerios.rules.test.ts` (Tarefa 1).
2. **Removido com token antigo:** `hasMinistry` no token em `false` nega repertório **e** catálogo na hora; `role` não vale quando o claim existe. Testes em `tests/rules` (Tarefas 4, 5 e 6).
3. **Claims apagados:** todo writer grava os quatro campos. Testes em `claims.test.ts` (já existe) e nas callables que gravam claims.
4. **Cliente sem leitura antes de ter ministério:** `RequireAccess` não monta provedores de dados quando `access !== 'granted'`; a consulta de grupo de `members` e de `requests` é a única leitura permitida antes. Testes em `RequireAccess.test.tsx` (Tarefa 17).
5. **Raiz congelada:** a raiz `setlists` só aceita leitura da Haja Luz; o espelho sai. Testes de rules (Tarefa 3) e de Functions (Tarefa 12).
6. **Avisos:** aparelho de outro ministério não recebe e **não** é apagado; aparelho de quem não tem ministério nenhum é apagado. Testes em `send.test.ts` (Tarefa 9).
7. **Estatísticas sem contagem dupla:** `collectionGroup('setlists')` também traz a raiz; só entra quem tem `ministryId` (`ref.parent.parent` não nulo). Testes em `countUsage.test.ts` (Tarefa 11).
8. **Admin da app não lê repertório alheio:** `ministries/{mid}/setlists` exige documento de membro; a app admin só lê `members` e `requests`. Teste de rules (Tarefa 6).

---

## Mapa de grupos (paralelismo sem arquivos compartilhados)

| Grupo | Tarefas | Arquivos | Pode andar junto com |
| --- | --- | --- | --- |
| P (pré-entrega, PR próprio) | 1, 2 | `firestore.rules` (só `users`, `members`, `requests`), `firestore.indexes.json`, `tests/rules/ministerios.rules.test.ts`, `apps/functions/src/indexesConfig.test.ts` | nada: sai antes |
| R (Rules do pacote) | 3 → 4 → 5 → 6 (sequencial) | `firestore.rules` (repertórios, raiz, catálogo), `storage.rules`, `tests/rules/*` | F, D |
| F (Functions) | 7 → 8 → 9 → 10 → 11 → 12 → 13 (sequencial) | `apps/functions/src/**` (exceto testes de outros grupos); `index.ts` só na 13 | R, D |
| D (design e tokens) | 14 | `apps/web/src/ui/styles.css`, `docs/design-system.md` | R, F |
| W (cliente) | 15 → 16 → 17 → 18 (sequencial); depois 19, 20, 21, 22, 23, 24 em paralelo; 25 depois | 15: `auth/*`; 16: `ministries/*`; 17: `routes/RequireAccess.tsx`, `routes/AccessPending.tsx` (remover), `routes/LoginPage.tsx`, `ministries/entry/*`; 18: `setlists/*`; 19: `viewer/*`; 20: `search/HomePage.tsx`, `routes/RequireRole.tsx`; 21: `more/*`, `push/PushProvider.tsx`, `push/AvisosCard.tsx`; 22: `people/*`; 23: `gestao/*`; 24: `stats/*`; 25: `App.tsx`, `bootstrap.tsx`, `routes/routes.test.tsx` | depois de D (14) e em paralelo com R e F |
| E (E2E) | 26 | `e2e/**` | depois de W |
| X (docs) | 27 | `docs/sistema.md`, `docs/deploy.md` | depois de F e W |
| V (verificação final, seção própria) | — | Paper (fora do repositório) e checagens | último |

Dentro de cada tarefa: o passo 1 escreve o teste e o passo 2 confirma que ele falha (ou que não compila, quando for tipo). Ao fim de cada tarefa o agente devolve a lista de arquivos alterados; o orquestrador commita.

---
## Parte P: pré-entrega (PR próprio, liberado antes do pacote)

### Task 1: Leitura própria por consulta de grupo e `users` para o admin da app

**Por quê:** o cliente novo observa o próprio vínculo e o próprio pedido por `collectionGroup`. Hoje as Rules de grupo só deixam o admin da app ler. Esta mudança é invisível (só lê o que é da própria pessoa) e precisa estar em produção antes do teste no celular, porque o site de teste usa as Rules de produção.

**Arquivos:**
- Modificar: `firestore.rules` (bloco `users` e os dois `match /{path=**}`)
- Modificar: `tests/rules/ministerios.rules.test.ts` (novo `describe`; acrescentar `getDoc`, `query` e `where` aos imports de `firebase/firestore`)

- [ ] **Passo 1: escrever o teste (falha antes da regra)**

Acrescentar ao final de `tests/rules/ministerios.rules.test.ts`, reusando `env`, `beforeAll` e `beforeEach` já presentes:

```ts
describe('consulta de grupo por uid (P1)', () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'ministries/hajaluz/members/ana'), { uid: 'ana', role: 'member' });
      await setDoc(doc(db, 'ministries/outro/members/bia'), { uid: 'bia', role: 'admin' });
      await setDoc(doc(db, 'ministries/outro/requests/ana'), { uid: 'ana', status: 'pending' });
      await setDoc(doc(db, 'users/ana'), { appAdmin: false, role: 'viewer' });
      await setDoc(doc(db, 'users/bia'), { appAdmin: false, role: 'viewer' });
    });
  });

  it('a pessoa lista só os próprios vínculos', async () => {
    const db = env.authenticatedContext('ana', {}).firestore();
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'ana'))),
    );
    expect(snap.docs.map((d) => d.id)).toEqual(['ana']);
  });

  it('consulta de grupo sem filtro por uid é negada', async () => {
    const db = env.authenticatedContext('ana', {}).firestore();
    await assertFails(getDocs(collectionGroup(db, 'members')));
  });

  it('não lê vínculo nem pedido de outra pessoa por consulta de grupo', async () => {
    const db = env.authenticatedContext('ana', {}).firestore();
    await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'bia'))));
    await assertFails(getDocs(query(collectionGroup(db, 'requests'), where('uid', '==', 'bia'))));
  });

  it('a pessoa lê o próprio pedido por consulta de grupo', async () => {
    const db = env.authenticatedContext('ana', {}).firestore();
    const snap = await assertSucceeds(
      getDocs(query(collectionGroup(db, 'requests'), where('uid', '==', 'ana'))),
    );
    expect(snap.docs.map((d) => d.id)).toEqual(['ana']);
  });

  it('admin da app lê todos os vínculos e pedidos pendentes', async () => {
    const db = env.authenticatedContext('chefe', { appAdmin: true }).firestore();
    await assertSucceeds(getDocs(collectionGroup(db, 'members')));
    await assertSucceeds(
      getDocs(query(collectionGroup(db, 'requests'), where('status', '==', 'pending'))),
    );
  });

  it('users: a pessoa lê o próprio; admin da app lê todos; outra pessoa não', async () => {
    const ana = env.authenticatedContext('ana', {}).firestore();
    await assertSucceeds(getDoc(doc(ana, 'users/ana')));
    await assertFails(getDoc(doc(ana, 'users/bia')));
    const chefe = env.authenticatedContext('chefe', { appAdmin: true }).firestore();
    await assertSucceeds(getDoc(doc(chefe, 'users/bia')));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules` (ou o comando com Docker da seção de restrições). Esperado: falham "lista só os próprios vínculos", "lê o próprio pedido" e "users" (leitura do admin da app).

- [ ] **Passo 3: regra mínima**

Em `firestore.rules`, substituir o bloco `match /users/{uid}` e os dois blocos de grupo por:

```
    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAppAdminClaim() || role() == 'admin');
      allow write: if false;
    }
```

```
    // Consulta de grupo por uid: a pessoa lê só os próprios vínculos e pedidos (campo uid = id do documento).
    // Admin da app lê todos. Repertório não é lido por aqui.
    match /{path=**}/members/{memberUid} {
      allow read: if isAppAdminClaim() || (signedIn() && resource.data.uid == request.auth.uid);
    }

    match /{path=**}/requests/{requestUid} {
      allow read: if isAppAdminClaim() || (signedIn() && resource.data.uid == request.auth.uid);
    }
```

`role() == 'admin'` continua até o pacote (a Tarefa 3 do pacote retira também essa condição da regra de `users`). Nada além disso nesta entrega.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde, inclusive os testes antigos de `members` e `requests` (o admin do ministério continua lendo pelo bloco de `ministries/{mid}`).

- [ ] **Passo 5: entrega**

Arquivos: `firestore.rules`, `tests/rules/ministerios.rules.test.ts`. Mensagem sugerida: `feat(rules): leitura própria de vínculo e pedido por consulta de grupo`.

---

### Task 2: Índices de grupo de `setlists` (`date` e `rehearsalAt`)

**Por quê:** `countSettledSetlists` (`where date <= cutoff`) e `sendRehearsalReminders` (`where rehearsalAt`) passam a consultar o grupo `setlists`. A exceção automática de índice cobre só o escopo de coleção, então cada campo precisa de índice de grupo. Precisa estar "Ativado" antes do teste no celular.

**Arquivos:**
- Modificar: `firestore.indexes.json`
- Criar: `apps/functions/src/indexesConfig.test.ts`

- [ ] **Passo 1: teste que falha**

Criar `apps/functions/src/indexesConfig.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Override = {
  collectionGroup: string;
  fieldPath: string;
  ttl?: boolean;
  indexes?: Array<{ order?: string; queryScope?: string }>;
};

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../firestore.indexes.json'), 'utf8'),
) as { fieldOverrides: Override[] };

const find = (group: string, field: string) =>
  config.fieldOverrides.find((o) => o.collectionGroup === group && o.fieldPath === field);

const scopesOf = (group: string, field: string): string[] =>
  (find(group, field)?.indexes ?? []).map((i) => `${i.order}:${i.queryScope}`);

describe('índices do pacote de ministérios', () => {
  it.each(['date', 'rehearsalAt'])('setlists.%s tem índice ascendente de grupo', (field) => {
    expect(scopesOf('setlists', field)).toContain('ASCENDING:COLLECTION_GROUP');
  });

  it('mantém o índice de coleção de setlists.date e de rehearsalAt', () => {
    expect(scopesOf('setlists', 'date')).toContain('ASCENDING:COLLECTION');
    expect(scopesOf('setlists', 'rehearsalAt')).toContain('ASCENDING:COLLECTION');
  });

  it('mantém o TTL de setlists em expiresAt', () => {
    expect(find('setlists', 'expiresAt')?.ttl).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/indexesConfig`. Esperado: os dois casos de grupo falham (a lista ainda não existe).

- [ ] **Passo 3: configuração**

Em `firestore.indexes.json`, acrescentar dois objetos em `fieldOverrides`, antes do bloco `members`:

```json
    {
      "collectionGroup": "setlists",
      "fieldPath": "date",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION" },
        { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
      ]
    },
    {
      "collectionGroup": "setlists",
      "fieldPath": "rehearsalAt",
      "indexes": [
        { "order": "ASCENDING", "queryScope": "COLLECTION" },
        { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
      ]
    },
```

Se `apps/functions` compilar como CommonJS e `import.meta.dirname` não existir no runner, trocar por `resolve(__dirname, '../../../firestore.indexes.json')`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/indexesConfig`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `firestore.indexes.json`, `apps/functions/src/indexesConfig.test.ts`. Mensagem sugerida: `chore(firestore): índices de grupo de setlists por data e ensaio`. Ao orquestrador: confirmar "Ativado" no console antes do teste no celular (Passos manuais, item 3).

---

## Parte R: Rules do pacote

### Task 3: Raiz de `setlists` só leitura para a Haja Luz

**Arquivos:**
- Modificar: `firestore.rules` (bloco `match /setlists/{setlistId}`)
- Modificar: `tests/rules/setlists.rules.test.ts` (casos da raiz)

- [ ] **Passo 1: testes que falham**

Em `tests/rules/setlists.rules.test.ts`, trocar os casos que liberavam a raiz por papel por este bloco (o arquivo já tem `env` e helpers de seed; se `validSetlistData` não existir, criar com os campos de `validSetlist`: `date`, `label`, `items`, `expiresAt`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`):

```ts
describe('raiz setlists congelada (pacote)', () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'setlists/s1'), validSetlistData());
      await setDoc(doc(db, 'ministries/hajaluz/members/ana'), { uid: 'ana', role: 'member' });
      await setDoc(doc(db, 'ministries/hajaluz/members/chefe'), { uid: 'chefe', role: 'admin' });
      await setDoc(doc(db, 'ministries/outro/members/bia'), { uid: 'bia', role: 'member' });
    });
  });

  it('membro da Haja Luz lê a raiz', async () => {
    const db = env.authenticatedContext('ana', { role: 'member' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'setlists/s1')));
  });

  it('membro de outro ministério com role member não lê a raiz', async () => {
    const db = env.authenticatedContext('bia', { role: 'member' }).firestore();
    await assertFails(getDoc(doc(db, 'setlists/s1')));
  });

  it('admin legado sem vínculo na Haja Luz não lê a raiz', async () => {
    const db = env.authenticatedContext('x', { role: 'admin' }).firestore();
    await assertFails(getDoc(doc(db, 'setlists/s1')));
  });

  it('ninguém grava na raiz, nem admin da Haja Luz', async () => {
    const db = env.authenticatedContext('chefe', { role: 'admin' }).firestore();
    await assertFails(setDoc(doc(db, 'setlists/novo'), validSetlistData()));
    await assertFails(updateDoc(doc(db, 'setlists/s1'), { label: 'x' }));
    await assertFails(deleteDoc(doc(db, 'setlists/s1')));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`. Esperado: "admin legado sem vínculo" e a escrita do admin falham hoje (a regra antiga usa `isAdmin()` por `role`), e "membro de outro ministério" passa hoje e deve falhar.

- [ ] **Passo 3: regra**

Substituir em `firestore.rules` o bloco `match /setlists/{setlistId}` por:

```
    // Raiz congelada: só leitura, e só para quem é da Haja Luz (documento de membro, nunca o role).
    // O espelho é desligado neste pacote; a cópia em ministries/hajaluz/setlists passa a ser a fonte.
    match /setlists/{setlistId} {
      allow read: if isMemberOf('hajaluz');
      allow create, update, delete: if false;
    }
```

O bloco `match /ministries/{mid}/setlists/{setlistId}` fica como está.

Também na regra de `users`, retirar `role() == 'admin'` (a leitura passa a ser `request.auth.uid == uid || isAppAdminClaim()`): os admins de hoje deixam de ver os outros usuários, como o spec pede (§4.4).

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde, inclusive os casos de `ministries/{mid}/setlists` em `ministerios.rules.test.ts`.

- [ ] **Passo 5: entrega**

Arquivos: `firestore.rules`, `tests/rules/setlists.rules.test.ts`. Mensagem sugerida: `feat(rules): raiz de setlists só leitura para a Haja Luz`.

---

### Task 4: Catálogo por claims, com fallback legado para token antigo

**Por quê:** o catálogo deixa de depender de `role` no token (spec §4.4). O fallback vale só quando o token não tem o claim novo; depois da Preparação todo token renovado tem o claim, e a remoção vale no refresh.

**Arquivos:**
- Modificar: `firestore.rules` (helpers e blocos `artists`, `songs`, `arrangements`, `songLyrics`)
- Modificar: `tests/rules/firestore.rules.test.ts`

- [ ] **Passo 1: testes que falham**

Acrescentar em `tests/rules/firestore.rules.test.ts` um `describe('catálogo por claims (pacote)')`. Reusar os helpers de criação válida do arquivo (`validSongData`, `validArrangementData`, `validLyricsData`; se algum não existir, extrair dos testes de criação existentes, com os campos exatos de `validSong`, `validArrangement` e `validLyrics` de `firestore.rules`):

```ts
describe('catálogo por claims (pacote)', () => {
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'songs/s1'), validSongData('s1'));
    });
  });

  it('sem claim novo e com role viewer, não lê o catálogo', async () => {
    const db = env.authenticatedContext('v', { role: 'viewer' }).firestore();
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('hasMinistry verdadeiro lê o catálogo', async () => {
    const db = env.authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false }).firestore();
    await assertSucceeds(getDoc(doc(db, 'songs/s1')));
  });

  it('hasMinistry falso não lê, mesmo com role member (removido com token antigo)', async () => {
    const db = env.authenticatedContext('r', { role: 'member', hasMinistry: false, canUploadSong: false }).firestore();
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('token antigo sem claim novo lê pelo role legado', async () => {
    const db = env.authenticatedContext('old', { role: 'member' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'songs/s1')));
  });

  it('membro sem canUploadSong não cria música nova nem letra', async () => {
    const db = env.authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false }).firestore();
    await assertFails(setDoc(doc(db, 'songs/s2'), validSongData('s2', 'm')));
    await assertFails(setDoc(doc(db, 'songLyrics/s1'), validLyricsData('m')));
  });

  it('admin de ministério (canUploadSong) cria música nova', async () => {
    const db = env.authenticatedContext('a', { role: 'member', hasMinistry: true, canUploadSong: true }).firestore();
    await assertSucceeds(setDoc(doc(db, 'songs/s2'), validSongData('s2', 'a')));
  });

  it('membro cria tom gerado a partir de tom feito à mão', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'songs/s1/arrangements/c'), validArrangementData('handmade', 'C'));
    });
    const db = env.authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false }).firestore();
    await assertSucceeds(setDoc(doc(db, 'songs/s1/arrangements/d'), validArrangementData('generated', 'D', 'C')));
  });

  it('membro não cria tom feito à mão', async () => {
    const db = env.authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false }).firestore();
    await assertFails(setDoc(doc(db, 'songs/s1/arrangements/d'), validArrangementData('handmade', 'D')));
  });

  it('admin da app lê e cria sem ministério', async () => {
    const db = env.authenticatedContext('chefe', { appAdmin: true, role: 'viewer' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'songs/s1')));
    await assertSucceeds(setDoc(doc(db, 'songs/s3'), validSongData('s3', 'chefe')));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`. Esperado: "sem claim novo" e "hasMinistry falso" falham hoje (a regra antiga aceita `role member`), e "membro sem canUploadSong" falha hoje por passar.

- [ ] **Passo 3: regra**

Em `firestore.rules`, remover `isEditor()` e `isAdmin()` e acrescentar, junto de `isAppAdminClaim()`:

```
    // Claim do token manda quando existe. Token sem o claim (emitido antes da Preparação)
    // usa o role legado até a limpeza (#137). Assim a remoção vale no refresh do token.
    function claimOrLegacy(claim, legacyRoles) {
      return signedIn()
        && (request.auth.token.get(claim, false) == true
          || (!(claim in request.auth.token) && role() in legacyRoles));
    }

    function hasMinistryClaim() {
      return claimOrLegacy('hasMinistry', ['member', 'admin']);
    }

    function canReadCatalog() {
      return isAppAdminClaim() || hasMinistryClaim();
    }

    function canUploadSong() {
      return isAppAdminClaim() || claimOrLegacy('canUploadSong', ['admin']);
    }
```

Blocos do catálogo:

```
    match /artists/{id} {
      allow read: if canReadCatalog();
      allow write: if false;
    }

    match /songs/{songId} {
      allow read: if canReadCatalog();
      allow create: if canUploadSong() && validSong(request.resource.data, songId);
      allow update, delete: if false;

      match /arrangements/{slug} {
        allow read: if canReadCatalog();
        // Tom feito à mão: quem sobe cifra. Tom gerado: qualquer membro (tem ministério).
        allow create: if (request.resource.data.source == 'handmade' ? canUploadSong() : hasMinistryClaim())
          && existsAfter(/databases/$(database)/documents/songs/$(songId))
          && validArrangement(request.resource.data, songId, slug);
        allow update, delete: if false;
      }
    }

    match /songLyrics/{songId} {
      allow read: if canReadCatalog();
      allow create: if canUploadSong()
        && existsAfter(/databases/$(database)/documents/songs/$(songId))
        && validLyrics(request.resource.data, songId);
      allow update, delete: if false;
    }
```

Conferir com `git grep -n "isEditor\|isAdmin()" firestore.rules`: nenhuma ocorrência depois da tarefa.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `firestore.rules`, `tests/rules/firestore.rules.test.ts`. Mensagem sugerida: `feat(rules): catálogo por claims de ministério e de subida de cifra`.

Nota de validação: o plano usa `!(claim in request.auth.token)`. Se o emulador não aceitar `in` sobre o token, trocar por `!(request.auth.token.keys().hasAny([claim]))` e registrar no PR.

---

### Task 5: Storage por claims (`songs/` e `pads/`)

**Arquivos:**
- Modificar: `storage.rules`
- Modificar: `tests/rules/storage.rules.test.ts`

- [ ] **Passo 1: testes que falham**

Acrescentar em `tests/rules/storage.rules.test.ts` um `describe('Storage por claims (pacote)')`, reusando o seed de PDF que o arquivo já cria com `withSecurityRulesDisabled` (ajustar o caminho do seed ao que existir):

```ts
describe('Storage por claims (pacote)', () => {
  it('membro com hasMinistry lê o catálogo', async () => {
    const st = env.authenticatedContext('m', { role: 'viewer', hasMinistry: true }).storage();
    await assertSucceeds(getBytes(ref(st, 'songs/s1/C-abc.pdf')));
  });

  it('removido (hasMinistry falso) não lê, mesmo com role member', async () => {
    const st = env.authenticatedContext('r', { role: 'member', hasMinistry: false }).storage();
    await assertFails(getBytes(ref(st, 'songs/s1/C-abc.pdf')));
  });

  it('membro com hasMinistry sobe o PDF gerado', async () => {
    const st = env.authenticatedContext('m', { role: 'viewer', hasMinistry: true }).storage();
    await assertSucceeds(
      uploadBytes(ref(st, 'songs/s1/D-gerado.pdf'), pdfBytes(), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'm' },
      }),
    );
  });

  it('pessoa sem ministério não sobe', async () => {
    const st = env.authenticatedContext('v', { role: 'viewer', hasMinistry: false }).storage();
    await assertFails(
      uploadBytes(ref(st, 'songs/s1/E-x.pdf'), pdfBytes(), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'v' },
      }),
    );
  });

  it('admin da app sobe sem ministério', async () => {
    const st = env.authenticatedContext('chefe', { appAdmin: true }).storage();
    await assertSucceeds(
      uploadBytes(ref(st, 'songs/s1/F-x.pdf'), pdfBytes(), {
        contentType: 'application/pdf',
        customMetadata: { uploadedBy: 'chefe' },
      }),
    );
  });

  it('token antigo com role member lê pelo legado', async () => {
    const st = env.authenticatedContext('old', { role: 'member' }).storage();
    await assertSucceeds(getBytes(ref(st, 'songs/s1/C-abc.pdf')));
  });
});
```

`pdfBytes()` é o helper de bytes de PDF sintético que o arquivo já usa (ou um `new Uint8Array([0x25, 0x50, 0x44, 0x46])`).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`. Esperado: "removido com role member" passa hoje e deve falhar.

- [ ] **Passo 3: regra**

Em `storage.rules`, substituir `isEditor()` por:

```
    // Claim novo manda; token sem o claim usa o role legado até a limpeza (#137).
    function hasMinistryClaim() {
      return request.auth != null
        && (request.auth.token.get('appAdmin', false) == true
          || request.auth.token.get('hasMinistry', false) == true
          || (!('hasMinistry' in request.auth.token)
            && request.auth.token.get('role', 'viewer') in ['member', 'admin']));
    }
```

Trocar `isEditor()` por `hasMinistryClaim()` em `songs/**` (read e create) e em `pads/{version}/{fileName}` (read). O restante do arquivo fica igual.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `storage.rules`, `tests/rules/storage.rules.test.ts`. Mensagem sugerida: `feat(storage): leitura e envio de cifras e pads por ministério`.

---

### Task 6: Matriz de acesso do spec §4.4 (consolidação)

**Por quê:** o spec exige, no `test:rules`, a matriz: sem ministério, membro de A lendo B, membro, admin do ministério, admin da app sem vínculo, removido e deslogado. Esta tarefa fecha a matriz; os casos já escritos nas Tarefas 3 a 5 entram como referência.

**Arquivos:** modificar `tests/rules/ministerios.rules.test.ts` (novo `describe('matriz de acesso (§4.4)')`).

- [ ] **Passo 1: escrever a matriz**

```ts
describe('matriz de acesso (§4.4)', () => {
  const REPERTORIO_A = 'ministries/a/setlists/s1';

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, REPERTORIO_A), validSetlistData());
      await setDoc(doc(db, 'ministries/b/setlists/s2'), validSetlistData());
      await setDoc(doc(db, 'ministries/a/members/membroA'), { uid: 'membroA', role: 'member' });
      await setDoc(doc(db, 'ministries/a/members/adminA'), { uid: 'adminA', role: 'admin' });
      await setDoc(doc(db, 'ministries/b/members/membroB'), { uid: 'membroB', role: 'member' });
      await setDoc(doc(db, 'ministries/a/members/removido'), { uid: 'removido', role: 'member' });
      await setDoc(doc(db, 'users/chefe'), { appAdmin: true, role: 'viewer' });
    });
  });

  it('sem ministério não lê repertório de A', async () => {
    const db = env.authenticatedContext('nobody', { hasMinistry: false }).firestore();
    await assertFails(getDoc(doc(db, REPERTORIO_A)));
  });

  it('membro de A lê repertório de A', async () => {
    const db = env.authenticatedContext('membroA', { hasMinistry: true }).firestore();
    await assertSucceeds(getDoc(doc(db, REPERTORIO_A)));
  });

  it('membro de A não lê repertório de B', async () => {
    const db = env.authenticatedContext('membroA', { hasMinistry: true }).firestore();
    await assertFails(getDoc(doc(db, 'ministries/b/setlists/s2')));
  });

  it('admin de A lê e grava repertório de A', async () => {
    const db = env.authenticatedContext('adminA', { hasMinistry: true, canUploadSong: true }).firestore();
    await assertSucceeds(getDoc(doc(db, REPERTORIO_A)));
    await assertSucceeds(updateDoc(doc(db, REPERTORIO_A), { label: 'Culto de domingo' }));
  });

  it('admin da app sem vínculo não lê nem grava repertório de A', async () => {
    const db = env.authenticatedContext('chefe', { appAdmin: true }).firestore();
    await assertFails(getDoc(doc(db, REPERTORIO_A)));
    await assertFails(setDoc(doc(db, 'ministries/a/setlists/novo'), validSetlistData()));
  });

  it('deslogado não lê repertório nem catálogo', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, REPERTORIO_A)));
    await assertFails(getDoc(doc(db, 'songs/s1')));
  });

  it('removido com token ainda com hasMinistry: negado pelo documento, na hora', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      deleteDoc(doc(ctx.firestore(), 'ministries/a/members/removido')),
    );
    const db = env.authenticatedContext('removido', { hasMinistry: true }).firestore();
    await assertFails(getDoc(doc(db, REPERTORIO_A)));
    await assertFails(getDoc(doc(db, 'setlists/s1')));
  });
});
```

- [ ] **Passo 2: rodar e ver o estado**

Run: `npm run test:rules`. Esperado: com as Tarefas 3 a 5 aplicadas, tudo verde. Qualquer vermelho aponta regra faltando.

- [ ] **Passo 3: ajuste**

Se um caso falhar, corrigir a regra, nunca o caso. Registrar a causa no PR.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `tests/rules/ministerios.rules.test.ts`. Mensagem sugerida: `test(rules): matriz de acesso dos ministérios`.

---
## Parte F: Functions do pacote

Grupo F roda em sequência (7 → 13) e não toca `firestore.rules` nem `storage.rules`. A Tarefa 13 é a única que mexe em `index.ts`.

### Task 7: Guards de papel pelo documento (`auth/guards.ts`)

**Por quê:** as callables do pacote conferem o papel pelo documento (`users/{uid}` e `ministries/*/members`), não pelo `role` do token. `requireRole` (que lê `users.role`) sai dos caminhos novos; o arquivo continua até a limpeza.

**Arquivos:**
- Criar: `apps/functions/src/auth/guards.ts`
- Criar: `apps/functions/src/auth/guards.test.ts`

- [ ] **Passo 1: teste que falha**

```ts
import { describe, expect, it } from 'vitest';
import {
  requireAppAdmin,
  requireCatalogContributor,
  requireMinistryMember,
  requireUploader,
  type GuardDeps,
} from './guards';

type Membership = { ministryId: string; role: 'member' | 'admin' };

function deps(
  users: Record<string, { appAdmin: boolean }>,
  memberships: Record<string, Membership[]>,
): GuardDeps {
  return {
    readUser: async (uid) => users[uid] ?? null,
    listMembershipsOfUser: async (uid) => memberships[uid] ?? [],
  };
}

const d = deps(
  { chefe: { appAdmin: true }, ana: { appAdmin: false }, adm: { appAdmin: false }, sem: { appAdmin: false } },
  { ana: [{ ministryId: 'hajaluz', role: 'member' }], adm: [{ ministryId: 'hajaluz', role: 'admin' }] },
);

describe('requireAppAdmin', () => {
  it('sem login: unauthenticated', async () => {
    await expect(requireAppAdmin(d, undefined)).rejects.toMatchObject({ code: 'unauthenticated' });
  });
  it('membro comum: permission-denied', async () => {
    await expect(requireAppAdmin(d, 'ana')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('admin da app: passa', async () => {
    await expect(requireAppAdmin(d, 'chefe')).resolves.toBeUndefined();
  });
});

describe('requireMinistryMember', () => {
  it('membro passa', async () => {
    await expect(requireMinistryMember(d, 'ana')).resolves.toBeUndefined();
  });
  it('admin da app sem vínculo é negado (hasMinistry é a regra)', async () => {
    await expect(requireMinistryMember(d, 'chefe')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('sem nenhum vínculo é negado', async () => {
    await expect(requireMinistryMember(d, 'sem')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('requireUploader (pode subir cifra)', () => {
  it('membro não sobe', async () => {
    await expect(requireUploader(d, 'ana')).rejects.toMatchObject({ code: 'permission-denied' });
  });
  it('admin de ministério sobe', async () => {
    await expect(requireUploader(d, 'adm')).resolves.toBeUndefined();
  });
  it('admin da app sobe sem ministério', async () => {
    await expect(requireUploader(d, 'chefe')).resolves.toBeUndefined();
  });
});

describe('requireCatalogContributor (tom gerado, descarte de upload)', () => {
  it('membro passa', async () => {
    await expect(requireCatalogContributor(d, 'ana')).resolves.toBeUndefined();
  });
  it('admin da app sem ministério passa', async () => {
    await expect(requireCatalogContributor(d, 'chefe')).resolves.toBeUndefined();
  });
  it('sem vínculo e sem app admin é negado', async () => {
    await expect(requireCatalogContributor(d, 'sem')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/auth`. Esperado: falha de importação (`./guards` não existe).

- [ ] **Passo 3: implementação**

Criar `apps/functions/src/auth/guards.ts`:

```ts
import { HttpsError } from 'firebase-functions/v2/https';

/** Leituras de documento que os guards usam. MinistryDeps já satisfaz este tipo. */
export type GuardDeps = {
  readUser(uid: string): Promise<{ appAdmin: boolean } | null>;
  listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: 'member' | 'admin' }>>;
};

function signedIn(uid: string | undefined): string {
  if (!uid) throw new HttpsError('unauthenticated', 'Login required.');
  return uid;
}

async function isAppAdmin(deps: GuardDeps, uid: string): Promise<boolean> {
  return (await deps.readUser(uid))?.appAdmin === true;
}

/** Só admin da app. Confere `users/{uid}.appAdmin`, nunca o token. */
export async function requireAppAdmin(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if (!(await isAppAdmin(deps, id))) {
    throw new HttpsError('permission-denied', 'Só o admin da app pode fazer isso.');
  }
}

/** Tem vínculo com pelo menos um ministério (hasMinistry). Admin da app sem vínculo fica de fora. */
export async function requireMinistryMember(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if ((await deps.listMembershipsOfUser(id)).length === 0) {
    throw new HttpsError('permission-denied', 'Só quem tem ministério pode fazer isso.');
  }
}

/** Pode subir cifra: admin de algum ministério ou admin da app (canUploadSong). */
export async function requireUploader(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if (await isAppAdmin(deps, id)) return;
  if ((await deps.listMembershipsOfUser(id)).some((m) => m.role === 'admin')) return;
  throw new HttpsError('permission-denied', 'Só admin pode subir cifra.');
}

/** Contribui com o catálogo sem ser admin: tem ministério ou é admin da app (Storage songs/ e tom gerado). */
export async function requireCatalogContributor(deps: GuardDeps, uid: string | undefined): Promise<void> {
  const id = signedIn(uid);
  if (await isAppAdmin(deps, id)) return;
  if ((await deps.listMembershipsOfUser(id)).length > 0) return;
  throw new HttpsError('permission-denied', 'Só quem tem ministério pode fazer isso.');
}
```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/auth`. Esperado: verde (o `requireRole.test.ts` existente continua verde, porque o arquivo não muda).

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/auth/guards.ts`, `apps/functions/src/auth/guards.test.ts`. Mensagem sugerida: `feat(functions): guards de papel pelo vínculo e pelo appAdmin`.

---

### Task 8: Pedido de entrada: checagens dentro da transação (item 8c da #135)

**Por quê:** `requestAccess` lê vínculo e pedidos de outros ministérios **antes** da transação (`requests.ts`, linhas 13 a 26). Uma corrida pode gerar dois pedidos pendentes. Pelo spec, a checagem tem que estar na mesma transação que a gravação.

**Arquivos:**
- Modificar: `apps/functions/src/ministries/deps.ts` (`MinistryTx` ganha as duas leituras de grupo)
- Modificar: `apps/functions/src/ministries/adminDeps.ts` (implementar essas leituras dentro da transação com `tx.get(query)`)
- Modificar: `apps/functions/src/ministries/requests.ts` (checagens dentro de `runTransaction`)
- Modificar: `apps/functions/src/ministries/fakeDeps.ts` e `requests.test.ts`

- [ ] **Passo 1: teste que falha**

Em `requests.test.ts`, acrescentar:

```ts
it('lê vínculos e pedidos de outros ministérios dentro da transação, antes de gravar', async () => {
  const deps = createFakeMinistryDeps({ 'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' } });
  await requestAccess(deps, 'ana', { ministryId: 'hajaluz' });
  expect(deps.log.indexOf('tx:listMembershipsOfUser')).toBeLessThan(deps.log.indexOf('tx:write'));
  expect(deps.log.indexOf('tx:listPendingRequestsOfUser')).toBeLessThan(deps.log.indexOf('tx:write'));
});

it('pedido recusado não impede novo pedido, inclusive para o mesmo ministério', async () => {
  const deps = createFakeMinistryDeps({
    'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    'ministries/hajaluz/requests/ana': { uid: 'ana', status: 'rejected' },
  });
  await expect(requestAccess(deps, 'ana', { ministryId: 'hajaluz' })).resolves.toEqual({ ministryId: 'hajaluz', status: 'pending' });
});

it('pedido pendente em outro ministério bloqueia o novo, mesmo quando a leitura é feita na transação', async () => {
  const deps = createFakeMinistryDeps({
    'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    'ministries/outro': { name: 'Outro', city: 'Sumaré' },
    'ministries/outro/requests/ana': { uid: 'ana', status: 'pending' },
  });
  await expect(requestAccess(deps, 'ana', { ministryId: 'hajaluz' })).rejects.toMatchObject({ code: 'failed-precondition' });
});
```

`createFakeMinistryDeps` precisa expor `log: string[]` (registro das leituras e escritas do `tx`). Acrescentar no `fakeDeps.ts` um `log` que empurra `tx:<método>` a cada leitura/escrita dentro de `runTransaction`. Os casos existentes de `requests.test.ts` continuam.

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/ministries/requests`. Esperado: o caso de ordem falha (leituras hoje estão fora da transação), e o caso de "recusado" pode falhar conforme a implementação atual.

- [ ] **Passo 3: implementação**

1. `deps.ts`: em `MinistryTx`, acrescentar
   ```ts
   listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: MembershipRole }>>;
   listPendingRequestsOfUser(uid: string): Promise<Array<{ ministryId: string }>>;
   ```
2. `adminDeps.ts`: no `runTransaction` de `createMinistryDeps`, o objeto `tx` implementa essas duas leituras com `tx.get(query)` (consulta de grupo por `uid`, a mesma de `listMembershipsOfUser` e `listPendingRequestsOfUser` fora da transação). Não há consulta nova: só muda onde ela roda.
3. `requests.ts`, `requestAccess`: remover as leituras de `listMembershipsOfUser` e `listPendingRequestsOfUser` que estão antes de `runTransaction` (linhas 13 a 26 hoje) e fazê-las como primeira coisa dentro de `tx`. Regra: `tx.listMembershipsOfUser(uid)` não vazio → `failed-precondition` ("Você já faz parte de um ministério."); `tx.listPendingRequestsOfUser(uid)` com `ministryId` diferente → `failed-precondition` ("Você já tem um pedido em outro ministério."); pedido `rejected` do mesmo ministério é sobrescrito; pedido `pending` do mesmo ministério devolve `pending` sem gravar de novo. Todas as leituras antes de qualquer `tx.write`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/ministries/requests src/ministries/adminDeps`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/ministries/{deps,adminDeps,requests,fakeDeps,requests.test}.ts`. Mensagem sugerida: `fix(functions): checagens do pedido de entrada dentro da transação`.

---

### Task 9: Aparelhos por vínculo no envio (`push/send.ts`, `push/adminDeps.ts`, `push/devices.ts`)

**Por quê:** `sendToDevices` filtra por `users.role` (member/admin). Pelo spec, o aviso só vai para quem é do ministério do repertório, e aparelho de quem não tem ministério nenhum é apagado. Aparelho de outro ministério não recebe **e não é apagado**.

**Arquivos:**
- Modificar: `apps/functions/src/push/types.ts` (`PushDeps` troca `RoleDeps` por `GuardDeps` e `getUserRoles` por `getUserMinistries`)
- Modificar: `apps/functions/src/push/adminDeps.ts`
- Modificar: `apps/functions/src/push/send.ts` (`SendInput.ministryId`; bloco de filtro)
- Modificar: `apps/functions/src/push/devices.ts` (`requireMinistryMember` no lugar de `requireRole`)
- Modificar: `apps/functions/src/push/fakeDeps.ts`, `send.test.ts`, `devices.test.ts`

- [ ] **Passo 1: testes que falham**

Em `send.test.ts`, acrescentar (o `fakeDeps` ganha `ministries: Record<uid, string[]>` e `getUserMinistries` devolve `Map<uid, Set<mid>>`):

```ts
it('envia só aos aparelhos de quem é do ministério do repertório', async () => {
  const deps = fakeDeps({
    devices: [device('t-a', 'ana'), device('t-b', 'bia')],
    ministries: { ana: ['hajaluz'], bia: ['outro'] },
  });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz' });
  expect(sentTokens(deps.calls)).toEqual(['t-a']);
});

it('não apaga aparelho de quem é de outro ministério', async () => {
  const deps = fakeDeps({ devices: [device('t-b', 'bia')], ministries: { bia: ['outro'] } });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz' });
  expect(deps.deleted).toEqual([]);
});

it('apaga aparelho de quem não tem ministério nenhum', async () => {
  const deps = fakeDeps({ devices: [device('t-x', 'saiu')], ministries: {} });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz' });
  expect(deps.deleted).toEqual(['t-x']);
});

it('sem ministryId (teste de aparelho) envia a qualquer membro', async () => {
  const deps = fakeDeps({ devices: [device('t-b', 'bia')], ministries: { bia: ['outro'] } });
  await sendToDevices(deps, { ...BASE, onlyUid: 'bia', respectSwitch: false });
  expect(sentTokens(deps.calls)).toEqual(['t-b']);
});
```

`BASE` é o objeto de entrada que o arquivo já usa para os casos de envio (título, corpo, link `/`, tag). `device(token, uid)` e `sentTokens` já existem em `fakeDeps.ts`.

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/push/send`. Esperado: falha (`ministryId` não existe; `getUserMinistries` não existe).

- [ ] **Passo 3: implementação**

1. `types.ts`: `PushDeps = GuardDeps & { ... }` (import de `../auth/guards`); remover `getUserRoles` e o `RoleDeps`; acrescentar
   ```ts
   getUserMinistries(uids: string[]): Promise<Map<string, Set<string>>>;
   ```
2. `adminDeps.ts`: implementar com `collectionGroup('members').where('uid', 'in', bloco)` em blocos de 30, mapeando `uid → Set<mid>` (`mid = d.ref.parent.parent?.id`). Reutilizar `readUser` e `listMembershipsOfUser` do `createMinistryDeps()` por spread, em vez de reimplementar. Código:
   ```ts
   const IN_BLOCK = 30;

   async function ministriesOfUids(uids: string[]): Promise<Map<string, Set<string>>> {
     const out = new Map<string, Set<string>>();
     const valid = [...new Set(uids)].filter((uid) => uid !== '' && !uid.includes('/'));
     const db = getFirestore();
     for (let start = 0; start < valid.length; start += IN_BLOCK) {
       const snap = await db
         .collectionGroup('members')
         .where('uid', 'in', valid.slice(start, start + IN_BLOCK))
         .get();
       for (const d of snap.docs) {
         const mid = d.ref.parent.parent?.id;
         const uid = String(d.data().uid ?? '');
         if (!mid || !uid) continue;
         const set = out.get(uid) ?? new Set<string>();
         set.add(mid);
         out.set(uid, set);
       }
     }
     return out;
   }
   ```
   E em `createPushDeps()`: `...createMinistryDeps()` (só `readUser` e `listMembershipsOfUser`), `getUserMinistries: ministriesOfUids`. Remover `getUserRoles` e o `ROLES` import.
3. `send.ts`: `SendInput` ganha `ministryId?: string; // repertório de um ministério: só aparelhos dele`. O bloco que usa `getUserRoles` vira:
   ```ts
   const selected = (await deps.listDevices()).filter((d) => matches(d, input));
   const uids = [...new Set(selected.map((d) => d.uid))];
   const ministries = await deps.getUserMinistries(uids);

   const stale: DeviceRecord[] = [];
   const senders: DeviceRecord[] = [];
   for (const d of selected) {
     const mine = ministries.get(d.uid);
     // Sem ministério nenhum: aparelho órfão, apagado. Outro ministério: não recebe, mas não é apagado.
     if (!mine || mine.size === 0) stale.push(d);
     else if (input.ministryId === undefined || mine.has(input.ministryId)) senders.push(d);
   }
   ```
4. `devices.ts`: `registerDevice` e `sendTestPush` trocam `requireRole(deps, uid, ['member', 'admin'])` por `await requireMinistryMember(deps, uid)` (import de `../auth/guards`). `unregisterDevice` continua como está.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/push`. Esperado: verde (inclui `devices.test.ts`; ajustar o caso "membro sem role" para "sem vínculo").

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/push/{types,adminDeps,send,devices,fakeDeps,send.test,devices.test}.ts`. Mensagem sugerida: `feat(push): avisos só para quem é do ministério do repertório`.

---

### Task 10: Gatilho e lembretes de repertório por ministério (`push/setlistTrigger.ts`, `announce.ts`, `rehearsal.ts`, `reminders.ts`, `reminderDeps.ts`)

**Por quê:** o gatilho passa a ouvir `ministries/{mid}/setlists/{sid}`; os lembretes consultam o grupo `setlists`. A raiz também entra no grupo, então só conta o documento cujo pai tem pai (`ref.parent.parent` não nulo).

**Arquivos:**
- Modificar: `apps/functions/src/push/setlistTrigger.ts`, `announce.ts`, `rehearsal.ts`, `reminders.ts`, `reminderDeps.ts`
- Modificar: `apps/functions/src/push/announce.test.ts`, `newSetlist.test.ts` (se mudar a assinatura), `reminders.test.ts`, `rehearsal.test.ts`, `setlistTrigger.test.ts`

- [ ] **Passo 1: testes que falham**

Em `announce.test.ts`:

```ts
it('envia o aviso de repertório novo só ao ministério do repertório', async () => {
  const deps = fakeDeps({ devices: [device('t-a', 'ana'), device('t-b', 'bia')], ministries: { ana: ['hajaluz'], bia: ['outro'] } });
  await announceNewSetlist(deps, 's1', 'hajaluz', undefined, NOVO_COM_4_MUSICAS);
  expect(sentTokens(deps.calls)).toEqual(['t-a']);
});
```

Em `reminders.test.ts`:

```ts
it('lembrete vai só ao ministério do ensaio', async () => {
  const deps = reminderFakeDeps({
    setlists: [{ id: 's1', ministryId: 'hajaluz', data: ENSAIO_AMANHA }],
    devices: [device('t-a', 'ana'), device('t-b', 'bia')],
    ministries: { ana: ['hajaluz'], bia: ['outro'] },
  });
  await runRehearsalReminders(deps);
  expect(sentTokens(deps.calls)).toEqual(['t-a']);
});
```

Em `reminderDeps.test.ts` (novo, com o fake do grupo): um documento na raiz (`parent.parent === null`) não entra na lista de ensaios.

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/push`. Esperado: falha por assinatura e por `ministryId` ausente.

- [ ] **Passo 3: implementação**

1. `setlistTrigger.ts`:
   ```ts
   export const onSetlistWritten = onDocumentWritten(
     {
       document: 'ministries/{ministryId}/setlists/{setlistId}',
       region: 'southamerica-east1',
       retry: false,
     },
     (event) =>
       announceNewSetlist(
         deps,
         event.params.setlistId,
         event.params.ministryId,
         event.data?.before.data(),
         event.data?.after.data(),
       ),
   );
   ```
   O comentário "Sem retry" e o trade-off permanecem.
2. `announce.ts`: `announceNewSetlist(deps, setlistId, ministryId, before, after)`; o `sendToDevices` recebe `ministryId`. Os ids de marca (`avisosEnviados/{setlistId}_novo`) não mudam.
3. `rehearsal.ts`: `RehearsalSetlist` ganha `ministryId: string`; `readRehearsalSetlist(id, ministryId, data)`.
4. `reminderDeps.ts`:
   ```ts
   listRehearsalSetlists: async (after, until) =>
     (
       await getFirestore()
         .collectionGroup('setlists')
         .where('rehearsalAt', '>', after)
         .where('rehearsalAt', '<=', until)
         .get()
     ).docs.flatMap((d) => {
       // O grupo também traz a raiz (`setlists` de primeiro nível), que não tem ministério.
       const ministryId = d.ref.parent.parent?.id;
       return ministryId ? [{ id: d.id, ministryId, data: d.data() }] : [];
     }),
   ```
   O comentário do arquivo passa a dizer que a consulta é por grupo e exige o índice de `rehearsalAt` do grupo (Tarefa 2 da Parte P).
5. `reminders.ts`: `listRehearsalSetlists` devolve `{ id, ministryId, data }`; o input de `sendToDevices` recebe `ministryId: setlist.ministryId`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/push`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: os listados no passo 3. Mensagem sugerida: `feat(push): gatilho e lembretes do repertório por ministério`.

---

### Task 11: Estatísticas por ministério (`stats/countUsage.ts`, `stats/statsDeps.ts`, `stats/getStats.ts`)

**Por quê:** `countSettledSetlists` e `getStats` leem o grupo `setlists` e gravam `ministryId` (hoje `'hajaluz'` fixo, da #135). `getStats` passa a servir o admin da app (cartões, ranking geral e um ministério opcional) e o admin de um ministério (só o ranking dele).

**Arquivos:**
- Modificar: `apps/functions/src/stats/countUsage.ts`, `statsDeps.ts`, `getStats.ts`
- Modificar: `countUsage.test.ts`, `getStats.test.ts`

- [ ] **Passo 1: testes que falham**

Em `countUsage.test.ts`:

```ts
it('grava o ministryId do repertório, não um valor fixo', async () => {
  const deps = usageFakeDeps({ settled: [{ id: 's1', ministryId: 'outro', date: '2026-11-20', songIds: ['a'] }] });
  await countSettledSetlists(deps);
  expect(deps.recorded).toEqual([expect.objectContaining({ setlistId: 's1', ministryId: 'outro' })]);
});
```

Em `getStats.test.ts`:

```ts
it('admin da app recebe cartões, ranking geral e o ranking do ministério escolhido', async () => {
  const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }), 'chefe', 'outro');
  expect(res.cards).not.toBeNull();
  expect(res.ministry?.id).toBe('outro');
});

it('admin do ministério recebe só o ranking dele, sem cartões gerais', async () => {
  const res = await getStatsForCaller(deps({ adm: { appAdmin: false } }, { 'adm|hajaluz': 'admin' }), 'adm', 'hajaluz');
  expect(res.cards).toBeNull();
  expect(res.ministry?.id).toBe('hajaluz');
});

it('membro comum e admin de outro ministério são negados', async () => {
  await expect(getStatsForCaller(deps({ ana: { appAdmin: false } }, { 'ana|hajaluz': 'member' }), 'ana', 'hajaluz')).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(getStatsForCaller(deps({ adm: { appAdmin: false } }, { 'adm|outro': 'admin' }), 'adm', 'hajaluz')).rejects.toMatchObject({ code: 'permission-denied' });
});

it('raiz de setlists não entra no uso', async () => {
  // grupo traz uma linha sem ministério (raiz): não conta
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/stats`. Esperado: falham (`getStatsForCaller` não existe; `ministryId` fixo).

- [ ] **Passo 3: implementação**

1. `countUsage.ts`: `SettledSetlist` ganha `ministryId: string`; `countSettledSetlists` grava `ministryId: setlist.ministryId`.
2. `statsDeps.ts`: `listSettledSetlists` usa `collectionGroup('setlists')` e descarta quem não tem `ref.parent.parent` (raiz); `listUsage` passa a trazer `ministryId: String(d.data().ministryId ?? '')`; `recordUsage` já recebe `ministryId`.
3. `getStats.ts`: `StatsResult` ganha `ministry: null | { id: string; name: string; topAllTime: TopSong[]; topLast30Days: TopSong[] }` e os cartões passam a ser opcionais para o caller de ministério. Nova função:
   ```ts
   export async function getStatsForCaller(
     deps: StatsDeps & { readUser(uid: string): Promise<{ appAdmin: boolean } | null>; readMembership(mid: string, uid: string): Promise<{ role: 'member' | 'admin' } | null>; readMinistry(mid: string): Promise<{ name: string } | null> },
     uid: string | undefined,
     ministryId: unknown,
   ): Promise<StatsResult> {
     if (!uid) throw new HttpsError('unauthenticated', 'Login required.');
     const mid = typeof ministryId === 'string' && ministryId !== '' ? ministryId : undefined;
     const caller = await deps.readUser(uid);
     if (caller?.appAdmin === true) {
       const general = await getStats(deps); // cartões + ranking geral, como hoje
       return { ...general, ministry: mid ? await rankingOf(deps, mid) : null };
     }
     if (!mid) throw new HttpsError('permission-denied', 'Só o admin da app vê as estatísticas gerais.');
     const membership = await deps.readMembership(mid, uid);
     if (membership?.role !== 'admin') throw new HttpsError('permission-denied', 'Só o admin do ministério vê este ranking.');
     return { cards: null, topAllTime: null, topLast30Days: null, ministry: await rankingOf(deps, mid) };
   }
   ```
   `rankingOf(deps, mid)` filtra `usage` por `ministryId === mid`, aplica `tally`/`rank` e `getSongs`. `getStats` (para o caller app admin) mantém os cálculos atuais. Os tipos de `cards` e `topAllTime` passam a ser `T | null` no ramo de ministério.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/stats`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/stats/{countUsage,statsDeps,getStats}.ts` e os testes. Mensagem sugerida: `feat(stats): estatísticas por ministério e geral só para o admin da app`.

---

### Task 12: Desliga o espelho (`ministries/mirror*.ts`)

**Por quê:** a raiz fica congelada (Tarefa 3) e o cliente novo grava só em `ministries/{mid}/setlists`. O espelho copiaria a raiz (parada) por cima do caminho novo se alguém editasse a raiz pelo cliente antigo. O deploy usa `--force`, então remover a exportação apaga a Function.

**Arquivos:**
- Remover: `apps/functions/src/ministries/mirror.ts`, `mirror.test.ts`, `mirrorTrigger.ts`

- [ ] **Passo 1: confirmar que nada mais importa o espelho**

Run: `git grep -n "mirror" -- apps/functions`. Esperado: só `index.ts` (export), `mirrorTrigger.ts` e os arquivos acima. Se aparecer outro uso, parar e avisar o orquestrador.

- [ ] **Passo 2: remover**

Run: `git rm apps/functions/src/ministries/mirror.ts apps/functions/src/ministries/mirror.test.ts apps/functions/src/ministries/mirrorTrigger.ts`. A remoção da exportação em `index.ts` acontece na Tarefa 13. Como a tarefa é só remoção, não há teste novo; o teste de regressão é o typecheck da Tarefa 13.

- [ ] **Passo 3: entrega**

Arquivos removidos. Mensagem sugerida (junto com a Tarefa 13): `chore(functions): desliga o espelho de setlists raiz`. Ao orquestrador: o release apaga a Function `mirrorSetlists` (o deploy usa `--force`); anotar no corpo do PR.

---

### Task 13: Cabeamento de `index.ts`

**Arquivos:** modificar `apps/functions/src/index.ts`.

- [ ] **Passo 1: teste de regressão de exportação**

Criar `apps/functions/src/index.exports.test.ts` lendo o texto do arquivo (sem importar o módulo, que chama `initializeApp`):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');

describe('exportações do pacote de ministérios', () => {
  it('não exporta o espelho nem setUserRole', () => {
    expect(src).not.toMatch(/mirrorSetlists/);
    expect(src).not.toMatch(/export const setUserRole/);
  });
  it('confere papel por guards, não por requireRole', () => {
    expect(src).not.toMatch(/requireRole\(/);
    expect(src).toMatch(/requireAppAdmin\(guardDeps/);
    expect(src).toMatch(/requireUploader\(guardDeps|requireCatalogContributor\(guardDeps/);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/index.exports`. Esperado: falha.

- [ ] **Passo 3: implementação**

Em `apps/functions/src/index.ts`:

1. Remover `import { requireRole } from './auth/requireRole';` e acrescentar:
   ```ts
   import {
     requireAppAdmin,
     requireCatalogContributor,
     type GuardDeps,
   } from './auth/guards';
   ```
2. Após `const ministryDeps = createMinistryDeps();`:
   ```ts
   const guardDeps: GuardDeps = {
     readUser: ministryDeps.readUser,
     listMembershipsOfUser: ministryDeps.listMembershipsOfUser,
   };
   ```
3. Remover `export { mirrorSetlists } from './ministries/mirrorTrigger';`.
4. Trocar `import { changeUserRole, createUserProfile, type UserDeps } from './users';` por `import { createUserProfile, type UserDeps } from './users';` e remover o `export const setUserRole` inteiro. O código de `changeUserRole` fica em `users.ts` até a limpeza (sem export).
5. Trocar as guardas:
   - `replaceArrangement`: `await requireCatalogContributor(guardDeps, uid);` (decisão em "Pontos em aberto", item 1)
   - `discardUpload`: `await requireCatalogContributor(guardDeps, uid);`
   - `updateSongMeta`, `deleteArrangement`, `deleteSong`: `await requireAppAdmin(guardDeps, request.auth?.uid);`
6. `getStats`:
   ```ts
   export const getStats = onCall({ region: REGION }, (request) =>
     getStatsForCaller(
       { ...statsDeps, readUser: guardDeps.readUser, readMembership: ministryDeps.readMembership, readMinistry: ministryDeps.readMinistry },
       request.auth?.uid,
       (request.data ?? {}).ministryId,
     ),
   );
   ```
   Trocar o import de `getStatsForAdmin` por `getStatsForCaller`.
7. `pushDeps`/`registerDevice`/`sendTestPush` seguem como estão (o `createPushDeps` já traz `readUser` e `listMembershipsOfUser`; ver Tarefa 9).

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/index.exports`; depois `npm run typecheck -w @cifras/functions`; depois `npx eslint apps/functions/src/index.ts apps/functions/src/auth apps/functions/src/push apps/functions/src/stats apps/functions/src/ministries`. Esperado: tudo verde.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/index.ts`, `apps/functions/src/index.exports.test.ts`. Mensagem sugerida: `feat(functions): guards por documento e exportações do pacote`.

---

## Parte D: design e tokens

### Task 14: Tokens novos, classes e design-system

**Bloqueio:** os valores em hex dos tokens novos (`--color-scrim`, tile de ministério, contador âmbar, selo "Admin da app", pílula Sim/Não) vêm do **Paper**, validado pela pessoa. O tech-lead não lê o Paper nesta etapa. Antes desta tarefa, o `designer` registra os valores (tema claro e escuro) na tabela do Paper e no texto de entrega. Sem valor, a tarefa não começa (AGENTS: não inventar cor).

**Arquivos:** modificar `apps/web/src/ui/styles.css` (tokens nos dois temas e classes das telas novas) e `docs/design-system.md` (linhas na tabela de tokens, no mesmo formato de `--color-bg`).

- [ ] **Passo 1: confirmar o teste de tokens**

Run: `npm run test:harness` (confere que todo token de `styles.css` está em `docs/design-system.md`). Esperado: verde hoje; vai falhar assim que um token novo entrar só no CSS.

- [ ] **Passo 2: adicionar tokens nos dois temas**

Em `styles.css`, acrescentar no `:root` (tema claro) e no bloco do tema escuro, com os valores do Paper:

```css
--color-scrim: <valor do Paper, claro>;        /* fundo atrás de diálogos e confirmações */
--color-tile: <valor do Paper, claro>;         /* ícone de ministério (quadrado de iniciais) */
--color-counter: <valor do Paper, claro>;      /* contador âmbar: pedidos pendentes */
--color-admin-app: <valor do Paper, claro>;    /* selo "Admin da app" */
--color-pill-yes: <valor do Paper, claro>;     /* pílula "Sim" */
--color-pill-no: <valor do Paper, claro>;      /* pílula "Não" */
```

Cada um com o par escuro correspondente do Paper. Nenhum `#hex` solto fora de `styles.css`.

- [ ] **Passo 3: classes das telas**

Classes com nomes em inglês e os tokens acima: `.ministry-tile`, `.counter-badge`, `.badge-admin-app`, `.pill-yes`, `.pill-no`, `.scrim`. Raios, espaçamentos e tipografia vêm dos tokens já existentes (não criar medidas novas sem o Paper).

- [ ] **Passo 4: documentar**

Em `docs/design-system.md`, uma linha por token novo na tabela (`| --color-scrim | <claro> | <escuro> | <uso> |`), com o mesmo formato da tabela atual.

- [ ] **Passo 5: rodar e entregar**

Run: `npm run test:harness`. Esperado: verde. Arquivos: `apps/web/src/ui/styles.css`, `docs/design-system.md`. Mensagem sugerida: `feat(ui): tokens e classes das telas de ministério`.

---

## Parte W: cliente (`apps/web`)

Regras de implementação desta parte:
- Cada tarefa começa pelos testes (Vitest + Testing Library, com `fakeGateway` e os fakes de `apps/web/src/test/`). A UI segue `docs/design-system.md` e os artboards do Paper (34 a 50 e L11 a L13). O frontend lê cada artboard com `get_jsx` antes de escrever markup; o plano fixa textos, estados e contratos, não o JSX.
- Textos de UI são os deste plano; qualquer texto novo vai no PR para o `product-owner` conferir.
- Nenhuma tela acessa catálogo, repertório ou Storage antes de `access === 'granted'`.

### Task 15: Auth: claims, vínculo e ministério atual (`auth/*`)

**Arquivos:** modificar `auth/AuthProvider.tsx`, `auth/gateway.ts`, `auth/roles.ts`, `auth/useAuth.ts`; criar `auth/permissions.ts`; modificar `auth/AuthProvider.test.tsx`, `auth/gateway.test.ts`, `test/fakeGateway.ts`.

- [ ] **Passo 1: testes que falham (`AuthProvider.test.tsx`)**
  - sem vínculo e sem claim: `access === 'blocked'`, `ministry === null`;
  - vínculo observado e claim `hasMinistry` falso: o provedor chama `refreshToken()` uma vez e relê os claims;
  - claim `hasMinistry` verdadeiro: `access === 'granted'` e `ministry` com `name`/`city` do documento `ministries/{mid}`;
  - `appAdmin` true sem vínculo: `access === 'granted'`, `ministry === null`;
  - vínculo que some (lista de não vazia para vazia): chama `forgetLocalData()` uma vez;
  - `role` não existe mais em `AuthState`.
- [ ] **Passo 2: rodar e ver falhar** (`npm run test -w @cifras/web -- src/auth`).
- [ ] **Passo 3: implementação**
  - `gateway.ts`: `getClaims()` substitui `getClaimRole()`; novos `onMemberships`, `onMinistry`, `forgetLocalData` (contrato C5). `onUserDoc` entrega `{ appAdmin }`.
  - `AuthProvider.tsx`: três fontes (sessão, claims, vínculos). Sincronia: quando `(vínculos.length > 0) !== claims.hasMinistry` ou `profile.appAdmin !== claims.appAdmin`, chama `refreshToken()` (uma vez por mudança, como o `syncClaim` atual) e relê `getClaims()`. `access` vale `granted` quando `claims.hasMinistry || claims.appAdmin`. Quando a lista de vínculos passa de não vazia para vazia, chama `forgetLocalData()`.
  - `useAuth.ts` e `permissions.ts`: tipos e predicados do contrato C4.
  - `roles.ts`: mantém `Role` e `isRole` só se ainda houver quem importe (ver grep na Tarefa 26); `canEdit`, `isAdmin`, `canEditSetlists` saem.
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: entrega.** Mensagem sugerida: `feat(web): vínculo e claims no provedor de sessão`.

### Task 16: Dados de ministérios no cliente (`ministries/ministriesApi.ts`)

**Arquivos:** criar `apps/web/src/ministries/ministriesApi.ts` e `ministriesApi.test.ts` (contrato C6).

- [ ] **Passo 1: testes:** lista ordenada por nome; busca normalizada (sem acento, sem maiúscula) em `nameNormalized`; `subscribeMyRequests` filtra por `uid` (consulta de grupo); `countPending` usa `status == 'pending'`; cada callable é chamada com a chave de C3; falha depois de gravar mostra "Não foi possível concluir. Tente de novo." (o teste simula erro de rede depois do `ok`).
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação** com `collection`, `collectionGroup`, `query`, `where`, `getCountFromServer` do Firestore SDK e `httpsCallable` das callables. Normalização: a mesma `normalizeForSearch` de `functions/src/ministries/model.ts`, copiada para `apps/web/src/ministries/normalize.ts` (testada) — não importar entre pacotes.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(web): API de ministérios e pedidos`.

### Task 17: Entrada (quem não tem ministério)

**Arquivos:** criar `apps/web/src/ministries/entry/EntryPage.tsx` (+ `EntryChoose.tsx`, `EntryConfirm.tsx`, `EntrySent.tsx`, `EntryRejected.tsx`) e testes; modificar `routes/RequireAccess.tsx` e `routes/RequireAccess.test.tsx`; modificar `routes/LoginPage.tsx` (nota do login); remover `routes/AccessPending.tsx` e `routes/AccessPending.test.tsx`.

Textos exatos (pt-BR):
- Escolha: título "Escolha seu ministério"; campo "Buscar ministério…"; linhas "Nome · Cidade"; vazio "Nenhum ministério encontrado".
- Confirmar: "Pedir para entrar em <Nome>?", botão "Confirmar pedido", "Voltar".
- Pedido enviado: "Pedido enviado"; "Um admin de <Nome> precisa aprovar."; "Conta: <e-mail>"; botões "Cancelar pedido" (volta para a busca) e "Sair".
- Pedido recusado: "Seu pedido para <Nome> não foi aprovado."; a pessoa pode escolher de novo (inclusive o mesmo).
- Removido (copy **proposta, a confirmar**): "Você não faz mais parte de <Nome>." e volta para "Escolha seu ministério".
- Nota do login (`LoginPage`): "Quem entra pela primeira vez escolhe o ministério e pede para entrar. Um admin aprova."

Estados: carregando (`role="status"`, "Carregando…"), erro ("Não foi possível carregar. Tente de novo.").

- [ ] **Passo 1: testes que falham.** `RequireAccess`: com `access === 'checking'` mostra "Carregando…"; com `blocked` mostra `EntryPage` e **não** monta provedores de dados (o teste registra que `SetlistsProvider` não foi montado); com `granted` renderiza o `Outlet`. Entrada: pedido pendente em `subscribeMyRequests` mostra "Pedido enviado"; `rejected` mostra "Pedido recusado"; "Cancelar pedido" chama `cancelMinistryRequest` com `{ ministryId }`.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação** conforme os textos acima; `RequireAccess` troca `AccessPending` por `EntryPage`.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(web): entrada com escolha e pedido de ministério`.

### Task 18: Repertórios no ministério atual (`setlists/*`)

**Arquivos:** modificar `setlists/setlistApi.ts`, `setlists/ActiveSetlistProvider.tsx`, `setlists/SetlistsProvider.tsx`, `setlists/SetlistRoute.tsx`, `setlists/SetlistPage.tsx`, `setlists/NextCultoCard.tsx`, `setlists/SetlistsTab.tsx` e os testes correspondentes (`setlistApi.firebase.test.ts` inclusive).

Contrato da API: `createSetlistApi(services, { ministryId, hostname? })`. Todos os caminhos passam por:

```ts
const setlistsCol = (ministryId: string) => collection(db, 'ministries', ministryId, 'setlists');
const setlistRef = (ministryId: string, id: string) => doc(db, 'ministries', ministryId, 'setlists', id);
```

- [ ] **Passo 1: testes que falham:** `subscribeSetlists` lê `ministries/{mid}/setlists` (não a raiz); `subscribeSetlist` de id que não existe no ministério devolve `setlist: null` e a tela mostra "Repertório não encontrado"; `updateSetlistMeta` e `applyOp` gravam no caminho do ministério; `deleteSetlist` idem. Teste do emulador (`setlistApi.firebase.test.ts`): repertório de outro ministério não aparece na lista.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação.** A API recebe `ministryId`; quem cria a API é o escopo de ministério da Tarefa 25. `ActiveSetlistProvider` lê o id de `/repertorios/:id` ou `?repertorio=`, como hoje, e não muda o formato do link (links antigos continuam abrindo no ministério atual). `SetlistPage`: `editable = canEditSetlist(auth) && !removed`. Textos: "Repertório não encontrado" (já existe na tela; manter).
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(setlists): repertórios no ministério atual`.

### Task 19: Viewer: Mudar tom para todos, "Gerenciar" só admin da app (`viewer/*`)

**Arquivos:** modificar `viewer/ViewerPage.tsx`, `viewer/ManageMenu.tsx`, `viewer/useViewerSetlist.ts`, `viewer/ViewerRoute.tsx` e os `ViewerPage.*.test.tsx`.

- [ ] **Passo 1: testes:** membro vê "Mudar tom" (`canChangeKey`) e não vê "Gerenciar"; admin do ministério também não vê "Gerenciar"; admin da app vê "Gerenciar" (apagar cifra, corrigir nome e cantor); pessoa sem ministério não abre o viewer (fica na entrada); `repertorio=` de outro ministério mostra "Repertório não encontrado".
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação:** `canChange = canChangeKey(auth)`; `admin = canManageSongs(auth)`; `ManageMenu` só com `admin`. Nenhum outro comportamento muda.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(viewer): tom para todo membro e gerenciar só para admin da app`.

### Task 20: Busca: "＋ Nova cifra" e aba Repertórios (`search/HomePage.tsx`, `routes/RequireRole.tsx`)

**Arquivos:** modificar `search/HomePage.tsx` e `HomePage.test.tsx`; modificar `routes/RequireRole.tsx` (e criar `routes/RequireRole.test.tsx`).

- [ ] **Passo 1: testes:** "＋ Nova cifra" só com `canUpload`; aba "Repertório" só com `canListSetlists`; botão de novo repertório só com `canEditSetlist`; `RequireRole` redireciona para `/` quando não permitido.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação.** `RequireRole` passa a receber `when: 'upload' | 'appAdmin' | 'ministryAdmin'` e usa os predicados de `permissions.ts`:
  ```tsx
  export function RequireRole({ when }: { when: 'upload' | 'appAdmin' | 'ministryAdmin' }) {
    const auth = useAuth();
    const ok = when === 'upload' ? canUpload(auth) : when === 'appAdmin' ? isAppAdmin(auth) : isMinistryAdmin(auth);
    return ok ? <Outlet /> : <Navigate to="/" replace />;
  }
  ```
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(search): nova cifra e repertórios conforme o papel`.

### Task 21: Mais e Avisos (`more/MaisPage.tsx`, `push/PushProvider.tsx`, `push/AvisosCard.tsx`)

**Arquivos:** modificar `more/MaisPage.tsx`, `more/MaisPage.test.tsx`, `push/PushProvider.tsx`, `push/AvisosCard.tsx` e os testes correspondentes.

Estrutura (pela ordem do Paper, a confirmar): perfil (nome, e-mail, selo de papel: "Haja Luz · Admin", "Haja Luz · Membro", "Admin da app" em pílula própria); bloco do admin do ministério: "Pessoas do ministério" (com contador de pedidos pendentes), "Estatísticas do ministério", "Importar" (só com `canUpload`); bloco comum: "Avisos" (membro com vínculo) e "Sair"; bloco da app: "Gestão" com contador de pedidos pendentes de todos (só `isAppAdmin`).

- [ ] **Passo 1: testes:** cada linha aparece ou não conforme o predicado; contadores vêm de `countPending` e `countPendingAll`; "Avisos" some para quem não tem vínculo; `PushProvider` elegível com `access === 'granted' && ministry !== null`.
- [ ] **Passo 2 a 5:** falhar, implementar, verde, mensagem sugerida `feat(mais): menu por papel no ministério e na app`.

### Task 22: Pessoas do ministério (`people/*`)

**Arquivos:** reescrever `people/PeoplePage.tsx` (aceita `ministryId`, usado por `/pessoas` e por `/gestao/ministerios/:mid`) e `people/peopleApi.ts` (passa a usar `ministriesApi`); testes em `people/PeoplePage.test.tsx`.

- [ ] **Passo 1: testes:** seção "Pedidos" com nome, e-mail e data; Aprovar e Recusar sem confirmação; seção "Membros" com selo "Admin" ou "Membro" e menu com "Tornar admin", "Tornar membro" e "Remover" (Remover pede confirmação); erro de callable mostra a mensagem do servidor (ex.: último admin) ou "Não foi possível concluir. Tente de novo." quando a falha veio depois de gravar; vazio "Nenhum pedido pendente".
- [ ] **Passo 2 a 5:** falhar, implementar, verde, mensagem sugerida `feat(people): pessoas do ministério (pedidos e membros)`.

### Task 23: Gestão (`gestao/*`)

**Arquivos:** criar `gestao/GestaoPage.tsx` (pedidos de todos os ministérios, com o nome do ministério de destino; Aprovar e Recusar ali mesmo), `gestao/MinistriesPage.tsx` (lista com nome, cidade, nº de membros e nº de pedidos; "+ Novo ministério" com nome e cidade, 1 a 60 caracteres depois de `trim()`), `gestao/MinistryDetailPage.tsx` (editar nome e cidade; reusa `PeoplePage` com `ministryId`), `gestao/AdminsPage.tsx` (lista de pessoas que já entraram, com pílula "Sim"/"Não" para admin da app; a própria linha desabilitada com "Você não pode alterar o próprio acesso").

Textos: "Gestão", "Ministérios", "Novo ministério", "Admins da app", "Nenhum ministério encontrado", "Você não pode alterar o próprio acesso".

- [ ] **Passo 1: testes:** cada tela com estados de carregando, vazio e erro; criação valida nome e cidade; a própria linha de "Admins da app" não tem ação; pedidos de todos aparecem com o ministério de destino.
- [ ] **Passo 2 a 5:** falhar, implementar, verde, mensagem sugerida `feat(gestao): pedidos, ministérios e admins da app`.

### Task 24: Estatísticas (`stats/*`)

**Arquivos:** modificar `stats/StatsPage.tsx`, `stats/statsApi.ts` e testes. Duas variantes: `/gestao/estatisticas` (app: cartões PDFs, Músicas, Armazenamento; ranking "mais usadas" geral; filtro "Ministério" com opção "Todos os ministérios") e `/estatisticas` (ministério: só o ranking do ministério atual).

- [ ] **Passo 1: testes:** cartões só na variante da app; filtro chama `getStats({ ministryId })`; a variante do ministério não mostra cartões; erro e vazio ("Ainda não há usos neste período").
- [ ] **Passo 2 a 5:** falhar, implementar, verde, mensagem sugerida `feat(stats): estatísticas da app e do ministério`.

### Task 25: Cabeamento do cliente (`App.tsx`, `bootstrap.tsx`, `routes/routes.test.tsx`)

**Arquivos:** modificar `App.tsx`, `bootstrap.tsx`, `routes/routes.test.tsx`.

- [ ] **Passo 1: teste de rotas:** a tabela C7 vira um teste: cada rota com seu papel; sem ministério, `/repertorios/x` cai na entrada; `/gestao/*` só para `appAdmin`; `/nova` e `/importar` só com `canUpload`.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação.** `App.tsx` ganha um `MinistryScope` que lê `auth.ministry`, cria `createSetlistApi(services, { ministryId })` com `useMemo` e entrega o `setlistApi` às rotas. `bootstrap.tsx` deixa de criar a API de repertórios global. As rotas seguem C7.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(web): rotas e escopo de ministério`.

---

## Parte E e X: E2E e documentação

### Task 26: E2E atualizado (`e2e/**`)

**Por quê:** AGENTS, "Definição de pronto": texto de UI mudou, então os specs E2E são atualizados no mesmo PR.

- [ ] **Passo 1: achar os textos e os seeds antigos.** Run: `git grep -n "Acesso ainda não liberado\|Quem entra pela primeira vez\|Pessoas e papéis\|role\|setlists\|AccessPending" -- apps e2e`. Listar cada ocorrência no PR.
- [ ] **Passo 2: escrever os specs novos primeiro** (falham até o cliente mudar):
  - `auth.spec.ts`: login sem vínculo cai em "Escolha seu ministério"; a nota do login é a nova;
  - `visitor.spec.ts`: "Pedido enviado" e "Cancelar pedido" no lugar de "Acesso ainda não liberado";
  - `setlists.spec.ts`: repertório criado no ministério aparece; repertório de outro ministério não;
  - `avisos*.spec.ts`: aviso de repertório novo só para quem é do ministério;
  - `people.spec.ts`: "Pessoas do ministério" com pedidos e membros; `manage.spec.ts`: "Gestão" só para admin da app;
  - `fixtures/emulator.ts`: seeds passam a `ministries/hajaluz/members` e `ministries/hajaluz/setlists`, com `users/{uid}.appAdmin`; claims novos (`hasMinistry`, `canUploadSong`, `appAdmin`).
- [ ] **Passo 3: implementação** só nos seeds e nos textos; nenhum teste E2E roda local (CI).
- [ ] **Passo 4: entrega.** Mensagem sugerida `test(e2e): ministérios no lugar do papel global`.

### Task 27: Documentação (`docs/sistema.md`, `docs/deploy.md`)

**Arquivos:** modificar `docs/sistema.md` (até cerca de 300 linhas, condensando o texto das seções afetadas) e `docs/deploy.md`.

- [ ] **Passo 1: restaurar os dois pontos pendentes da #135** (revisão de 23/11):
  - no contrato de `rehearsalAt` (hoje "Horas e datas em Brasília (UTC−3, sem horário de verão)"), escrever "(America/Sao_Paulo, sem horário de verão)";
  - no TTL de `avisosEnviados`, acrescentar "sem índice de campo". Run `git grep -n "avisosEnviados\|TTL" docs/sistema.md` para achar a linha exata.
- [ ] **Passo 2: atualizar `docs/sistema.md`:** telas (entrada, Mais, Pessoas do ministério, Gestão, Estatísticas), papéis (membro, admin do ministério, admin da app), dados (`ministries/*`, claims, `setlistUsage.ministryId`), Functions (guards; `setUserRole` e `mirrorSetlists` saem; `getStats` com `ministryId`), Storage (claims), e "Limites conhecidos e pendências" (ver Riscos, item 6).
- [ ] **Passo 3: atualizar `docs/deploy.md`:** índices de grupo novos (`setlists.date`, `setlists.rehearsalAt`) em "Ativado"; a Function `mirrorSetlists` é apagada no release; o site de teste tem Rules de produção; o teste com dados reais usa repertório "TESTE" criado e apagado pela pessoa.
- [ ] **Passo 4: conferir o tamanho:** `wc -l docs/sistema.md` (≤ 300).
- [ ] **Passo 5: entrega.** Mensagem sugerida `docs: sistema e deploy com ministérios`.

---

## Verificação final (orquestrador, depois da Tarefa 27)

Tudo filtrado, nunca a suíte inteira no agente:

- `npm run test:rules` (com Docker no Windows sem Java: `docker compose run --rm --no-deps emulators npm run test:rules`).
- `npm run test -w @cifras/functions -- src/auth src/push src/stats src/ministries src/songs src/users src/index.exports src/indexesConfig`.
- `npm run test -w @cifras/web -- src/auth src/ministries src/setlists src/viewer src/search src/more src/people src/stats src/routes src/push`.
- `npm run typecheck` e `npm run lint` (CI e orquestrador).
- `npm run build -w @cifras/functions` quando houver memória; senão fica para o CI.
- `npm run test:harness` (design tokens, Tarefa 14).
- E2E: só no CI.
- **Paper (designer, Sonnet):** atualizar os artboards 34 a 50 e L11 a L13 com o que foi desenvolvido (escuro; claro nas telas raiz). Se o MCP estiver indisponível: "Paper pendente: <o que>" no PR.
- Revisão: `code-reviewer` em cada grupo de commits (Rules, Functions, cliente, E2E, docs) e revisão final (Sonnet, high). Etiqueta `revisado` só sem pendência crítica nem importante; `qa-ok` quando o QA estiver verde; `teste-celular-ok` só com o "ok" da pessoa, registrado na Análise com a data.

---

## Pontos em aberto (decidir antes da execução)

1. **Quem regenera tom gerado.** O plano usa `requireCatalogContributor` em `replaceArrangement`: membro pode substituir o tom **gerado** (a Rules já permite criar tom gerado com `hasMinistry`); tom feito à mão continua bloqueado pela lógica existente. O spec (§3, "substituir tom gerado") diz só admin. Proposta: manter a proposta do plano, porque sem ela o "Mudar tom para todo membro" falha quando o tom já existe. Pedir "ok" à pessoa.
2. **Admin da app sem ministério e tom gerado.** O spec diz "tom gerado exige tem ministério", e o plano segue a letra: admin da app sem vínculo sobe cifra feita à mão, não gera tom. Confirmar.
3. **Texto do "Removido".** O spec não traz o texto. Proposta na Tarefa 17 ("Você não faz mais parte de <Nome>."). Confirmar com o `product-owner`.
4. **Linha "Pessoas · Em breve" em Mais.** Já existe (roteiro de músicos e disponibilidade) e colide com "Pessoas do ministério". Proposta: manter o nome "Pessoas" só para o ministério e mover a linha "Em breve" para outro nome (ex.: "Músicos"). Decidir no Paper.
5. **Forma de verificar `in` sobre o token nas Rules.** O plano usa `!('claim' in request.auth.token)`. Se o emulador recusar, usar `keys().hasAny`. Validar na Tarefa 4.
6. **Chaves de `setAppAdmin`.** Conferir em `ministries/admin.ts` antes da Tarefa 15 (C3 marca como "confirmar").
7. **Corrida na remoção de cache.** `forgetLocalData()` recarrega a página. Se o recarregamento falhar, a pessoa fica na tela de carregamento: o teste da Tarefa 15 cobre o caminho feliz; o caso de falha fica no PR.
8. **Callables antigas que saem.** `setUserRole` some do export. Clientes em cache que ainda chamam a tela Pessoas antiga recebem erro até recarregar (spec §7: cliente antigo em cache continua lendo até recarregar). Aceito; registrar no corpo do release.
9. **Paper como fonte dos valores.** O tech-lead não leu o Paper nesta etapa. Os textos e a estrutura de Mais e das telas vêm deste plano e do spec; os valores visuais (hex, espaçamento, ordem exata) vêm do Paper, lidos pelo frontend com `get_jsx`. O designer valida antes da Tarefa 14.

---

## Passos manuais da pessoa (ordem)

1. **Pré-entrega P** (Tarefas 1 e 2): release com merge commit, fora da janela (quinta e domingo, 16h30 às 23h59, bloqueados). Combinar com a pessoa.
2. **Firestore > Índices:** `members.uid`, `requests.uid` e `requests.status` (COLLECTION_GROUP, já da #135) e os novos `setlists.date` e `setlists.rehearsalAt` (COLLECTION_GROUP) em "Ativado". Esperar os minutos de criação.
3. **Migração da #135 já rodada e conferida** (`docs/deploy.md`): o teste no celular usa os dados reais da Haja Luz.
4. **Contas de teste:** uma conta Google sem ministério (entrada) e uma conta de membro da Haja Luz. A pessoa fornece ou cria.
5. **Teste no celular:** o orquestrador dispara `gh workflow run site-teste.yml --ref main -f branch=feat/136-ministerios-pacote -f issue=136` (ou a pessoa, por `docs/deploy.md`, se o workflow não estiver na `main`). Com a etiqueta `no-site-teste`, na vez da fila. Roteiro abaixo.
6. **Release do pacote** (merge commit do orquestrador, fora da janela): depois do "ok" de `teste-celular-ok`. Corpo do PR com passos, risco, volta e itens 7 e 8 abaixo.
7. **Pós-release:** confirmar no Firestore que a Function `mirrorSetlists` foi apagada (o deploy usa `--force`) e que `onSetlistWritten` observa `ministries/{mid}/setlists/{sid}`.
8. **Smoke em produção:** abrir `https://louvor-hajaluz.web.app` como membro e como admin da Haja Luz (repertórios, Mais, Pessoas do ministério) e com a conta sem ministério (vê só a entrada). O orquestrador confirma à mão.

## Riscos

1. **Teste no celular usa dados reais.** O site de teste grava na mesma base de produção. Pedir à pessoa para criar e apagar um repertório "TESTE" durante o teste.
2. **Pacote não testável no site de teste.** Rules e Functions do pacote só valem no release (spec §7). O teste cobre a interface com as Rules de produção; `test:rules` e o CI cobrem o resto. Por isso a pré-entrega P é obrigatória antes.
3. **Índice de grupo não ativo.** Pedido, vínculo e lembrete falham com `failed-precondition` até o índice ficar "Ativado". Passo 2 antes do teste.
4. **Espelho durante o teste.** Enquanto o pacote não sai, uma edição da raiz pelo cliente antigo é copiada para `ministries/hajaluz/setlists` e pode sobrescrever a edição feita no site de teste. Aceito; não editar repertório real durante o teste.
5. **Token até 1 h.** A remoção vale no refresh (o cliente força `getIdToken(true)` quando o vínculo muda). Entre a remoção e o refresh, Rules por documento (repertório) já negam. Catálogo e Storage dependem do claim, então valem após o refresh.
6. **Limites conhecidos (para `docs/sistema.md`).** O que o aparelho já baixou antes da remoção fica no cache (até o recarregamento). Cifra subida por admin da app sem ministério fica sem `createdInMinistry`. Um arquivo PDF pode ficar órfão no Storage se o cliente falhar entre o upload e a gravação do tom (o `discardUpload` cobre o caso comum).
7. **Pedidos em massa.** A migração criou pedidos pendentes para os visitantes de hoje (decisão do spec); a Haja Luz vai ver esses pedidos em Pessoas do ministério.
8. **Volta.** Reverter o release (merge da `develop` na `main`, nunca hotfix) e a regra de volta do spec §7: a versão antiga reabre os dados da raiz, e repertórios editados depois do pacote voltam ao estado de antes dele. Os dados em `ministries/` não atrapalham o app antigo.
9. **Tamanho do PR único.** Mais de 100 arquivos. Revisão por grupo de commits (Rules, Functions, cliente, E2E, docs).

## Roteiro de teste no celular (site de teste)

Conta de membro da Haja Luz, depois conta de admin da Haja Luz, depois conta sem ministério.

1. Membro: aba **Repertório** lista os repertórios do ministério; abrir um e ver os itens.
2. Membro: no repertório, **Mudar tom** de uma cifra; a mudança fica. "＋ Nova cifra" não aparece.
3. Membro: no viewer, não há "Gerenciar".
4. Admin da Haja Luz: criar repertório "TESTE Pacote", adicionar música, editar o nome, apagar. Depois apagar o repertório de teste.
5. Link antigo `/repertorios/<id>` (de um WhatsApp) abre o repertório da Haja Luz; um id inexistente mostra "Repertório não encontrado".
6. Mais, admin da Haja Luz: "Pessoas do ministério" com contador, "Estatísticas do ministério" (só ranking), "Importar", "Avisos", "Sair". Sem "Gestão".
7. Pessoas do ministério: aprovar e recusar um pedido da conta de teste (sem confirmação); tornar admin e voltar a membro; remover com confirmação.
8. Conta sem ministério: "Escolha seu ministério" → buscar → "Confirmar pedido" → "Pedido enviado" → "Cancelar pedido" → volta à busca. Pedir de novo; o admin aprova; **o app abre sozinho** (sem sair e entrar).
9. Pedido recusado: "Seu pedido para Haja Luz não foi aprovado." e a pessoa pode escolher de novo.
10. Admin remove a conta de teste; a conta cai em "Escolha seu ministério" sem sair.
11. Modo claro e escuro; teclado na busca; rotação do aparelho.

---

## Ordem de execução (resumo)

- Pré-entrega P: Tarefas 1, 2 → release → índices "Ativado".
- Pacote, em paralelo: lane R (3 → 6), lane F (7 → 13), lane D (14, depois dos valores do Paper).
- Lane W: 15 → 16 → 17 → 18; depois 19, 20, 21, 22, 23, 24 em paralelo; depois 25.
- E2E (26) depois de W; docs (27) depois de F e W; verificação final e Paper (seção própria, depois de 27).
- Teste no celular antes do merge; merge do pacote com merge commit, fora da janela.
