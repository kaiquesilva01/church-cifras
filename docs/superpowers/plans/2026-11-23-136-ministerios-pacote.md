# Ministérios: Pacote (#136) Implementation Plan

> **Para workers agentes:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Entregar para a pessoa, num release só, o uso do app por ministério: entrada pelo Google com pedido de entrada, cliente lendo e gravando repertórios em `ministries/{mid}/setlists`, Mais por papel, Pessoas do ministério, Gestão da app, Estatísticas por ministério, Rules e Functions que conferem os claims novos, avisos filtrados pelo vínculo e o espelho desligado.

**Architecture:** O documento de vínculo (`ministries/{mid}/members/{uid}`) é a verdade. Repertórios são protegidos por Rules que leem o documento (`exists()`/`get()`), catálogo e Storage leem o claim `hasMinistry`/`canUploadSong`/`appAdmin`, que as Functions recalculam do documento. O cliente observa o próprio vínculo por consulta de grupo (campo `uid`), força o refresh do token quando o claim diverge e limpa o cache local quando o vínculo some. O `role` antigo fica só como fallback para tokens sem o claim novo, até a limpeza (#137).

**Tech Stack:** TypeScript `strict`; React + React Router (`apps/web`); Cloud Functions v2 em `southamerica-east1`; firebase-admin 14; Vitest 5 (`apps/functions`, `apps/web`); `@firebase/rules-unit-testing` no emulador (`tests/rules`); Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-11-23-131-ministerios-design.md` (§3, §4.4, §4.5, §4.6 passo 2, §5, §6 item 2, §7, §8). Plano da Preparação, que este pacote consome: `docs/superpowers/plans/2026-11-23-135-ministerios-preparacao.md` (seção "Decisões tomadas na execução"). Referência visual e de textos: `docs/superpowers/plans/2026-11-23-136-paper-spec.md` (artboards 34 a 50 e L11 a L13 do Paper).

**Nomes que este plano fixa (vindos da #135):** claims `role`, `appAdmin`, `hasMinistry`, `canUploadSong`; documentos `ministries/{mid}`, `ministries/{mid}/members/{uid}`, `ministries/{mid}/requests/{uid}`, `ministries/{mid}/setlists/{sid}`, `setlistUsage/{sid}` com `ministryId`; id da Haja Luz `hajaluz`; campo `uid` em `members` e `requests` (cópia do id do documento). Workspaces: `@cifras/web` e `@cifras/functions`.

**Rodada de correção (23/11):** este plano incorpora as decisões do orquestrador (seção "Decisões", no fim) e as correções do pré-voo do backend. Tarefas do cliente (15 a 25) têm contrato, arquivos, textos e testes; as de código exato são 15, 17, 18 e 22.

---

## Restrições globais

- Não tocar `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md` (travas). A entrega não precisa mexer em nenhuma.
- Nenhum PDF, áudio ou e-mail real no repositório. Testes usam e-mails fictícios (`pessoa@exemplo.test`).
- Textos de UI e mensagens de erro para a pessoa em pt-BR; identificadores em inglês; commits em Conventional Commits, em inglês (o orquestrador commita).
- Texto marcado **(inferido)** no paper-spec ou neste plano vai no PR para o `product-owner` conferir.
- Toda mudança em Rules ou Functions passa por `npm run test:rules` antes do PR (spec §7). Sem Java no host: `docker compose run --rm --no-deps emulators npm run test:rules`.
- Testes filtrados, nunca a suíte inteira no agente: `npm run test -w @cifras/functions -- src/<pasta>` e `npm run test -w @cifras/web -- <caminho>`.
- Uso de `setCustomUserClaims`: substitui o objeto inteiro. Todo writer de claims passa os **quatro** campos (`buildClaims`).
- Limites do Firebase: consulta de grupo em `members` e `requests` usa índice de grupo já criado na #135; `setlists` ganha dois índices de grupo novos (Tarefa 2). Sem índice ativo, a consulta falha com `failed-precondition`. A criação de índice leva minutos.
- Não publicar nas quintas e domingos das 16h30 às 23h59 (America/Sao_Paulo). A migração já foi rodada na #135; este pacote não roda script.
- **Teste no celular obrigatório:** o pacote toca `apps/web/src/setlists/` e `apps/web/src/viewer/`. Espera o "ok" da pessoa, com `teste-celular-ok` no PR (AGENTS "Teste no celular").

---

## Recomendação de entrega: duas entregas

**Decisão: a pré-entrega P (Tarefas 1 e 2) e o pacote (Tarefas 3 a 27), cada um com PR próprio para a `develop`.**

1. **Pré-entrega P (Tarefas 1 e 2)**: PR próprio para a `develop`, corpo com `Parte de #136` (sem sub-issue para P), release próprio com merge commit, liberado **antes** do pacote. Motivo: o site de teste usa as Rules e Functions de produção (spec §7). Sem P em produção, o cliente novo não consegue ler o próprio vínculo nem o próprio pedido no site de teste (a Preparação só deixa ler `members`/`requests` pelo admin ou pela app admin), e o teste no celular cai em "sem acesso" para qualquer pessoa sem ministério. P é invisível para quem usa e cabe no AGENTS (entrega inteira, testada, sem mudança de interface).
2. **Pacote (Tarefas 3 a 27)**, branch `feat/136-ministerios-pacote`, **PR único** para a `develop`, aberto como rascunho cedo, com um commit por tarefa ou grupo. Motivo: Rules, Functions e cliente precisam sair juntos (o cliente novo lê o caminho novo; a raiz `setlists` fica só leitura; o espelho some). Dividir em PRs obriga uma branch de integração, que só agrega risco: o hook de Stop abre o release sempre que a `develop` difere da `main`. A revisão é por grupo de commits (R, F, D, W, E, X), não por PR.
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

Quem pode fazer o quê (decisões de 23/11):

| Ação | Quem pode |
| --- | --- |
| Ler catálogo (`songs`, `artists`, `arrangements`, `songLyrics`) e PDF em `songs/` | `hasMinistry` **ou** `appAdmin` |
| Criar tom **gerado** (PDF por sobreposição) | `hasMinistry` **ou** `appAdmin` (Rules e Storage) |
| Criar tom **feito à mão**, criar música, letra, `replaceArrangement` | `canUploadSong` (admin de ministério ou admin da app) |
| Mudar tom (ler o tom que existe) | todo membro (`hasMinistry`); o app só abre o tom |
| Apagar e corrigir cifra (`updateSongMeta`, `deleteArrangement`, `deleteSong`) | `appAdmin` |
| Repertório (ler e gravar em `ministries/{mid}/setlists`) | membro do `mid` (documento); gravar: admin do `mid` (documento). Claim não vale |

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

### C3. Callables (existem da #135; nomes fixos)

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
| `setAppAdmin` | `{ uid, appAdmin }` (confirmado em `apps/functions/src/ministries/admin.ts`) | admin da app; não altera o próprio |
| `getStats` | `{ ministryId? }` → `StatsCallerResult` (C8) | admin da app (`general` + `ministry` opcional) ou admin do `ministryId` (só `ministry`) |

Guarda de cada callable que já existe e muda neste pacote:

| Callable | Guarda (Tarefa 13) |
| --- | --- |
| `replaceArrangement` | `requireUploader` (canUploadSong) |
| `discardUpload` | `requireCatalogContributor` (hasMinistry ou appAdmin: quem sobe PDF gerado) |
| `updateSongMeta`, `deleteArrangement`, `deleteSong` | `requireAppAdmin` |
| `registerDevice`, `sendTestPush` | `requireMinistryMember` |
| `getStats` | `getStatsForCaller` (Tarefa 11) |
| `setUserRole` | **removida** (a tela Pessoas antiga sai) |

`changeUserRole` (em `users.ts`) só servia a `setUserRole`: sai junto (Tarefa 13), com os testes dele.

### C4. Contrato de `useAuth` (`apps/web/src/auth/useAuth.ts`)

```ts
export type MinistryRole = 'member' | 'admin';
export type CurrentMinistry = { id: string; name: string; city: string; role: MinistryRole };
export type AccessState = 'checking' | 'blocked' | 'granted';
export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  /** granted quando o token tem hasMinistry ou appAdmin; blocked caso contrário; checking até os claims serem lidos. */
  access: AccessState;
  /** claim appAdmin do token (a Gestão e as ações de admin da app dependem dele). */
  appAdmin: boolean;
  /** claim canUploadSong do token (Nova cifra, Importar, tom feito à mão). */
  canUploadSong: boolean;
  /** Único vínculo da pessoa (a interface aceita um). null sem ministério. */
  ministry: CurrentMinistry | null;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}
```

`role` sai do `AuthState`. Predicados em `apps/web/src/auth/permissions.ts` (substituem `canEdit`, `isAdmin`, `canEditSetlists`, que saem de `roles.ts`):

```ts
import type { AuthState } from './useAuth';
export const canListSetlists = (s: AuthState) => s.access === 'granted' && s.ministry !== null;
export const canChangeKey = (s: AuthState) => s.access === 'granted';          // Mudar tom: todo membro
export const canEditSetlist = (s: AuthState) => s.ministry?.role === 'admin';   // repertório: admin do ministério
export const canManageSongs = (s: AuthState) => s.appAdmin;                     // apagar/corrigir cifra
export const canUpload = (s: AuthState) => s.canUploadSong;                     // Nova cifra, Importar
export const isMinistryAdmin = (s: AuthState) => s.ministry?.role === 'admin';
export const isAppAdmin = (s: AuthState) => s.appAdmin;
```

### C5. Gateway do cliente (`apps/web/src/auth/gateway.ts`)

Substitui `getClaimRole` e `onUserDoc` (agora entrega `{ appAdmin }`). Contrato completo:

```ts
export interface AuthGateway {
  onUser(cb: (u: SessionUser | null) => void): () => void;
  /** Lê o token atual, sem forçar refresh. Claim ausente conta como false. */
  getClaims(): Promise<{ appAdmin: boolean; hasMinistry: boolean; canUploadSong: boolean }>;
  /** users/{uid}: só o campo appAdmin importa aqui. */
  onUserDoc(uid: string, cb: (profile: { appAdmin: boolean }) => void): () => void;
  /** collectionGroup('members') where uid == uid; ministryId = snap.ref.parent.parent?.id. */
  onMemberships(
    uid: string,
    cb: (m: Array<{ ministryId: string; role: MinistryRole }>) => void,
    onError: (e: unknown) => void,
  ): () => void;
  /** ministries/{mid}; null se o documento não existe. */
  onMinistry(ministryId: string, cb: (m: { name: string; city: string } | null) => void): () => void;
  refreshToken(): Promise<void>;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Limpa o cache local (terminate, clearIndexedDbPersistence, caches 'cifras-pdfs') e recarrega.
   * Com `removedFrom`, guarda em sessionStorage o aviso "Você não faz mais parte de <removedFrom>."
   * para a tela de entrada mostrar depois do reload (Tarefa 17).
   */
  forgetLocalData(removedFrom?: string): Promise<void>;
}
```

`signOut` usa o mesmo `clearLocalCache()` (terminate, clear, caches) antes do `reload()`. `forgetLocalData` nunca lança: cada passo tem `try/catch` com `console.warn`, e o `reload()` vem por último.

### C6. Camada de dados de ministérios no cliente (`apps/web/src/ministries/ministriesApi.ts`)

```ts
export type PersonRow = {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role?: MinistryRole;
  createdAt?: Date | null;
};
export interface MinistryItem { id: string; name: string; city: string; nameNormalized: string; memberCount?: number; pendingCount?: number }
export interface MinistriesApi {
  listMinistries(): Promise<MinistryItem[]>;                       // ordenada por name; a busca usa nameNormalized
  subscribeMyRequests(
    uid: string,
    cb: (r: Array<{ ministryId: string; status: 'pending' | 'rejected' }>) => void,
    onError: (e: unknown) => void,
  ): () => void;                                                   // collectionGroup('requests') where uid == uid
  countPending(ministryId: string): Promise<number>;               // getCountFromServer, status == 'pending'
  countPendingAll(): Promise<number>;                              // admin da app: collectionGroup, status == 'pending'
  listRequests(ministryId: string): Promise<PersonRow[]>;          // pedidos pendentes do ministério
  listMembers(ministryId: string): Promise<PersonRow[]>;           // membros do ministério
  listAllPendingRequests(): Promise<Array<PersonRow & { ministryId: string; ministryName: string; ministryCity: string }>>; // Gestão
  listAppUsers(): Promise<Array<PersonRow & { appAdmin: boolean }>>; // Admins da app: todos os users/{uid} (quem já entrou), ordenados por nome
  callable: {
    requestAccess(ministryId: string): Promise<void>;
    cancelRequest(ministryId: string): Promise<void>;
    approve(ministryId: string, uid: string): Promise<void>;
    reject(ministryId: string, uid: string): Promise<void>;
    setRole(ministryId: string, uid: string, role: MinistryRole): Promise<void>;
    removeMember(ministryId: string, uid: string): Promise<void>;
    createMinistry(name: string, city: string): Promise<{ ministryId: string }>;
    updateMinistry(ministryId: string, name: string, city: string): Promise<void>;
    setAppAdmin(uid: string, appAdmin: boolean): Promise<void>;
    getStats(ministryId?: string): Promise<StatsCallerResult>;
  };
}
```
Leituras usam o SDK do cliente (as Rules já permitem); escritas só por callable (C3). Falha de callable mostra o `message` do servidor quando ele devolve um erro conhecido (mapeamento único em `ministries/callable.ts`, Tarefa 16) (ex.: "Este pedido não está pendente."); quando a falha veio **depois** de gravar (rede caiu após o `ok`), a mensagem é "Não foi possível concluir. Tente de novo." (a callable é segura para repetir; item 8a da #135).

### C7. Rotas (`apps/web/src/App.tsx`, Tarefa 25)

| Rota | Quem | Tela |
| --- | --- | --- |
| `/` `/busca` `/pad` `/mais` `/cantores/:id` `/musicas/:id` | membro, admin do ministério, admin da app | como hoje |
| `/repertorios/:id` | com ministério (`canListSetlists`); sem ministério, `Navigate` para `/` | repertório do ministério atual; não existe nele: "Repertório não encontrado" (tela 49) |
| `/nova`, `/importar` | `canUpload` | como hoje |
| `/pessoas` | admin do ministério | Pessoas do ministério (tela 41) |
| `/estatisticas` | admin do ministério | Estatísticas do ministério (tela 47) |
| `/gestao` | admin da app | Gestão (tela 42) |
| `/gestao/ministerios` · `/gestao/ministerios/:mid` | admin da app | lista (43) e detalhe (45, com Pessoas do ministério daquele `mid`) |
| `/gestao/estatisticas` | admin da app | Estatísticas da app (46) |
| `/gestao/admins` | admin da app | Admins da app (48) |
| entrada (sem acesso) | `access === 'blocked'` | Escolha seu ministério (34), Confirmar (35), Pedido enviado (36), Pedido recusado (37) |

### C8. Estatísticas (`apps/functions/src/stats/getStats.ts`, Tarefa 11)

```ts
// StatsResult não muda (cartões e ranking geral). O ranking de ministério é novo.
export type MinistryRanking = { id: string; name: string; topAllTime: TopSong[]; topLast30Days: TopSong[] };
export type StatsCallerResult = {
  /** Cartões e ranking geral (StatsResult): só para o admin da app; null para o admin do ministério. */
  general: StatsResult | null;
  /** Ranking do ministério pedido (ministryId); null quando o caller não pediu um. */
  ministry: MinistryRanking | null;
};
```

---

## Revisão de foco (Review Focus)

1. **Consulta de grupo alargada:** a regra de `members`/`requests` por `resource.data.uid` não pode dar leitura de vínculo alheio. Testes em `tests/rules/ministerios.rules.test.ts` (Tarefa 1).
2. **Removido com token antigo:** `hasMinistry` no token em `false` nega repertório **e** catálogo na hora; `role` não vale quando o claim existe. Testes em `tests/rules` (Tarefas 4, 5 e 6).
3. **Claims apagados:** todo writer grava os quatro campos. Testes em `claims.test.ts` (já existe) e nas callables que gravam claims.
4. **Cliente sem leitura antes de ter ministério:** `RequireAccess` não monta provedores de dados quando `access !== 'granted'`; a consulta de grupo de `members` e de `requests` é a única leitura permitida antes (feita pelo provedor de sessão, não por provedor de dados). Testes em `RequireAccess.test.tsx` (Tarefa 17).
5. **Raiz congelada:** a raiz `setlists` só aceita leitura da Haja Luz; o espelho sai. Testes de rules (Tarefa 3) e de Functions (Tarefa 12).
6. **Avisos:** aparelho de outro ministério não recebe e **não** é apagado; aparelho de quem não tem ministério nenhum é apagado. Repertório **sempre** com `ministryId` (tipo e teste de runtime). Testes em `send.test.ts`, `announce.test.ts`, `reminders.test.ts` (Tarefa 10).
7. **Estatísticas sem contagem dupla:** `collectionGroup('setlists')` também traz a raiz; só entra quem tem `ministryId` (`ministryIdOf(ref)` não nulo). Testes em `model.test.ts` e `countUsage.test.ts` (Tarefa 11).
8. **Admin da app não lê repertório alheio:** `ministries/{mid}/setlists` exige documento de membro; a app admin só lê `members` e `requests`. Teste de rules (Tarefa 6).
9. **Pedido sem corrida:** as checagens do pedido de entrada estão dentro da transação, antes de qualquer escrita (Tarefa 8).

---

## Mapa de grupos (paralelismo sem arquivos compartilhados)

| Grupo | Tarefas | Arquivos | Pode andar junto com |
| --- | --- | --- | --- |
| P (pré-entrega, PR próprio) | 1, 2 | `firestore.rules` (só `users`, `members`, `requests`), `firestore.indexes.json`, `tests/rules/ministerios.rules.test.ts`, `apps/functions/src/indexesConfig.test.ts` | nada: sai antes |
| R (Rules do pacote) | 3 → 4 → 5 → 6 (sequencial) | `firestore.rules` (repertórios, raiz, catálogo), `storage.rules`, `tests/rules/{firestore.rules,setlists.rules,storage.rules,ministerios.rules}.test.ts` | F, D |
| F (Functions) | 7 → 8 → 9 → 10 → 11 → 12 → 13 (sequencial) | `apps/functions/src/**`. `index.ts`: Tarefa 10 (export do gatilho), 12 (remove o espelho), 13 (guards e callables) | R, D |
| D (design e tokens) | 14 | `apps/web/src/ui/styles.css`, `apps/web/src/ui/redesign-ministries.css` (novo) e teste, `apps/web/src/ui/initials.ts` (novo) e teste, o CSS que tem `.role-badge`, `apps/web/src/main.tsx` (só a importação), `docs/design-system.md` | R, F (antes de W) |
| W (cliente) | 15 → 16 → 17 → 18 (sequencial); depois 19, 20, 21 e 24 em paralelo; 22 → 23 (23 importa `people/PeoplePage`, não é paralela); 25 por último | 15: `auth/*`, `test/fakeGateway.ts` (migrado), `test/authState.ts` (novo), os três `App*.test.tsx` (só o login; props na 25); 16: `ministries/*` (inclui `callable.ts`), `stats/types.ts`, `test/fakeMinistriesApi.ts` (novos); 17: `routes/RequireAccess.tsx`, `routes/AccessPending.tsx` (remover), `routes/LoginPage.tsx` (nota), `routes/routes.test.tsx` (linha ~45), `auth/removedNotice.test.ts` (novo; `removedNotice.ts` é da 15), `ministries/entry/*`; 18: `setlists/*` (inclui `SetlistPage.test.tsx` e `setlistApi.firebase.test.ts`); 19: `viewer/*`; 20: `search/HomePage.tsx` (as duas ocorrências de `TABS`), `routes/RequireRole.tsx`; 21: `more/*`, `push/PushProvider.tsx`, `push/AvisosCard.tsx`; 22: `people/*` (inclui `PeoplePage` e testes; sai `peopleApi.ts`); 23: `gestao/*`; 24: `stats/*` (inclui `test/fakeStatsApi.ts`; `formatBytes` fica); 25: `App.tsx`, `bootstrap.tsx`, `main.tsx` (remove a importação de `redesign-access.css`), `routes/routes.test.tsx` (props e rotas), `routes/RequireRole.tsx` (`listSetlists`), `setlists/nullSetlistApi.ts` (novo), `ui/themeTokens.test.ts`, `auth/roles.ts` (remover), `ui/redesign-access.*` (remover), os três `App*.test.tsx` (props) | depois de D (14) |
| E (E2E) | 26 | `e2e/**` | depois de W |
| X (docs) | 27 | `docs/sistema.md`, `docs/deploy.md` | depois de F e W |
| V (verificação final, seção própria) | — | Paper (fora do repositório) e checagens | último |

Dentro de cada tarefa: o passo 1 escreve o teste e o passo 2 confirma que ele falha (ou que não compila, quando for tipo: `// @ts-expect-error` aponta a falta). Ao fim de cada tarefa o agente devolve a lista de arquivos alterados; o orquestrador commita.

**Verificação por tarefa:** no backend (R e F), cada tarefa termina com os testes filtrados e `npm run typecheck` verdes. No cliente (W), cada tarefa roda os próprios testes filtrados; o `typecheck` fecha ao fim da Tarefa 25, porque as tarefas 15 a 24 mudam tipos que outros arquivos ainda usam até a própria tarefa do consumidor.

Resíduo conhecido da Lane W: até a própria tarefa de cada consumidor (18 a 24), os testes que ainda leem `role` podem falhar; por isso cada tarefa roda só os seus filtros. Não há falha herdada na 15 (fake migrado e os três `App*.test.tsx` verdes) nem na 17 (`routes.test.tsx` atualizado).


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

Lane R roda em sequência (3 → 6). Não toca `apps/functions`. Os helpers reais dos testes estão nos arquivos indicados em cada tarefa: não criar helpers paralelos quando já existe um.

### Task 3: Raiz de `setlists` só leitura para a Haja Luz

**Por quê:** a raiz `setlists` era do ministério único (Preparação). Pelo spec §4.4 e §4.6, ela fica congelada: só a Haja Luz lê, ninguém grava. O repertório vivo é `ministries/hajaluz/setlists`.

**Arquivos:**
- Modificar: `firestore.rules` (bloco `match /setlists/{setlistId}` e bloco `match /users/{uid}`; remover `isAdmin()`)
- Modificar: `tests/rules/setlists.rules.test.ts` (repontar **todos** os casos para `ministries/hajaluz/setlists/*`, e acrescentar o describe da raiz)
- Modificar: `tests/rules/firestore.rules.test.ts` (dois casos de leitura de `users` que usam `role: 'admin'`)

- [ ] **Passo 1: repontar `setlists.rules.test.ts` para o ministério (sem perder cobertura)**

O arquivo hoje testa a raiz `setlists/*` (validação de `validSetlist`, janela do ensaio, `origin`, update e delete). Essas validações são do caminho `ministries/{mid}/setlists/{sid}` (mesma função `validSetlist`), por isso **todo** `it` continua, trocando o caminho:

1. Substituir os helpers de contexto (linhas 58 a 65) por contextos de **documento**. Os tokens não importam para repertório:

   ```ts
   const asUser = (uid: string): Db => env.authenticatedContext(uid, {}).firestore();
   const memberDb = (): Db => asUser('m2');   // membro do ministério (documento role member)
   // Admin do ministério: uid 'm1' tem o documento de membro com role admin.
   const editorDb = (): Db => asUser('m1');
   const viewerDb = (): Db => asUser('v1');   // sem vínculo
   const adminDb = (): Db => asUser('a1');    // admin do ministério (role admin)
   const anonDb = (): Db => env.unauthenticatedContext().firestore();
   const SL = (id: string) => `ministries/hajaluz/setlists/${id}`;
   ```

2. Trocar o seed do `beforeEach` (linhas 45 a 50) por membros e o repertório semeado no caminho novo:

   ```ts
   beforeEach(async () => {
     await env.clearFirestore();
     await env.withSecurityRulesDisabled(async (ctx) => {
       const db = ctx.firestore();
       await setDoc(doc(db, 'ministries/hajaluz/members/m1'), { uid: 'm1', role: 'admin' });
       await setDoc(doc(db, 'ministries/hajaluz/members/m2'), { uid: 'm2', role: 'member' });
       await setDoc(doc(db, 'ministries/hajaluz/members/a1'), { uid: 'a1', role: 'admin' });
       await setDoc(doc(db, SL('existing')), seed);
     });
   });
   ```

3. Trocar todo caminho `setlists/…` do arquivo por `SL(...)` (ex.: `doc(editorDb(), 'setlists/n1')` vira `doc(editorDb(), SL('n1'))`; `existing(db)` passa a usar `SL('existing')`). Os dados (`setlistData`, `updateData`, `items`) não mudam.
4. Trocar os casos de leitura (`describe('read')`): `allows member` e `allows admin` continuam; `denies viewer` e `denies anonymous` continuam.
5. Acrescentar, no fim do arquivo, o describe da raiz. Usa `setlistData()` do próprio arquivo (já existe, com os campos de `validSetlist`):

   ```ts
   describe('raiz setlists congelada (pacote)', () => {
     beforeEach(async () => {
       await env.clearFirestore();
       await env.withSecurityRulesDisabled(async (ctx) => {
         const db = ctx.firestore();
         await setDoc(doc(db, 'setlists/s1'), setlistData());
         await setDoc(doc(db, 'ministries/hajaluz/members/ana'), { uid: 'ana', role: 'member' });
         await setDoc(doc(db, 'ministries/hajaluz/members/chefe'), { uid: 'chefe', role: 'admin' });
         await setDoc(doc(db, 'ministries/outro/members/bia'), { uid: 'bia', role: 'member' });
       });
     });

     it('membro da Haja Luz lê a raiz', async () => {
       await assertSucceeds(getDoc(doc(env.authenticatedContext('ana', {}).firestore(), 'setlists/s1')));
     });

     it('membro de outro ministério não lê a raiz', async () => {
       await assertFails(getDoc(doc(env.authenticatedContext('bia', {}).firestore(), 'setlists/s1')));
     });

     it('token com role admin legado, sem vínculo na Haja Luz, não lê a raiz', async () => {
       await assertFails(getDoc(doc(env.authenticatedContext('x', { role: 'admin' }).firestore(), 'setlists/s1')));
     });

     it('ninguém grava na raiz, nem admin da Haja Luz', async () => {
       const db = env.authenticatedContext('chefe', { role: 'admin' }).firestore();
       await assertFails(setDoc(doc(db, 'setlists/novo'), setlistData()));
       await assertFails(updateDoc(doc(db, 'setlists/s1'), { label: 'x' }));
       await assertFails(deleteDoc(doc(db, 'setlists/s1')));
     });
   });
   ```

   Imports: acrescentar `deleteDoc` e `updateDoc` se faltarem (já existem na linha 10 e 17).

- [ ] **Passo 2: ajustar `users` em `firestore.rules.test.ts`**

Os dois casos que leem `users` com `role: 'admin'` passam a usar o claim (o papel global sai da leitura de `users`, spec §4.4):

- linhas 95 a 98, `allows admin to read any users doc`: `env.authenticatedContext('a1', { appAdmin: true })`;
- linhas 124 a 127, `allows admin to list users`: `env.authenticatedContext('a1', { appAdmin: true })`.

Os casos de negação (`denies viewer listing users`, `denies admin writing users doc from client`) continuam como estão.

- [ ] **Passo 3: rodar e ver o estado**

Run: `npm run test:rules`. Esperado hoje: falham "admin legado sem vínculo" (a regra antiga aceita `role admin`), "ninguém grava na raiz" (a regra antiga deixa o admin gravar) e "membro de outro ministério" (a regra antiga lê a raiz por `role`). Os casos de `ministries/hajaluz/setlists` passam, porque a regra deles já lê o documento.

- [ ] **Passo 4: regra**

Em `firestore.rules`, substituir o bloco `match /setlists/{setlistId}` por:

```
    // Raiz congelada: só leitura, e só para quem é da Haja Luz (documento de membro, nunca o role).
    // O espelho é desligado neste pacote; a cópia em ministries/hajaluz/setlists passa a ser a fonte.
    match /setlists/{setlistId} {
      allow read: if isMemberOf('hajaluz');
      allow create, update, delete: if false;
    }
```

No bloco `match /users/{uid}`, trocar a leitura por:

```
    match /users/{uid} {
      allow read: if signedIn() && (request.auth.uid == uid || isAppAdminClaim());
      allow write: if false;
    }
```

Remover a função `isAdmin()` (deixa de ter uso; `isEditor()` sai na Tarefa 4). Conferir com `git grep -n "isAdmin()" firestore.rules`: nenhuma ocorrência.

- [ ] **Passo 5: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 6: entrega**

Arquivos: `firestore.rules`, `tests/rules/setlists.rules.test.ts`, `tests/rules/firestore.rules.test.ts`. Mensagem sugerida: `feat(rules): raiz de setlists só leitura para a Haja Luz`.

---

### Task 4: Catálogo por claims, com fallback legado para token antigo

**Por quê:** o catálogo deixa de depender de `role` no token (spec §4.4). O fallback vale só quando o token não tem o claim novo. Decisões de 23/11: tom gerado vale para `hasMinistry` **ou** `appAdmin`; tom feito à mão e música nova exigem `canUploadSong`.

**Arquivos:**
- Modificar: `firestore.rules` (helpers e blocos `artists`, `songs`, `arrangements`, `songLyrics`; remover `isEditor()`)
- Modificar: `tests/rules/firestore.rules.test.ts`

- [ ] **Passo 1: testes que falham**

Helpers reais do arquivo: `songData(over)`, `arrData(over)`, `seedArrangement(slug, data)` (definido **dentro** de `describe('firestore.rules', …)`) e `memberDb()`. Por isso o novo describe entra **dentro** de `describe('firestore.rules', …)`, como último bloco, e copia `lyricsData` (definido em `describe('songLyrics rules')`, linha 419) para dentro dele.

Alterar `memberDb` (linha 56) para o contexto de quem sobe cifra (membro com `canUploadSong`), declarado:

```ts
const memberDb = (): Db =>
  env.authenticatedContext('m1', { role: 'member', hasMinistry: true, canUploadSong: true }).firestore();
```

Acrescentar, como último bloco de `describe('firestore.rules', …)`:

```ts
  describe('catálogo por claims (pacote)', () => {
    const lyricsData = (over: Record<string, unknown> = {}) => ({
      text: 'Letra de teste',
      createdBy: 'm',
      createdAt: serverTimestamp(),
      ...over,
    });
    const membro = () => env.authenticatedContext('m', { role: 'member', hasMinistry: true, canUploadSong: false }).firestore();

    beforeEach(async () => {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'songs/s1'), songData({ createdBy: 'm' }));
      });
    });

    it('sem claim novo e com role viewer, não lê o catálogo', async () => {
      const db = env.authenticatedContext('v', { role: 'viewer' }).firestore();
      await assertFails(getDoc(doc(db, 'songs/s1')));
    });

    it('hasMinistry verdadeiro lê o catálogo', async () => {
      await assertSucceeds(getDoc(doc(membro(), 'songs/s1')));
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
      await assertFails(setDoc(doc(membro(), 'songs/s2'), songData({ createdBy: 'm' })));
      await assertFails(setDoc(doc(membro(), 'songLyrics/s1'), lyricsData()));
    });

    it('admin de ministério (canUploadSong) cria música nova', async () => {
      const db = env.authenticatedContext('a', { role: 'member', hasMinistry: true, canUploadSong: true }).firestore();
      await assertSucceeds(setDoc(doc(db, 'songs/s2'), songData({ createdBy: 'a' })));
    });

    it('membro cria tom gerado a partir de tom feito à mão (slug = tom, sensível a caixa)', async () => {
      await seedArrangement('C', { key: 'C', source: 'handmade' });
      await assertSucceeds(
        setDoc(
          doc(membro(), 'songs/s1/arrangements/D'),
          arrData({ key: 'D', storagePath: 'songs/s1/D-abc.pdf', source: 'generated', derivedFromKey: 'C', writer: 'overlay', createdBy: 'm' }),
        ),
      );
    });

    it('admin da app sem ministério também cria tom gerado', async () => {
      await seedArrangement('C', { key: 'C', source: 'handmade' });
      const db = env.authenticatedContext('chefe', { appAdmin: true }).firestore();
      await assertSucceeds(
        setDoc(
          doc(db, 'songs/s1/arrangements/D'),
          arrData({ key: 'D', storagePath: 'songs/s1/D-abc.pdf', source: 'generated', derivedFromKey: 'C', writer: 'overlay', createdBy: 'chefe' }),
        ),
      );
    });

    it('membro não cria tom feito à mão', async () => {
      await assertFails(
        setDoc(doc(membro(), 'songs/s1/arrangements/D'), arrData({ key: 'D', storagePath: 'songs/s1/D-abc.pdf', createdBy: 'm' })),
      );
    });

    it('admin da app lê e cria música sem ministério', async () => {
      const db = env.authenticatedContext('chefe', { appAdmin: true, role: 'viewer' }).firestore();
      await assertSucceeds(getDoc(doc(db, 'songs/s1')));
      await assertSucceeds(setDoc(doc(db, 'songs/s3'), songData({ createdBy: 'chefe' })));
    });
  });
```

Nota: `arrData` define `createdBy: 'm1'` por padrão; nos casos acima passa-se `createdBy` igual ao uid do contexto. Se algum caso antigo de `memberDb()` esperar negação de subida de música, trocar o contexto dele por um sem `canUploadSong` (e registrar no PR).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`. Esperado hoje: falham "hasMinistry falso" (a regra antiga aceita `role member`) e "membro sem canUploadSong" (aceita). "membro cria tom gerado" e "admin da app cria tom gerado" passam hoje por causa do `isEditor()`; depois da mudança continuam verdes.

- [ ] **Passo 3: regra**

Em `firestore.rules`, remover `isEditor()` e acrescentar, junto de `isAppAdminClaim()`:

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

    // Leitura do catálogo: qualquer um com ministério, ou admin da app.
    function canReadCatalog() {
      return isAppAdminClaim() || hasMinistryClaim();
    }

    // Subir cifra feita à mão, criar música e letra: admin de ministério ou da app.
    function canUploadSong() {
      return isAppAdminClaim() || claimOrLegacy('canUploadSong', ['admin']);
    }

    // Tom gerado (PDF por sobreposição): qualquer um com ministério, ou admin da app (decisão de 23/11).
    function canContributeCatalog() {
      return isAppAdminClaim() || hasMinistryClaim();
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
        // Tom feito à mão: quem sobe cifra. Tom gerado: quem tem ministério ou é admin da app.
        allow create: if (request.resource.data.source == 'handmade' ? canUploadSong() : canContributeCatalog())
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

Conferir com `git grep -n "isEditor\|isAdmin()" firestore.rules`: nenhuma ocorrência.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `firestore.rules`, `tests/rules/firestore.rules.test.ts`. Mensagem sugerida: `feat(rules): catálogo por claims de ministério e de subida de cifra`.

Nota de validação: o plano usa `!(claim in request.auth.token)`. Se o emulador não aceitar `in` sobre o token, trocar por `!(request.auth.token.keys().hasAny([claim]))` e registrar no PR. Validar nesta tarefa, pelo primeiro caso de "token antigo" (que depende do fallback).

---

### Task 5: Storage por claims (`songs/` e `pads/`)

**Arquivos:**
- Modificar: `storage.rules`
- Modificar: `tests/rules/storage.rules.test.ts`

- [ ] **Passo 1: testes que falham**

Helpers reais do arquivo: `pdfFor(uid)` (`contentType: 'application/pdf'` e `customMetadata.uploadedBy`), `one = new Uint8Array([1])` e o seed `songs/s1/original.pdf` feito no `beforeAll`. Acrescentar um `describe` **no fim** do arquivo, usando esses helpers (são locais ao `describe('storage.rules')`, por isso mover `pdfFor` e `one` para o topo do arquivo, ou repetir os dois dentro do novo describe):

```ts
describe('Storage por claims (pacote)', () => {
  const pdfFor = (uid: string) => ({ contentType: 'application/pdf', customMetadata: { uploadedBy: uid } });
  const one = new Uint8Array([1]);
  const st = (uid: string, claims: Record<string, unknown>) => env.authenticatedContext(uid, claims).storage();

  it('membro com hasMinistry lê o catálogo', async () => {
    await assertSucceeds(getBytes(ref(st('m', { role: 'viewer', hasMinistry: true }), 'songs/s1/original.pdf')));
  });

  it('removido (hasMinistry falso) não lê, mesmo com role member', async () => {
    await assertFails(getBytes(ref(st('r', { role: 'member', hasMinistry: false }), 'songs/s1/original.pdf')));
  });

  it('claim hasMinistry como texto "true" não vale (comparação estrita)', async () => {
    await assertFails(getBytes(ref(st('m', { hasMinistry: 'true' }), 'songs/s1/original.pdf')));
  });

  it('membro com hasMinistry sobe o PDF gerado', async () => {
    await assertSucceeds(uploadBytes(ref(st('m', { role: 'viewer', hasMinistry: true }), 'songs/s1/D-gerado.pdf'), one, pdfFor('m')));
  });

  it('pessoa sem ministério não sobe', async () => {
    await assertFails(uploadBytes(ref(st('v', { role: 'viewer', hasMinistry: false }), 'songs/s1/E-x.pdf'), one, pdfFor('v')));
  });

  it('admin da app sobe sem ministério', async () => {
    await assertSucceeds(uploadBytes(ref(st('chefe', { appAdmin: true }), 'songs/s1/F-x.pdf'), one, pdfFor('chefe')));
  });

  it('token antigo com role member lê pelo legado', async () => {
    await assertSucceeds(getBytes(ref(st('old', { role: 'member' }), 'songs/s1/original.pdf')));
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test:rules`. Esperado hoje: falha "removido com role member" (a regra antiga lê pelo role) e "hasMinistry como texto" (idem).

- [ ] **Passo 3: regra**

Em `storage.rules`, substituir `isEditor()` por:

```
    // Claim novo manda; token sem o claim usa o role legado até a limpeza (#137).
    // Comparação estrita: 'true' em texto não conta.
    function hasMinistryClaim() {
      return request.auth != null
        && (request.auth.token.get('appAdmin', false) == true
          || request.auth.token.get('hasMinistry', false) == true
          || (!('hasMinistry' in request.auth.token)
            && request.auth.token.get('role', 'viewer') in ['member', 'admin']));
    }
```

Trocar `isEditor()` por `hasMinistryClaim()` em `songs/**` (read e create) e em `pads/{version}/{fileName}` (read). O restante do arquivo fica igual.

Validar no emulador de Storage a forma `'hasMinistry' in request.auth.token`. Se o emulador recusar, trocar por `!(request.auth.token.keys().hasAny(['hasMinistry']))` e registrar no PR.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde. Os casos antigos de `storage.rules.test.ts` (que usam `role: 'member'` e `role: 'admin'` sem claim) continuam verdes pelo fallback.

- [ ] **Passo 5: entrega**

Arquivos: `storage.rules`, `tests/rules/storage.rules.test.ts`. Mensagem sugerida: `feat(storage): leitura e envio de cifras e pads por ministério`.

---

### Task 6: Matriz de acesso do spec §4.4 (lacunas)

**Por quê:** `tests/rules/ministerios.rules.test.ts` já tem a matriz de §4.4 (contextos `CTX` e `UID`, `LEITURAS`, consulta de grupo, escrita, listagem e edição do repertório). Esta tarefa **não** duplica a matriz: acrescenta só o que falta.

**Arquivos:** modificar `tests/rules/ministerios.rules.test.ts` (novo `describe('matriz de acesso (§4.4): lacunas')`).

- [ ] **Passo 1: escrever as lacunas**

Usar `CTX`, `UID` e `setlistData` do próprio arquivo. Acrescentar um contexto ao objeto `CTX` (e a chave em `UID`) **só dentro do describe novo**, para não mudar as matrizes existentes:

```ts
describe('matriz de acesso (§4.4): lacunas', () => {
  // Token com hasMinistry e canUploadSong, mas sem documento de membro (removido ou nunca entrou).
  const tokenSemDoc = () =>
    env.authenticatedContext('x2', { role: 'admin', hasMinistry: true, canUploadSong: true }).firestore();

  it.each([
    ['ministries/hajaluz/setlists/s1'],
    ['setlists/s1'],
  ])('token com hasMinistry sem documento não lê %s', async (path) => {
    await assertFails(getDoc(doc(tokenSemDoc(), path)));
  });

  it('token com hasMinistry sem documento não grava repertório', async () => {
    await assertFails(setDoc(doc(tokenSemDoc(), 'ministries/hajaluz/setlists/n9'), setlistData({ createdBy: 'x2', updatedBy: 'x2' })));
  });

  it('deslogado não lê o catálogo nem a raiz de repertórios', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'songs/s1')));
    await assertFails(getDoc(doc(anon, 'setlists/s1')));
  });

  it('admin de A não grava repertório de B', async () => {
    await assertFails(setDoc(doc(CTX.adminHaja(), 'ministries/outro/setlists/x1'), setlistData({ createdBy: 'm1', updatedBy: 'm1' })));
  });
});
```

Os casos de leitura por contexto (membro, admin, app admin sem vínculo, removido, deslogado, pedinte) já estão em `LEITURAS` e na escrita por loop: não repetir.

Se algum caso escrever com `updateDoc`, enviar `updatedBy` e `updatedAt: serverTimestamp()` (a regra exige os dois, e `createdBy`/`createdAt` devem continuar iguais).

- [ ] **Passo 2: rodar e ver o estado**

Run: `npm run test:rules`. Esperado: com as Tarefas 3 a 5 aplicadas, verde. Qualquer vermelho aponta regra faltando.

- [ ] **Passo 3: ajuste**

Se um caso falhar, corrigir a regra, nunca o caso. Registrar a causa no PR.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test:rules`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `tests/rules/ministerios.rules.test.ts`. Mensagem sugerida: `test(rules): lacunas da matriz de acesso dos ministérios`.

---
---

## Parte F: Functions do pacote

Lane F roda em sequência (7 → 13) e não toca `firestore.rules` nem `storage.rules`. `index.ts` muda em três tarefas: 10 (renomeia o export do gatilho), 12 (remove o export do espelho) e 13 (guards e callables). Cada tarefa termina com os testes filtrados e `npm run typecheck -w @cifras/functions` verdes.

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
- Modificar: `apps/functions/src/ministries/adminDeps.ts` (a transação implementa essas leituras com `t.get(query)`; o mesmo código de conversão serve às leituras de fora)
- Modificar: `apps/functions/src/ministries/requests.ts` (checagens dentro de `runTransaction`)
- Modificar: `apps/functions/src/ministries/fakeDeps.ts` (registro `log` e guard das leituras novas)
- Modificar: `apps/functions/src/ministries/requests.test.ts`

- [ ] **Passo 1: teste que falha**

Em `requests.test.ts`, o fake é `createFakeMinistryDeps(seed)`, que devolve `{ deps, docs, claimCalls, log }` (o `log` é novo, Passo 3). Os testes desestruturam o que usam:

```ts
it('lê vínculos e pedidos de outros ministérios dentro da transação, antes de gravar', async () => {
  const { deps, log } = createFakeMinistryDeps({ 'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' } });
  await requestAccess(deps, 'ana', { ministryId: 'hajaluz' });
  expect(log).toContain('tx:listMembershipsOfUser');
  expect(log).toContain('tx:listPendingRequestsOfUser');
  expect(log.indexOf('tx:listMembershipsOfUser')).toBeLessThan(log.indexOf('tx:write'));
  expect(log.indexOf('tx:listPendingRequestsOfUser')).toBeLessThan(log.indexOf('tx:write'));
});

it('pedido recusado não impede novo pedido, inclusive para o mesmo ministério', async () => {
  const { deps } = createFakeMinistryDeps({
    'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    'ministries/hajaluz/requests/ana': { uid: 'ana', status: 'rejected' },
  });
  await expect(requestAccess(deps, 'ana', { ministryId: 'hajaluz' })).resolves.toEqual({ ministryId: 'hajaluz', status: 'pending' });
});

it('pedido pendente em outro ministério bloqueia o novo', async () => {
  const { deps } = createFakeMinistryDeps({
    'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    'ministries/outro': { name: 'Outro', city: 'Sumaré' },
    'ministries/outro/requests/ana': { uid: 'ana', status: 'pending', displayName: null, email: null, photoURL: null },
  });
  await expect(requestAccess(deps, 'ana', { ministryId: 'hajaluz' })).rejects.toMatchObject({ code: 'failed-precondition' });
});

it('pedido pendente no mesmo ministério devolve pending sem gravar de novo', async () => {
  const { deps, log } = createFakeMinistryDeps({
    'ministries/hajaluz': { name: 'Haja Luz', city: 'São Paulo' },
    'ministries/hajaluz/requests/ana': { uid: 'ana', status: 'pending', displayName: null, email: null, photoURL: null },
  });
  await expect(requestAccess(deps, 'ana', { ministryId: 'hajaluz' })).resolves.toEqual({ ministryId: 'hajaluz', status: 'pending' });
  expect(log).not.toContain('tx:write');
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/ministries/requests`. Esperado: falham o caso de ordem (as leituras estão fora da transação, `log` não existe) e o caso de pedido pendente do mesmo ministério (hoje grava de novo).

- [ ] **Passo 3: implementação**

1. `deps.ts`, em `MinistryTx`, acrescentar (além de `write`):

   ```ts
   export interface MinistryTx extends MinistryReads {
     write(op: WriteOp): void; // todas as leituras da transação vêm antes das escritas
     listMembershipsOfUser(uid: string): Promise<Array<{ ministryId: string; role: MembershipRole }>>;
     listPendingRequestsOfUser(uid: string): Promise<Array<{ ministryId: string }>>;
   }
   ```

2. `adminDeps.ts`: extrair a conversão das duas consultas de grupo para funções que recebem o snapshot (usadas por fora e pela transação):

   ```ts
   const toMemberships = (snap: { docs: Array<{ ref: { parent: { parent: { id: string } | null } }; get(f: string): unknown }> }) =>
     snap.docs.map((d) => ({
       ministryId: d.ref.parent.parent?.id ?? '',
       role: d.get('role') as MembershipRole,
     }));
   const toPending = (snap: { docs: Array<{ ref: { parent: { parent: { id: string } | null } } }> }) =>
     snap.docs.map((d) => ({ ministryId: d.ref.parent.parent?.id ?? '' }));
   ```

   No `runTransaction` de `createMinistryDeps`, o objeto `tx` ganha as duas leituras, com `t.get(query)` (Admin SDK aceita consulta dentro da transação; a mesma consulta de fora, só muda onde ela roda):

   ```ts
   const tx: MinistryTx = {
     ...readersWith(/* igual ao atual */),
     listMembershipsOfUser: async (uid) =>
       toMemberships(await t.get(db().collectionGroup('members').where('uid', '==', uid))),
     listPendingRequestsOfUser: async (uid) =>
       toPending(
         await t.get(
           db().collectionGroup('requests').where('uid', '==', uid).where('status', '==', 'pending'),
         ),
       ),
     write: (op) => applyWrite(t, op),
   };
   ```

   As leituras de fora (`listMembershipsOfUser` e `listPendingRequestsOfUser` do `MinistryDeps`) passam a usar `toMemberships(await …get())` e `toPending(await …get())`.

3. `requests.ts`, `requestAccess`: as leituras de vínculo e de pedidos saem de antes da transação. O nome do ministério continua antes (leitura simples, não corrida). Dentro de `tx`, a ordem é: vínculo, pedidos de outros, pedido do mesmo, e só então `tx.write`:

   ```ts
   export async function requestAccess(deps: MinistryDeps, callerUid: string | undefined, data: unknown) {
     const uid = requireCaller(callerUid);
     const ministryId = readMinistryId(data);
     const user = await deps.readUser(uid);
     if (!user) throw new HttpsError('not-found', 'Usuário não encontrado.');
     if (!(await deps.readMinistry(ministryId))) throw new HttpsError('not-found', 'Ministério não encontrado.');
     const now = deps.now();
     await deps.runTransaction(async (tx) => {
       // Todas as leituras antes da primeira escrita (regra do Admin SDK; o fake reprova o contrário).
       if ((await tx.listMembershipsOfUser(uid)).length > 0) {
         throw new HttpsError('failed-precondition', 'Você já faz parte de um ministério.');
       }
       const pending = await tx.listPendingRequestsOfUser(uid);
       if (pending.some((p) => p.ministryId !== ministryId)) {
         throw new HttpsError('failed-precondition', 'Você já tem um pedido pendente em outro ministério.');
       }
       const existing = await tx.readRequest(ministryId, uid);
       if (existing?.status === 'pending') return; // já pendente aqui: não grava de novo
       tx.write({
         op: 'set',
         path: paths.request(ministryId, uid),
         data: {
           uid,
           status: 'pending',
           displayName: user.displayName,
           email: user.email,
           photoURL: user.photoURL,
           createdAt: now,
           decidedBy: null,
           decidedAt: null,
         },
       });
     });
     return { ministryId, status: 'pending' as const };
   }
   ```

   Pedido `rejected` do mesmo ministério é sobrescrito pelo `set` (a pessoa pode pedir de novo). `runTransaction` devolve `undefined` quando o `return` antecipado acontece: a função externa devolve `{ ministryId, status: 'pending' }` em todos os caminhos.

4. `fakeDeps.ts`: o fake ganha `log` e as duas leituras novas, com o mesmo guard:

   ```ts
   const log: string[] = [];
   // ...
   const memberships = async (uid: string) =>
     [...docs.entries()]
       .filter(([k, d]) => /^ministries\/[^/]+\/members\/[^/]+$/.test(k) && d.uid === uid)
       .map(([k, d]) => ({ ministryId: k.split('/')[1] ?? '', role: d.role as MembershipRole }));
   const pendings = async (uid: string) =>
     [...docs.entries()]
       .filter(([k, d]) => /^ministries\/[^/]+\/requests\/[^/]+$/.test(k) && d.uid === uid && d.status === 'pending')
       .map(([k]) => ({ ministryId: k.split('/')[1] ?? '' }));
   ```

   Em `runTransaction`, o `guard` registra no `log` antes de checar, e o `write` registra `tx:write`:

   ```ts
   const guard =
     <A extends unknown[], R>(name: string, read: (...args: A) => Promise<R>) =>
     (...args: A): Promise<R> => {
       log.push(`tx:${name}`);
       if (buffered.length > 0) throw new Error('Leitura depois de escrita na mesma transação');
       return read(...args);
     };
   const txReads = {
     readUser: guard('readUser', reads.readUser),
     readMinistry: guard('readMinistry', reads.readMinistry),
     readMembership: guard('readMembership', reads.readMembership),
     readRequest: guard('readRequest', reads.readRequest),
     listAdminUids: guard('listAdminUids', reads.listAdminUids),
     listMembershipsOfUser: guard('listMembershipsOfUser', memberships),
     listPendingRequestsOfUser: guard('listPendingRequestsOfUser', pendings),
   };
   const result = await fn({
     ...txReads,
     write(op) {
       log.push('tx:write');
       buffered.push(op);
     },
   });
   ```

   E `deps.listMembershipsOfUser`/`listPendingRequestsOfUser` (fora da transação) passam a ser `memberships` e `pendings`. O retorno ganha `log`: `return { deps, docs, claimCalls, log };`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/ministries/requests src/ministries/adminDeps`. Esperado: verde. Rodar também `npm run typecheck -w @cifras/functions`.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/ministries/{deps,adminDeps,requests,fakeDeps,requests.test}.ts`. Mensagem sugerida: `fix(functions): checagens do pedido de entrada dentro da transação`.

---

### Task 9: Aparelhos por vínculo no envio (`push/*`)

**Por quê:** `sendToDevices` filtra por `users.role` (member/admin). Pelo spec, o aviso só vai para quem é do ministério do repertório, e aparelho de quem não tem ministério nenhum é apagado. Aparelho de outro ministério não recebe **e não é apagado**.

**Decisão de migração:** migração completa, sem atalho. `getUserRole`, `getUserRoles`, `RoleDeps` e a opção `roles` dos fakes **saem** de `push/`; o lugar deles é `listMembershipsOfUser` (guards) e `getUserMinistries` (bulk). Um atalho (manter `roles` como alias) preservaria a lógica de papel global que esta tarefa remove. São ~57 linhas de referência em 8 arquivos, quase todas são troca mecânica do fixture.

**Arquivos:**
- Modificar: `apps/functions/src/push/types.ts`, `adminDeps.ts`, `send.ts`, `devices.ts`, `fakeDeps.ts`
- Modificar: `apps/functions/src/push/adminDeps.test.ts`, `send.test.ts`, `devices.test.ts`, `announce.test.ts`, `reminders.test.ts` (migração do fixture)

- [ ] **Passo 1: testes que falham**

Em `send.test.ts` (o fake agora recebe `ministries`):

```ts
it('envia só aos aparelhos de quem é do ministério do repertório', async () => {
  const { deps, calls } = fakeDeps({ devices: [device('t-a', 'ana'), device('t-b', 'bia')], ministries: { ana: ['hajaluz'], bia: ['outro'] } });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });
  expect(sentTokens(calls)).toEqual(['t-a']);
});

it('não apaga aparelho de quem é de outro ministério', async () => {
  const { deps, devices } = fakeDeps({ devices: [device('t-b', 'bia')], ministries: { bia: ['outro'] } });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });
  expect(devices.has(deviceId('t-b'))).toBe(true);
});

it('apaga aparelho de quem não tem ministério nenhum', async () => {
  const { deps, devices } = fakeDeps({ devices: [device('t-x', 'saiu')], ministries: {} });
  await sendToDevices(deps, { ...BASE, ministryId: 'hajaluz', respectSwitch: true });
  expect(devices.has(deviceId('t-x'))).toBe(false);
});

it('aviso sem ministryId e sem aparelho é recusado (nunca vai a todos)', async () => {
  const { deps } = fakeDeps({ devices: [device('t-a', 'ana')], ministries: { ana: ['hajaluz'] } });
  await expect(sendToDevices(deps, { ...BASE, respectSwitch: true } as unknown as SendInput)).rejects.toThrow('sem ministério nem aparelho');
});

it('teste de aparelho (onlyUid, sem ministryId) envia a quem tem ministério', async () => {
  const { deps, calls } = fakeDeps({ devices: [device('t-b', 'bia')], ministries: { bia: ['outro'] } });
  await sendToDevices(deps, { ...BASE, onlyUid: 'bia', respectSwitch: false });
  expect(sentTokens(calls)).toEqual(['t-b']);
});
```

Acrescentar em `adminDeps.test.ts` a cobertura de `ministriesOfUids` (Passo 3, item 2) — ver o item 4 abaixo.

Em `reminderDeps.test.ts`: nada aqui (Tarefa 10).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/push/send`. Esperado: falham (`ministries` não existe no fake; `getUserMinistries` não existe; sem a guarda, "nunca vai a todos" não lança).

- [ ] **Passo 3: implementação**

1. `types.ts` (troca `RoleDeps` e `getUserRoles`):

   ```ts
   import type { GuardDeps } from '../auth/guards';

   export type PushDeps = GuardDeps & {
     getDeviceOwner(id: string): Promise<string | null>;
     writeDevice(id: string, data: Record<string, unknown>): Promise<void>; // merge
     deleteDevices(ids: string[]): Promise<void>;
     listDevices(): Promise<DeviceRecord[]>;
     /** uid -> ids dos ministérios do uid. Aparelho sem ministério nenhum é apagado. */
     getUserMinistries(uids: string[]): Promise<Map<string, Set<string>>>;
     sendBatch(messages: Array<{ token: string; message: PushMessage }>): Promise<SendResult[]>;
     readPushConfig(): Promise<{ enabled?: unknown } | null>;
     now(): Date;
   };
   ```

   `GuardDeps` (de `auth/guards.ts`, Tarefa 7) traz `readUser` e `listMembershipsOfUser`. Remover `import type { Role }`.

2. `adminDeps.ts`: remove `getUserRole` e `getUserRoles` e o import de `ROLES`. Acrescenta `ministriesOfUids` (exportada, para o teste) e os dois campos de `GuardDeps` vindos de `createMinistryDeps()`:

   ```ts
   import { createMinistryDeps } from '../ministries/adminDeps';

   // `in` do Firestore aceita até 30 valores por consulta.
   const IN_BLOCK = 30;

   /** uid -> Set de ministryId, pelo grupo `members` (uid é o campo do documento). Só traduz consultas. */
   export async function ministriesOfUids(uids: string[]): Promise<Map<string, Set<string>>> {
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

   export function createPushDeps(): PushDeps {
     const ministry = createMinistryDeps();
     return {
       readUser: ministry.readUser,
       listMembershipsOfUser: ministry.listMembershipsOfUser,
       getUserMinistries: ministriesOfUids,
       // ...demais campos (getDeviceOwner, writeDevice, deleteDevices, listDevices, sendBatch, readPushConfig, now) iguais aos atuais
     };
   }
   ```

   Nota: `createMinistryDeps` não importa nada de `push/` (sem ciclo).

3. `send.ts`: tipos com a união, guarda e filtro:

   ```ts
   type SendBase = {
     title: string;
     body: string;
     link: string; // caminho do site, começando por "/"; o domínio vem da origem do aparelho
     tag: string;
     origin?: Origin;
     excludeUid?: string;
     respectSwitch: boolean;
   };

   /** Aviso de repertório: só aparelhos do ministério. `ministryId` é obrigatório (Tarefa 10). */
   export type RepertorioSend = SendBase & { ministryId: string; onlyUid?: undefined };
   /** Aparelho único (teste de push), sem ministério. */
   export type DeviceSend = SendBase & { ministryId?: undefined; onlyUid: string };
   export type SendInput = RepertorioSend | DeviceSend;
   ```

   Em `sendToDevices`, logo no começo (antes de ler a configuração):

   ```ts
   if (!input.ministryId && !input.onlyUid) {
     throw new Error('push: aviso sem ministério nem aparelho');
   }
   ```

   O bloco de filtro:

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

4. `devices.ts`: `registerDevice` e `sendTestPush` trocam `requireRole(deps, uid, ['member', 'admin'])` por `await requireMinistryMember(deps, uid)` (import de `../auth/guards`). `unregisterDevice` não muda. `sendTestPush` chama `sendToDevices` no formato de aparelho (`onlyUid`, sem `ministryId`), conferir a linha ~70.

5. `fakeDeps.ts`: a opção `ministries` substitui `roles`; some `getUserRole`/`getUserRoles`; `deps` ganha `readUser` (sempre `null`: a guarda de ministério não usa) e `listMembershipsOfUser`:

   ```ts
   export type FakeOptions = {
     /** uid -> ministryIds. Quem não está aqui não tem ministério. */
     ministries?: Record<string, string[]>;
     devices?: DeviceRecord[];
     config?: { enabled?: unknown } | null;
     failures?: Record<string, string>;
   };
   // ...
   const ministries = new Map<string, string[]>(Object.entries(opts.ministries ?? {}));
   // em deps:
   readUser: async () => null,
   listMembershipsOfUser: async (uid) => (ministries.get(uid) ?? []).map((ministryId) => ({ ministryId, role: 'member' as const })),
   getUserMinistries: async (uids) =>
     new Map(uids.filter((uid) => ministries.has(uid)).map((uid) => [uid, new Set(ministries.get(uid))])),
   ```

   `fakeDeps` devolve `{ deps, devices, calls, clock }` como hoje. Para o teste de "não apaga", `devices` é o `Map` de aparelhos (`devices.has(deviceId('t-b'))`; importar `deviceId` de `./token`).

6. Migração do fixture (mecânica, sem mudar o que o teste afirma):
   - `roles: { m1: 'member', a1: 'admin' }` vira `ministries: { m1: ['hajaluz'], a1: ['hajaluz'] }`;
   - `roles: { v1: 'viewer' }` vira `ministries: {}` (ou some a chave): viewer é quem não tem vínculo;
   - `announce.test.ts` (`const members = { roles: ... } satisfies FakeOptions`) e `reminders.test.ts` (linha 32 e 458) seguem a mesma troca;
   - `devices.test.ts`: "membro sem role" passa a "sem vínculo"; "deletes the caller own device, any role" continua;
   - `adminDeps.test.ts`: o `describe('createPushDeps.getUserRoles')` vira `describe('ministriesOfUids')`. O fake de Firestore ganha `collectionGroup(name)` com `where('uid', 'in', lista)` e `get()`, e cada documento tem `ref.parent.parent.id` (o id do ministério). Os casos: lista vazia devolve Map vazio; 301 uids com vínculo em cada um devolvem 301 entradas, em 11 consultas (`in` de 30); `''`, `'a/b'` e duplicados são descartados; documento sem vínculo não entra no Map.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/push`. Esperado: verde. Rodar `npm run typecheck -w @cifras/functions`.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/push/{types,adminDeps,send,devices,fakeDeps,adminDeps.test,send.test,devices.test,announce.test,reminders.test}.ts`. Mensagem sugerida: `feat(push): avisos só para quem é do ministério do repertório`.

---

### Task 10: Gatilho e lembretes de repertório por ministério (CRÍTICA: vazamento entre ministérios)

**Por quê:** hoje o gatilho ouve a raiz `setlists/{sid}` e os lembretes consultam `setlists` sem ministério. Com o pacote, um aviso de repertório sem `ministryId` iria a **todos** os ministérios. Esta tarefa torna `ministryId` obrigatório no tipo e checa em runtime.

**Decisão sobre o gatilho já deployado:** o filtro de `onDocumentWritten` **não** é trocado no lugar. Renomeia-se a função para `onMinistrySetlistWritten` (documento `ministries/{ministryId}/setlists/{setlistId}`) e a antiga `onSetlistWritten` sai do export. O deploy usa `--force`, que apaga a função que sumiu do código. Motivo: a CLI pode recusar a troca de filtro de um gatilho existente; o nome novo evita a pergunta. Sem efeito colateral: a raiz está congelada (Tarefa 3) e o espelho sai (Tarefa 12).

**Arquivos:**
- Modificar: `apps/functions/src/push/send.ts` (tipos da Tarefa 9 já trazem `RepertorioSend`; esta tarefa só confirma o uso), `setlistTrigger.ts`, `announce.ts`, `newSetlist.ts`, `rehearsal.ts`, `reminders.ts`, `reminderDeps.ts`
- Modificar: `apps/functions/src/index.ts` (linha do export do gatilho e a da `sendRehearsalReminders` se mudar)
- Modificar: `apps/functions/src/ministries/model.ts` (+ `ministryIdOf`, ver Tarefa 11) — só se a Tarefa 11 ainda não tiver criado; a ordem é 10 antes de 11, então **criar `ministryIdOf` aqui** e a Tarefa 11 só o importa
- Modificar testes: `announce.test.ts`, `newSetlist.test.ts`, `rehearsal.test.ts`, `reminders.test.ts`, `reminderDeps.test.ts` (novo caso de raiz), `setlistTrigger.test.ts`, `send.test.ts` (caso de runtime)

- [ ] **Passo 1: testes que falham**

a) `ministryIdOf` (em `ministries/model.test.ts`, Tarefa 11 reusa):

```ts
import { ministryIdOf } from './model';
it('ministryIdOf: pai do pai é o ministério; raiz não tem', () => {
  expect(ministryIdOf({ parent: { parent: { id: 'hajaluz' } } })).toBe('hajaluz');
  expect(ministryIdOf({ parent: { parent: null } })).toBeUndefined();
});
```

b) Em `send.test.ts`: `sendToDevices` sem `ministryId` nem `onlyUid` lança (já na Tarefa 9); aqui, o teste de tipo:

```ts
// Sem ministério, o aviso de repertório não compila. O @ts-expect-error falha se o erro sumir
// (ex.: se alguém tornar ministryId opcional no tipo RepertorioSend).
const semMinisterio: RepertorioSend = {
  title: 'Novo repertório', body: 'x', link: '/repertorios/s1', tag: 't', respectSwitch: true,
  // @ts-expect-error ministryId é obrigatório no aviso de repertório: undefined não cabe em string
  ministryId: undefined,
};
void semMinisterio;
```

c) Em `announce.test.ts`:

```ts
it('envia o aviso de repertório novo só ao ministério do repertório', async () => {
  const { deps, calls } = fakeDeps({ devices: [device('t-a', 'ana'), device('t-b', 'bia')], ministries: { ana: ['hajaluz'], bia: ['outro'] } });
  await announceNewSetlist(deps, 's1', 'hajaluz', undefined, NOVO_COM_4_MUSICAS);
  expect(sentTokens(calls)).toEqual(['t-a']);
});
```

d) Em `newSetlist.test.ts` (a assinatura de `buildNewSetlistMessage` muda):

```ts
it('o aviso leva o ministryId do repertório', () => {
  const msg = buildNewSetlistMessage('s1', 'hajaluz', SNAPSHOT_COM_4_MUSICAS, undefined);
  expect(msg?.ministryId).toBe('hajaluz');
});
```

e) Em `rehearsal.test.ts`: `buildRehearsalReminder` devolve `ministryId` do setlist; `readRehearsalSetlist('s1', 'hajaluz', data)` devolve `ministryId: 'hajaluz'`.

f) Em `reminders.test.ts`:

```ts
it('lembrete vai só ao ministério do ensaio', async () => {
  const { deps, calls } = reminderFakeDeps({
    setlists: [{ id: 's1', ministryId: 'hajaluz', data: ENSAIO_AMANHA }],
    devices: [device('t-a', 'ana'), device('t-b', 'bia')],
    ministries: { ana: ['hajaluz'], bia: ['outro'] },
  });
  await runRehearsalReminders(deps);
  expect(sentTokens(calls)).toEqual(['t-a']);
});
```

`reminderFakeDeps` é o helper que `reminders.test.ts` já tem; ele ganha `setlists` com `ministryId` e repassa `ministries` ao `fakeDeps` de `push/fakeDeps.ts`.

g) Em `reminderDeps.test.ts` (o mock já existe). O mock ganha `collectionGroup` (além de `collection`), e cada documento ganha `ref`:

```ts
vi.mock('firebase-admin/firestore', () => {
  // ...query(name) igual; o objeto de Firestore agora tem os dois:
  return { getFirestore: () => ({ collection: query, collectionGroup: query }) };
});
// docs de teste:
fs.docs.push({ id: 's1', data: () => ({ label: 'Culto' }), ref: { parent: { parent: { id: 'hajaluz' } } } });
fs.docs.push({ id: 'raiz', data: () => ({ label: 'Antigo' }), ref: { parent: { parent: null } } });

it('o grupo traz a raiz: só o repertório de ministério entra', async () => {
  const found = await createReminderDeps().listRehearsalSetlists(from, to);
  expect(found.map((s) => s.id)).toEqual(['s1']);
  expect(found[0]?.ministryId).toBe('hajaluz');
});
```

h) Em `setlistTrigger.test.ts`: o caminho do gatilho é `ministries/{ministryId}/setlists/{setlistId}` e a exportação é `onMinistrySetlistWritten`.

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/push src/ministries/model`. Esperado: falham por assinatura (`announceNewSetlist`, `buildNewSetlistMessage`, `readRehearsalSetlist`), por `ministryId` ausente e pela exportação. `npm run typecheck -w @cifras/functions` falha no `@ts-expect-error` se a união não existir.

- [ ] **Passo 3: implementação**

1. `setlistTrigger.ts`:

   ```ts
   export const onMinistrySetlistWritten = onDocumentWritten(
     { document: 'ministries/{ministryId}/setlists/{setlistId}', region: 'southamerica-east1', retry: false },
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

2. `index.ts`: `export { onSetlistWritten } from './push/setlistTrigger';` vira `export { onMinistrySetlistWritten } from './push/setlistTrigger';`.

3. `announce.ts`: `announceNewSetlist(deps, setlistId, ministryId, beforeData, afterData)`. A chamada `buildNewSetlistMessage(setlistId, ministryId, after, before)`. Os ids de marca (`${setlistId}_novo`) não mudam.

4. `newSetlist.ts`: `buildNewSetlistMessage(setlistId: string, ministryId: string, setlist: SetlistSnapshot, before: SetlistSnapshot | undefined): RepertorioSend | null`, com `ministryId` no objeto retornado (o resto igual).

5. `rehearsal.ts`: `RehearsalSetlist` ganha `ministryId: string`. `readRehearsalSetlist(id: string, ministryId: string, data)` devolve `{ id, ministryId, ... }`. `buildRehearsalReminder(...)` tem retorno `RepertorioSend`, e o objeto `common` ganha `ministryId: setlist.ministryId`.

6. `reminders.ts`: `ReminderDeps.listRehearsalSetlists` devolve `Array<{ id: string; ministryId: string; data: Record<string, unknown> }>`. Em `runRehearsalReminders`, a leitura passa a ser `readRehearsalSetlist(s.id, s.ministryId, s.data)`.

7. `reminderDeps.ts`:

   ```ts
   import { ministryIdOf } from '../ministries/model';

   /**
    * Consulta por grupo: exige o índice de `rehearsalAt` do grupo `setlists` (Tarefa 2 da Parte P).
    * O grupo também traz a raiz `setlists/{sid}` (congelada): só entra quem está em ministries/{mid}/setlists.
    */
   listRehearsalSetlists: async (after, until) =>
     (
       await getFirestore()
         .collectionGroup('setlists')
         .where('rehearsalAt', '>', after)
         .where('rehearsalAt', '<=', until)
         .get()
     ).docs.flatMap((d) => {
       const ministryId = ministryIdOf(d.ref);
       return ministryId ? [{ id: d.id, ministryId, data: d.data() }] : [];
     }),
   ```

8. `ministries/model.ts` (criar aqui, a Tarefa 11 só importa):

   ```ts
   /** Repertório de ministério é `ministries/{mid}/setlists/{sid}`: o pai do pai é o ministério. A raiz `setlists/{sid}` não tem. */
   export function ministryIdOf(ref: { parent: { parent: { id: string } | null } }): string | undefined {
     return ref.parent.parent?.id || undefined;
   }
   ```

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/push src/ministries/model` e `npm run typecheck -w @cifras/functions`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: os listados no Passo 3, mais os testes. Mensagem sugerida: `feat(push): gatilho e lembretes do repertório por ministério`. Ao orquestrador: o release apaga a função `onSetlistWritten` (o deploy usa `--force`) e cria `onMinistrySetlistWritten`. Anotar no corpo do PR.

---

### Task 11: Estatísticas por ministério (`stats/*`)

**Por quê:** `countSettledSetlists` e `getStats` leem o grupo `setlists` e gravam `ministryId` (hoje `'hajaluz'` fixo, da #135). O admin da app vê os cartões, o ranking geral e um ministério opcional; o admin de um ministério vê só o ranking dele. O formato de retorno é o C8 (`StatsCallerResult`), compatível com `StatsResult`.

**Arquivos:**
- Modificar: `apps/functions/src/stats/countUsage.ts`, `statsDeps.ts`, `getStats.ts`
- Modificar: `apps/functions/src/stats/countUsage.test.ts`, `getStats.test.ts`
- Usar (criado na Tarefa 10): `ministryIdOf` em `apps/functions/src/ministries/model.ts`

- [ ] **Passo 1: testes que falham**

Em `countUsage.test.ts` (adaptar o fake de gravação que já existe no arquivo; o caso novo é o do `ministryId`):

```ts
it('grava o ministryId do repertório, não um valor fixo', async () => {
  const deps = usageFakeDeps({ settled: [{ id: 's1', ministryId: 'outro', date: '2026-11-20', songIds: ['a'] }] });
  await countSettledSetlists(deps);
  expect(deps.recorded).toEqual([expect.objectContaining({ setlistId: 's1', ministryId: 'outro' })]);
});
```

Em `getStats.test.ts`, os fakes ganham `usage` com `ministryId` e `readMinistry`; os casos:

```ts
it('admin da app recebe cartões (general) e o ranking do ministério escolhido', async () => {
  const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }), 'chefe', 'outro');
  expect(res.general).not.toBeNull();
  expect(res.general?.songCount).toBeTypeOf('number');
  expect(res.ministry?.id).toBe('outro');
});

it('admin da app sem ministério escolhido recebe só o geral', async () => {
  const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }), 'chefe', undefined);
  expect(res.general).not.toBeNull();
  expect(res.ministry).toBeNull();
});

it('admin do ministério recebe só o ranking dele, sem cartões gerais', async () => {
  const res = await getStatsForCaller(deps({ adm: { appAdmin: false } }, { 'adm|hajaluz': 'admin' }), 'adm', 'hajaluz');
  expect(res.general).toBeNull();
  expect(res.ministry?.id).toBe('hajaluz');
});

it('admin do ministério sem ministryId é negado (não há visão geral)', async () => {
  await expect(getStatsForCaller(deps({ adm: { appAdmin: false } }, { 'adm|hajaluz': 'admin' }), 'adm', undefined)).rejects.toMatchObject({ code: 'permission-denied' });
});

it('membro comum e admin de outro ministério são negados', async () => {
  await expect(getStatsForCaller(deps({ ana: { appAdmin: false } }, { 'ana|hajaluz': 'member' }), 'ana', 'hajaluz')).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(getStatsForCaller(deps({ adm: { appAdmin: false } }, { 'adm|outro': 'admin' }), 'adm', 'hajaluz')).rejects.toMatchObject({ code: 'permission-denied' });
});

it('uso de um ministério não entra no ranking de outro', async () => {
  const res = await getStatsForCaller(deps({ chefe: { appAdmin: true } }, {}, { usage: [{ date: '2026-11-20', songIds: ['a'], ministryId: 'outro' }] }), 'chefe', 'hajaluz');
  expect(res.ministry?.topAllTime).toEqual([]);
});
```

`deps(...)` é o helper do arquivo; o segundo argumento é a tabela de vínculos `'uid|mid' -> role` (já existe); o terceiro, a usage do fake (novo).

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/stats`. Esperado: falham (`getStatsForCaller` não existe; `ministryId` fixo).

- [ ] **Passo 3: implementação**

1. `countUsage.ts`: `SettledSetlist = { id: string; ministryId: string; date: string; songIds: string[] }`; `countSettledSetlists` grava `ministryId: setlist.ministryId`. Sai o import de `HAJALUZ_ID`.

2. `statsDeps.ts`: a consulta de grupo, com o filtro da raiz, e a usage com `ministryId`:

   ```ts
   import { ministryIdOf } from '../ministries/model';

   listSettledSetlists: async (cutoff) => {
     const snap = await getFirestore().collectionGroup('setlists').where('date', '<=', cutoff).get();
     return snap.docs.flatMap((d) => {
       const ministryId = ministryIdOf(d.ref);
       if (!ministryId) return []; // raiz setlists/{sid}: congelada, não conta
       const items: unknown = d.data().items;
       const list = Array.isArray(items) ? items : [];
       return [
         {
           id: d.id,
           ministryId,
           date: String(d.data().date ?? ''),
           songIds: list
             .map((item) => (item as { songId?: unknown } | null)?.songId)
             .filter((id): id is string => typeof id === 'string'),
         },
       ];
     });
   },
   listUsage: async () =>
     (await getFirestore().collection('setlistUsage').get()).docs.map((d) => ({
       date: String(d.data().date ?? ''),
       songIds: stringIds(d.data().songIds),
       ministryId: String(d.data().ministryId ?? ''),
     })),
   ```

   Sem filtro de `where` na usage: é coleção pequena e o `ministryId` é filtrado em memória (evita índice composto).

3. `getStats.ts`: `Usage` ganha `ministryId`; `CallerDeps` e `rankingOf` novos; `getStatsForAdmin` sai:

   ```ts
   import { HttpsError } from 'firebase-functions/v2/https';
   import { addDays, todayInSaoPaulo } from './dates';

   type Usage = { date: string; songIds: string[]; ministryId: string };

   export type MinistryRanking = { id: string; name: string; topAllTime: TopSong[]; topLast30Days: TopSong[] };
   export type StatsCallerResult = { general: StatsResult | null; ministry: MinistryRanking | null };

   type CallerDeps = StatsDeps & {
     readUser(uid: string): Promise<{ appAdmin: boolean } | null>;
     readMembership(mid: string, uid: string): Promise<{ role: 'member' | 'admin' } | null>;
     readMinistry(mid: string): Promise<{ name: string } | null>;
   };

   /** Ranking de um ministério: só os usos com esse ministryId. Mesmas regras de tally/rank do geral. */
   async function rankingOf(deps: CallerDeps, mid: string): Promise<MinistryRanking> {
     const ministry = await deps.readMinistry(mid);
     if (!ministry) throw new HttpsError('not-found', 'Ministério não encontrado.');
     const usage = (await deps.listUsage()).filter((u) => u.ministryId === mid);
     const since = addDays(todayInSaoPaulo(deps.now()), -(WINDOW_DAYS - 1));
     const allTime = tally(usage);
     const recent = tally(usage.filter((u) => u.date >= since));
     const ids = [...new Set([...allTime.keys(), ...recent.keys()])];
     const songs = await deps.getSongs(ids);
     return { id: mid, name: ministry.name, topAllTime: rank(allTime, songs), topLast30Days: rank(recent, songs) };
   }

   export async function getStatsForCaller(deps: CallerDeps, uid: string | undefined, ministryId: unknown): Promise<StatsCallerResult> {
     if (!uid) throw new HttpsError('unauthenticated', 'Login required.');
     const mid = typeof ministryId === 'string' && ministryId !== '' ? ministryId : undefined;
     const caller = await deps.readUser(uid);
     if (caller?.appAdmin === true) {
       return { general: await getStats(deps), ministry: mid ? await rankingOf(deps, mid) : null };
     }
     if (!mid) throw new HttpsError('permission-denied', 'Só o admin da app vê as estatísticas gerais.');
     const membership = await deps.readMembership(mid, uid);
     if (membership?.role !== 'admin') throw new HttpsError('permission-denied', 'Só o admin do ministério vê este ranking.');
     return { general: null, ministry: await rankingOf(deps, mid) };
   }
   ```

   Falta importar `HttpsError` (`firebase-functions/v2/https`), `WINDOW_DAYS` já é constante do arquivo. `getStats(deps)` (o geral) não muda: `StatsResult` fica igual. O `tally` passa a aceitar `Usage` com `ministryId` (ignorado ali).

4. Os callers: `index.ts` (Tarefa 13) chama `getStatsForCaller`.

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/stats src/ministries/model` e `npm run typecheck -w @cifras/functions`. Esperado: verde.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/stats/{countUsage,statsDeps,getStats}.ts` e os testes. Mensagem sugerida: `feat(stats): estatísticas por ministério e geral só para o admin da app`.

---

### Task 12: Desliga o espelho (`ministries/mirror*.ts`)

**Por quê:** a raiz fica congelada (Tarefa 3) e o cliente novo grava só em `ministries/{mid}/setlists`. O espelho copiaria a raiz (parada) por cima do caminho novo se alguém editasse a raiz pelo cliente antigo.

**Arquivos:**
- Remover: `apps/functions/src/ministries/mirror.ts`, `mirror.test.ts`, `mirrorTrigger.ts`
- Modificar: `apps/functions/src/index.ts` (remover **agora** a linha `export { mirrorSetlists } from './ministries/mirrorTrigger';`)

- [ ] **Passo 1: confirmar que nada mais importa o espelho**

Run: `git grep -n "mirror" -- apps/functions`. Esperado: só `index.ts` (export), `mirrorTrigger.ts`, `mirror.ts`, `mirror.test.ts`. Se aparecer outro uso, parar e avisar o orquestrador.

- [ ] **Passo 2: remover e ajustar o export**

Run: `git rm apps/functions/src/ministries/mirror.ts apps/functions/src/ministries/mirror.test.ts apps/functions/src/ministries/mirrorTrigger.ts`. Em `index.ts`, apagar a linha `export { mirrorSetlists } from './ministries/mirrorTrigger';`.

- [ ] **Passo 3: teste e typecheck**

Como a tarefa é remoção, o teste de regressão é o typecheck e o `index.exports` (Tarefa 13). Rodar: `npm run typecheck -w @cifras/functions`. Esperado: verde.

- [ ] **Passo 4: entrega**

Arquivos removidos e `index.ts`. Mensagem sugerida: `chore(functions): desliga o espelho de setlists raiz`. Ao orquestrador: o release apaga a Function `mirrorSetlists` (o deploy usa `--force`); anotar no corpo do PR.

---

### Task 13: Cabeamento de `index.ts` (guards, callables e limpeza de exports)

**Dependências:** Tarefas 7 (guards), 9 (`PushDeps` sem `roles`) e 11 (`getStatsForCaller`). Não começa antes delas.

**Arquivos:**
- Modificar: `apps/functions/src/index.ts`
- Modificar: `apps/functions/src/users.ts` (remover `changeUserRole`) e `users.test.ts` (se houver caso dele)
- Criar: `apps/functions/src/index.exports.test.ts`

- [ ] **Passo 1: teste de regressão de exportação**

Criar `apps/functions/src/index.exports.test.ts`, lendo o texto do arquivo (sem importar o módulo, que chama `initializeApp`):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8');

describe('exportações do pacote de ministérios', () => {
  it('não exporta o espelho, setUserRole nem o gatilho antigo', () => {
    expect(src).not.toMatch(/mirrorSetlists/);
    expect(src).not.toMatch(/export const setUserRole/);
    expect(src).not.toMatch(/\bonSetlistWritten\b/);
    expect(src).toMatch(/onMinistrySetlistWritten/);
  });
  it('confere papel por guards, não por requireRole', () => {
    expect(src).not.toMatch(/requireRole\(/);
    expect(src).not.toMatch(/getStatsForAdmin/);
    expect(src).toMatch(/requireAppAdmin\(guardDeps/);
    expect(src).toMatch(/requireUploader\(guardDeps/);
    expect(src).toMatch(/requireCatalogContributor\(guardDeps/);
    expect(src).toMatch(/getStatsForCaller\(/);
  });
});
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run test -w @cifras/functions -- src/index.exports`. Esperado: falha.

- [ ] **Passo 3: implementação**

Em `apps/functions/src/index.ts`:

1. Remover `import { requireRole } from './auth/requireRole';` e acrescentar:

   ```ts
   import { requireAppAdmin, requireCatalogContributor, requireUploader, type GuardDeps } from './auth/guards';
   ```

2. Após `const ministryDeps = createMinistryDeps();`:

   ```ts
   const guardDeps: GuardDeps = {
     readUser: ministryDeps.readUser,
     listMembershipsOfUser: ministryDeps.listMembershipsOfUser,
   };
   ```

3. Remover o `getUserRole` do objeto `deps` do módulo (a linha ~66) e o import `ROLES` se ficar sem uso (conferir com `typecheck`).

4. Trocar `import { changeUserRole, createUserProfile, type UserDeps } from './users';` por `import { createUserProfile, type UserDeps } from './users';`, e remover `export const setUserRole` inteiro. Em `users.ts`, apagar `changeUserRole` e os testes dele.

5. Trocar as guardas:
   - `replaceArrangement`: `await requireUploader(guardDeps, request.auth?.uid);` (decisão de 23/11: tom feito à mão é de quem sobe cifra);
   - `discardUpload`: `await requireCatalogContributor(guardDeps, request.auth?.uid);`;
   - `updateSongMeta`, `deleteArrangement`, `deleteSong`: `await requireAppAdmin(guardDeps, request.auth?.uid);`.

6. `getStats` (a callable):

   ```ts
   export const getStats = onCall({ region: REGION }, (request) =>
     getStatsForCaller(
       {
         ...statsDeps,
         readUser: guardDeps.readUser,
         readMembership: ministryDeps.readMembership,
         readMinistry: ministryDeps.readMinistry,
       },
       request.auth?.uid,
       (request.data ?? {}).ministryId,
     ),
   );
   ```

   O import de `getStatsForAdmin` vira `getStatsForCaller`.

7. `registerDevice`, `sendTestPush` e `unregisterDevice` seguem como estão (o `createPushDeps` já traz `readUser` e `listMembershipsOfUser`; ver Tarefa 9).

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/functions -- src/index.exports`; depois `npm run test -w @cifras/functions -- src/users src/auth`; depois `npm run typecheck -w @cifras/functions`; depois `npx eslint apps/functions/src/index.ts apps/functions/src/auth apps/functions/src/push apps/functions/src/stats apps/functions/src/ministries`. Esperado: tudo verde.

`requireRole.ts` e seus testes **ficam** (sem uso depois desta tarefa; a limpeza é #137). Se o ESLint apontar código morto, remover junto com o teste.

- [ ] **Passo 5: entrega**

Arquivos: `apps/functions/src/index.ts`, `index.exports.test.ts`, `users.ts`, `users.test.ts` (se existir). Mensagem sugerida: `feat(functions): guards por documento e exportações do pacote`.

---
---

## Parte D: design e tokens

Lane D roda depois do fim da Parte R/F (ou em paralelo a elas, sem arquivos em comum) e **antes** da Parte W, porque o cliente usa as classes. Os valores vêm do paper-spec (§2 e §3, lidos no Paper com `get_computed_styles`). A dependência do Paper deixou de ser bloqueio: o único token novo tem valor fechado.

### Task 14: Token `--color-accent-border`, classes das telas de ministério e documentação

**Por quê:** o paper-spec (§2) fecha que só **um** token é novo. Todo o resto das cores das telas já existe (`--color-scrim`, `--color-elevated`, `--color-accent`, `--color-on-accent`, `--color-primary`, `--color-error`…). Não criar tokens além desse.

**Arquivos:**
- Modificar: `apps/web/src/ui/styles.css` (token nos dois blocos: `:root` e `:root[data-theme='dark']`)
- Modificar: o arquivo com `.role-badge` (`grep -rn "role-badge" apps/web/src/ui`): borda passa a `--color-accent-border`
- Criar: `apps/web/src/ui/redesign-ministries.css` e `apps/web/src/ui/redesign-ministries.test.ts`
- Criar: `apps/web/src/ui/initials.ts` e `apps/web/src/ui/initials.test.ts` (`initialsOf`: iniciais sem partículas; usado pelos avatares de Mais, Pessoas e Gestão)
- Modificar: `apps/web/src/main.tsx` (uma importação, depois de `redesign-access.css`)
- Modificar: `docs/design-system.md` (§2: linha do token; §5: componentes; §8: mapa do Paper)

- [ ] **Passo 1: testes que falham**

Criar `apps/web/src/ui/redesign-ministries.test.ts` (o mesmo padrão de `redesign-access.test.ts`):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'redesign-ministries.css'), 'utf8');
const tokens = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');

describe('redesign-ministries.css', () => {
  it('usa só tokens: nenhum #hex, rgb() ou hsl() solto', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/);
  });

  it('todo var(--token) usado existe em styles.css', () => {
    const used = [...css.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    for (const name of new Set(used)) expect(tokens).toContain(`${name}:`);
  });

  it('declara as classes do paper-spec §3', () => {
    for (const cls of ['min-tile', 'count-badge', 'status-pill', 'role-select', 'person-row', 'request-card', 'dest-chip', 'action-menu', 'skeleton']) {
      expect(css).toContain(`.${cls}`);
    }
  });
});

describe('--color-accent-border (paper-spec §2)', () => {
  it('tema claro e escuro, com os valores fechados', () => {
    expect(tokens).toMatch(/--color-accent-border:\s*rgb\(217 119 6 \/ 40%\);/);
    expect(tokens).toMatch(/--color-accent-border:\s*rgb\(245 166 35 \/ 40%\);/);
  });
});
```

Rodar: `npm run test -w @cifras/web -- src/ui/redesign-ministries`. Esperado: falha (arquivo CSS não existe; token não existe).

Criar `apps/web/src/ui/initials.test.ts` (falha até `initials.ts` existir). Se o código já tiver um `initialsOf` (pré-voo do frontend), a regra abaixo entra nele, sem um segundo helper:

```ts
import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it.each([
    ['Casa de Oração', 'CO'],
    ['Maria Souza', 'MS'],
    ['Maria da Silva Souza', 'MS'],
    ['Ministério dos Jovens', 'MJ'],
    ['Ana', 'A'],
    ['de', 'D'],
    ['', ''],
  ])('%s -> %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
```

- [ ] **Passo 2: tokens nos dois temas**

Em `styles.css`, logo depois de `--color-accent-soft` de cada bloco:

```css
/* :root (claro) */
--color-accent-border: rgb(217 119 6 / 40%);   /* borda de pílula de papel, pílula Aguardando, contador */

/* :root[data-theme='dark'] */
--color-accent-border: rgb(245 166 35 / 40%);
```

`themeTokens.test.ts` confere que os dois blocos têm o mesmo conjunto de tokens.

No arquivo com `.role-badge`, a borda passa de `--color-accent` para `--color-accent-border`.

- [ ] **Passo 3: classes**

Criar `apps/web/src/ui/redesign-ministries.css`, escopado (cada classe com prefixo do componente), só com `var(--…)` de token e medidas do paper-spec §3. Lista mínima (os nomes são os do paper-spec): `.min-tile` (variantes `--dialog`, `--compact`, `--mini` como modificadores), `.count-badge`, `.role-badge--member`, `.role-badge--admin`, `.role-badge--app` (estendem `.role-badge`), `.status-pill`, `.role-select` (variantes `--active`, `--disabled`), `.person-row`, `.request-card`, `.dest-chip`, `.action-menu`, `.sheet` (folha inferior), `.skeleton` (blocos), `.empty-card`, `.error-box`. Telas de entrada: `.entry-card`, `.entry-row`, `.entry-footer`, `.entry-alert`, `.entry-icon`, `.entry-sent`. Mais e Gestão: `.profile-card`, `.profile-avatar`, `.section-eyebrow`, `.section-title`, `.section-count`.

Regras do paper: `.count-badge` altura 24px, `min-width: 24px`, `padding-inline: 7px`, raio 999px, fundo `--color-accent`, texto `--color-on-accent`; `.status-pill` 22px, `padding-inline: 9px`; `.role-select` 36px com `::before` de 44px para o alvo de toque; `.action-menu` `width: 216px`, `max-width: calc(100vw - 32px)`, `box-shadow: var(--shadow-pop)`; `.skeleton` com `prefers-reduced-motion: reduce` sem animação.

- [ ] **Passo 3b: `initialsOf`** (`apps/web/src/ui/initials.ts`, depois de ver o teste falhar):

```ts
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** Até duas iniciais, sem partículas ("Casa de Oração" -> "CO"). Se só sobrar partícula, usa as palavras. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const significant = words.filter((w) => !PARTICLES.has(w.toLocaleLowerCase('pt-BR')));
  return (significant.length > 0 ? significant : words)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('pt-BR'))
    .join('');
}
```

- [ ] **Passo 4: importação**

Em `apps/web/src/main.tsx`, acrescentar depois de `import './ui/redesign-access.css';`:

```ts
import './ui/redesign-ministries.css';
```

- [ ] **Passo 5: documentar**

Em `docs/design-system.md`:
- §2 (tokens): uma linha `| --color-accent-border | rgb(217 119 6 / 40%) | rgb(245 166 35 / 40%) | borda âmbar 40%: pílula de papel admin, pílula Aguardando, contador, Sim, campo em foco |`, no mesmo formato da tabela.
- §5 (componentes): linhas para contador, pílula de papel, pílula de estado, seletor de papel, linha de pessoa, cartão de pedido, chip de destino, menu de ação, folha, esqueleto, estados de bloco (vazio, erro, sucesso, informativo) e a regra de `initialsOf`. Cada linha com o componente, as classes e o arquivo (`ui/redesign-ministries.css` ou `ui/initials.ts`).
- §5, linha "Tela de acesso pendente" (~linha 112): **substituída** pelas linhas da entrada (`.entry-card`, `.entry-row`, `.entry-footer`, `.entry-alert`, `.entry-icon`, `.entry-sent`), não acrescentada ao lado. Conferir a linha antes com `git grep -n "acesso pendente" docs/design-system.md`. O `redesign-access` sai do código só na Tarefa 25; até lá o doc pode citá-lo como "a remover na 25".
- §8 (Paper): o mapa dos artboards 34 a 50 e L11 a L13, com a tela de cada um.

Rodar `npm run test:harness` (confere que todo token de `styles.css` está em `docs/design-system.md`).

- [ ] **Passo 6: rodar e entregar**

Run: `npm run test -w @cifras/web -- src/ui` e `npm run test:harness`. Esperado: verde. Arquivos: os listados acima. Mensagem sugerida: `feat(ui): token de borda âmbar e classes das telas de ministério`.

Paper: o `designer` atualiza os artboards 34 a 50 e L11 a L13 com a estrutura desta tarefa (escuro; claro nas telas raiz). Se o MCP do Paper estiver indisponível, "Paper pendente: <o que>" no PR.

---
---

## Parte W: cliente (`apps/web`)

Regras desta parte:
- Cada tarefa começa pelos testes (Vitest + Testing Library, com `createFakeGateway` e os fakes de `apps/web/src/test/`). A UI segue `docs/design-system.md` e o paper-spec (`2026-11-23-136-paper-spec.md`, que tem a estrutura, os textos e os estados de cada tela). O frontend confere o artboard no Paper (`get_jsx`) quando o texto do paper-spec não bastar.
- Textos de UI são os deste plano e do paper-spec; texto novo marcado **(inferido)** vai no PR para o `product-owner` conferir.
- Nenhuma tela acessa catálogo, repertório ou Storage antes de `access === 'granted'`.
- Os predicados vêm de `apps/web/src/auth/permissions.ts` (C4). Nenhum componente novo lê `role`: o campo sai do `AuthState`.
- Os nomes de classe são os de `ui/redesign-ministries.css` (Tarefa 14).

### Task 15: Auth: claims, vínculo e ministério atual (`auth/*`)

**Por quê:** o provedor de sessão hoje decide o acesso por `role` (claim e documento). Pelo contrato C4, o acesso passa a vir do claim `hasMinistry`/`appAdmin` (Rules leem o mesmo), o ministério atual vem do documento de vínculo, e o token é renovado quando o claim diverge do vínculo.

**Arquivos:**
- Modificar: `apps/web/src/auth/AuthProvider.tsx`, `gateway.ts`, `useAuth.ts`, `roles.ts` (remove `canEdit`, `canEditSetlists`, `isAdmin`; mantém `Role`, `ROLES`, `isRole`, `ROLE_LABELS` até a Tarefa 25)
- Criar: `apps/web/src/auth/permissions.ts`, `apps/web/src/auth/removedNotice.ts`
- Modificar testes: `apps/web/src/auth/AuthProvider.test.tsx`, `gateway.test.ts`, `apps/web/src/test/fakeGateway.ts` (migrado: sem `emitRole`)
- Criar: `apps/web/src/test/authState.ts` (helper `signInAs`, usado nas Tarefas 18 a 21)
- Migrar nesta tarefa, para ficarem verdes: os três `apps/web/src/App*.test.tsx` que importam o fake (Passo 1b). Só o login; as props de `App` saem na Tarefa 25.

- [ ] **Passo 1: testes que falham**

`apps/web/src/test/fakeGateway.ts` (novo contrato; `refreshToken` copia `nextClaims` para `claims`):

```ts
import { vi, type Mock } from 'vitest';
import type { AuthGateway, Claims, Membership, MinistryInfo, SessionUser } from '../auth/AuthProvider';

export interface FakeGateway extends AuthGateway {
  emitUser(user: SessionUser | null): void;
  emitProfile(p: { appAdmin: boolean }): void;
  emitMemberships(m: Membership[]): void;
  emitMinistry(m: MinistryInfo | null): void;
  claims: Claims;      // devolvido por getClaims()
  nextClaims: Claims;  // o que aparece depois de refreshToken()
  forgetLocalData: Mock<(removedFrom?: string) => Promise<void>>;
}

export const testUser: SessionUser = { uid: 'u1', displayName: 'Maria Souza', email: 'maria@example.com', photoURL: null };
const NONE: Claims = { appAdmin: false, hasMinistry: false, canUploadSong: false };

export function createFakeGateway(): FakeGateway {
  let userCb: ((u: SessionUser | null) => void) | undefined;
  let profileCb: ((p: { appAdmin: boolean }) => void) | undefined;
  let membershipsCb: ((m: Membership[]) => void) | undefined;
  let ministryCb: ((m: MinistryInfo | null) => void) | undefined;
  const gateway: FakeGateway = {
    claims: NONE,
    nextClaims: NONE,
    onUser: (cb) => { userCb = cb; return () => { userCb = undefined; }; },
    onUserDoc: (_uid, cb) => { profileCb = cb; return () => { profileCb = undefined; }; },
    onMemberships: (_uid, cb) => { membershipsCb = cb; return () => { membershipsCb = undefined; }; },
    onMinistry: (_id, cb) => { ministryCb = cb; return () => { ministryCb = undefined; }; },
    getClaims: () => Promise.resolve(gateway.claims),
    refreshToken: vi.fn(() => { gateway.claims = gateway.nextClaims; return Promise.resolve(); }),
    prepareSignIn: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => Promise.resolve()),
    signOut: vi.fn(() => Promise.resolve()),
    forgetLocalData: vi.fn(() => Promise.resolve()),
    emitUser: (u) => userCb?.(u),
    emitProfile: (p) => profileCb?.(p),
    emitMemberships: (m) => membershipsCb?.(m),
    emitMinistry: (m) => ministryCb?.(m),
  };
  return gateway;
}
```

**Passo 1b: migrar o fake antigo e os `App*.test.tsx`.** Listar os consumidores com `git grep -l "createFakeGateway\|emitRole" -- apps/web/src` (três `App*.test.tsx` são esperados). Troca do `emitRole`:
- `emitRole('member')` → `signInAs(g, { ministry: { role: 'member' } })`;
- `emitRole('admin')` (admin do ministério) → `signInAs(g, { ministry: { role: 'admin' } })`;
- `emitRole('appAdmin')` → `signInAs(g, { appAdmin: true })` (sem vínculo; a app admin entra);
- `visitor` ou sem papel → `signInAs(g)` (sem vínculo: `blocked`).

Nenhum teste lê `role` depois disso (o campo sai do `AuthState`). Os `App*.test.tsx` migram só o login; as props (`peopleApi`, `setlistApi`, `statsApi`) migram na Tarefa 25. Esperado ao fim da tarefa: `npm run test -w @cifras/web -- src/auth src/App`.

`apps/web/src/test/authState.ts` (novo; helper dos testes de App e das Tarefas 18 a 21). `act` do Testing Library, porque cada emissão precisa de render:

```ts
import { act } from '@testing-library/react';
import type { MinistryRole } from '../auth/useAuth';
import { testUser, type FakeGateway } from './fakeGateway';

export type Scenario = {
  appAdmin?: boolean;
  canUploadSong?: boolean;
  /** Sem `ministry`: a pessoa não tem vínculo. */
  ministry?: { id?: string; name?: string; city?: string; role?: MinistryRole };
};

/** Entra como `testUser` com o estado descrito (claims, perfil, vínculo e documento do ministério). */
export function signInAs(gateway: FakeGateway, scenario: Scenario = {}): void {
  const m = scenario.ministry;
  const appAdmin = scenario.appAdmin === true;
  // Claims antes de entrar: o provedor lê os claims ao receber o usuário.
  gateway.claims = {
    appAdmin,
    hasMinistry: m !== undefined,
    canUploadSong: scenario.canUploadSong ?? (appAdmin || m?.role === 'admin'),
  };
  act(() => {
    gateway.emitUser(testUser);
    gateway.emitProfile({ appAdmin });
    gateway.emitMemberships(m ? [{ ministryId: m.id ?? 'hajaluz', role: m.role ?? 'member' }] : []);
  });
  // Em outro act: o provedor só assina onMinistry depois de ter o vínculo renderizado.
  act(() => gateway.emitMinistry(m ? { name: m.name ?? 'Haja Luz', city: m.city ?? 'São Paulo' } : null));
}
```

`AuthProvider.test.tsx`: um `Probe` que escreve o estado em `<output data-testid="auth">` (`JSON.stringify({ access, appAdmin, canUploadSong, ministry: a.ministry, status, keys: Object.keys(a) })`). Casos, cada um com asserção concreta:

1. "sem vínculo e sem claim: access 'blocked' e ministry null": `emitUser(testUser)`, `emitProfile({ appAdmin: false })`, `emitMemberships([])`, `claims` = NONE → `access === 'blocked'`, `ministry === null`.
2. "vínculo observado e claim hasMinistry falso: refreshToken uma vez e relê os claims": `claims` = NONE, `nextClaims` = `{ appAdmin: false, hasMinistry: true, canUploadSong: false }`, `emitMemberships([{ ministryId: 'hajaluz', role: 'member' }])` → `refreshToken` chamado 1 vez; depois `access === 'granted'`.
3. "claim hasMinistry verdadeiro: ministry com name e city do documento": `claims` com `hasMinistry: true`, `emitMemberships([{ ministryId: 'hajaluz', role: 'admin' }])`, `emitMinistry({ name: 'Haja Luz', city: 'São Paulo' })` → `ministry` = `{ id: 'hajaluz', name: 'Haja Luz', city: 'São Paulo', role: 'admin' }`.
4. "appAdmin sem vínculo: granted e ministry null": `claims` com `appAdmin: true`, `emitProfile({ appAdmin: true })`, `emitMemberships([])` → `access === 'granted'`, `ministry === null`, `appAdmin === true`.
5. "vínculo que some: forgetLocalData chamado uma vez com o nome": com vínculo e `emitMinistry({ name: 'Haja Luz', city: 'São Paulo' })`, depois `emitMemberships([])` → `forgetLocalData` chamado 1 vez com `'Haja Luz'`.
6. "vínculo que aparece não limpa o cache": `emitMemberships([{ ministryId: 'hajaluz', role: 'member' }])` a partir de vazio → `forgetLocalData` não chamado.
7. "role não existe mais no AuthState": `Object.keys(valor)` não contém `'role'`.
8. "claim que não chega: tenta de novo com espera crescente e para em 6 leituras": fake timers; `claims` NONE, `nextClaims` NONE, `emitMemberships([…])` → `refreshToken` 1 vez; `await vi.advanceTimersByTimeAsync(1000)` → 2 vezes; depois `await vi.advanceTimersByTimeAsync(2000+4000+8000+16000)` (`vi.useFakeTimers()` no `beforeEach`; o `Async` deixa as promessas do refresh rodarem entre as esperas) → 6 vezes no total e não mais chamadas depois disso.

`gateway.test.ts` (Firebase mockado, como os testes atuais): `getClaims` devolve `false` quando o claim falta e não aceita `'true'` em texto; `onMemberships` tira `ministryId` de `ref.parent.parent.id` e ignora documento sem `role` válido; `forgetLocalData('Haja Luz')` grava o aviso no `sessionStorage` e chama `reload`; falha em `terminate` não impede o `reload`; `signOut` continua chamando `reload` quando `terminate` falha.

Rodar: `npm run test -w @cifras/web -- src/auth`. Esperado: falha (contrato novo).

- [ ] **Passo 2: rodar e ver falhar**

Esperado: falham todos os casos (o provedor atual não tem `onMemberships`, `getClaims` nem `forgetLocalData`).

- [ ] **Passo 3: implementação**

`apps/web/src/auth/useAuth.ts` (C4):

```ts
import { createContext, useContext } from 'react';
import type { SessionUser } from './AuthProvider';

export type MinistryRole = 'member' | 'admin';
export type CurrentMinistry = { id: string; name: string; city: string; role: MinistryRole };
export type AccessState = 'checking' | 'blocked' | 'granted';

export interface AuthState {
  status: 'loading' | 'signed-out' | 'signed-in';
  user: SessionUser | null;
  access: AccessState;
  appAdmin: boolean;
  canUploadSong: boolean;
  ministry: CurrentMinistry | null;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return value;
}
```

`apps/web/src/auth/permissions.ts`: os sete predicados do C4, sem outra lógica.

`apps/web/src/auth/removedNotice.ts` (o aviso sobrevive ao reload em `sessionStorage`; falha de storage é silenciosa):

```ts
const KEY = 'cifras:removido';

export function setRemovedNotice(ministryName: string): void {
  try { sessionStorage.setItem(KEY, ministryName); } catch { /* sem storage: sem aviso */ }
}

/** Lê sem apagar: a entrada chama no primeiro render (`useState`). */
export function peekRemovedNotice(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Apaga o aviso: a entrada chama num efeito, depois de montar (seguro no StrictMode). */
export function clearRemovedNotice(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sem storage: nada a apagar */
  }
}
```

`apps/web/src/auth/gateway.ts`: `getClaims`, `onUserDoc` (com `{ appAdmin }`; erro vira `{ appAdmin: false }`), `onMemberships`, `onMinistry`, `forgetLocalData` e `clearLocalCache` (contrato C5):

```ts
import { collectionGroup, query, where, /* + as atuais */ } from 'firebase/firestore';
import { setRemovedNotice } from './removedNotice';

export function createAuthGateway(
  { auth, db }: FirebaseServices,
  { reload = () => window.location.reload(), beforeSignOut }: { reload?: () => void; beforeSignOut?: () => Promise<void> } = {},
): AuthGateway {
  // Cache persistente do Firestore e PDFs do service worker são da pessoa anterior: apaga o que dá.
  const clearLocalCache = async () => {
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch (error) {
      console.warn('Falha ao limpar o cache local', error);
    }
    try {
      await globalThis.caches?.delete('cifras-pdfs');
    } catch (error) {
      console.warn('Falha ao limpar o cache de PDFs', error);
    }
  };

  return {
    onUser: /* igual ao atual */,
    getClaims: async () => {
      if (!auth.currentUser) return { appAdmin: false, hasMinistry: false, canUploadSong: false };
      const { claims } = await getIdTokenResult(auth.currentUser);
      return {
        appAdmin: claims.appAdmin === true,
        hasMinistry: claims.hasMinistry === true,
        canUploadSong: claims.canUploadSong === true,
      };
    },
    onUserDoc: (uid, cb) =>
      onSnapshot(
        doc(db, 'users', uid),
        (snap) => cb({ appAdmin: snap.data()?.appAdmin === true }),
        (error) => {
          console.warn('Falha ao carregar o perfil do usuário', error);
          cb({ appAdmin: false });
        },
      ),
    onMemberships: (uid, cb, onError) =>
      onSnapshot(
        query(collectionGroup(db, 'members'), where('uid', '==', uid)),
        (snap) =>
          cb(
            snap.docs.flatMap((d) => {
              const ministryId = d.ref.parent.parent?.id;
              const role: unknown = d.get('role');
              return ministryId && (role === 'member' || role === 'admin') ? [{ ministryId, role }] : [];
            }),
          ),
        onError,
      ),
    onMinistry: (ministryId, cb) =>
      onSnapshot(
        doc(db, 'ministries', ministryId),
        (snap) => {
          const data = snap.data();
          cb(data ? { name: String(data.name ?? ''), city: String(data.city ?? '') } : null);
        },
        (error) => {
          console.warn('Falha ao carregar o ministério', error);
          cb(null);
        },
      ),
    refreshToken: async () => {
      if (auth.currentUser) await getIdToken(auth.currentUser, true);
    },
    prepareSignIn: /* igual ao atual (com o comentário sobre _getInstance) */,
    signIn: /* igual ao atual */,
    signOut: async () => {
      try {
        await beforeSignOut?.(); // a callable de avisos exige sessão; falha não impede o logout
      } catch (error) {
        console.warn('Falha ao desativar os avisos ao sair', error);
      }
      await signOut(auth);
      await clearLocalCache();
      reload();
    },
    forgetLocalData: async (removedFrom) => {
      if (removedFrom) setRemovedNotice(removedFrom);
      await clearLocalCache();
      reload();
    },
  };
}
```

`apps/web/src/auth/AuthProvider.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState, type CurrentMinistry, type MinistryRole } from './useAuth';

export interface SessionUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}
export type Claims = { appAdmin: boolean; hasMinistry: boolean; canUploadSong: boolean };
export type Membership = { ministryId: string; role: MinistryRole };
export type MinistryInfo = { name: string; city: string };

export interface AuthGateway {
  onUser(cb: (u: SessionUser | null) => void): () => void;
  getClaims(): Promise<Claims>;
  onUserDoc(uid: string, cb: (profile: { appAdmin: boolean }) => void): () => void;
  onMemberships(uid: string, cb: (m: Membership[]) => void, onError: (e: unknown) => void): () => void;
  onMinistry(ministryId: string, cb: (m: MinistryInfo | null) => void): () => void;
  refreshToken(): Promise<void>;
  prepareSignIn(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  forgetLocalData(removedFrom?: string): Promise<void>;
}

/** Esperas (ms) entre releituras do token enquanto o gatilho que grava os claims não termina (~31 s ao todo). */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const NO_CLAIMS: Claims = { appAdmin: false, hasMinistry: false, canUploadSong: false };

type Session = { resolved: false } | { resolved: true; user: SessionUser | null };
type Loaded<T> = { loaded: boolean; value: T };
type Memberships = { loaded: boolean; failed: boolean; list: Membership[] };

export function AuthProvider({ gateway, children }: { gateway: AuthGateway; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ resolved: false });
  const [claims, setClaims] = useState<Loaded<Claims>>({ loaded: false, value: NO_CLAIMS });
  const [profile, setProfile] = useState<Loaded<{ appAdmin: boolean }>>({ loaded: false, value: { appAdmin: false } });
  const [memberships, setMemberships] = useState<Memberships>({ loaded: false, failed: false, list: [] });
  const [ministryInfo, setMinistryInfo] = useState<MinistryInfo | null>(null);
  const uid = session.resolved ? session.user?.uid : undefined;
  const hadMinistry = useRef(false);
  const lastMinistryName = useRef<string | undefined>(undefined);

  useEffect(() => gateway.onUser((user) => setSession({ resolved: true, user })), [gateway]);

  // Claims: lidos ao entrar; relidos depois de cada refresh (abaixo).
  useEffect(() => {
    if (!uid) return;
    let active = true;
    gateway.getClaims().then(
      (value) => { if (active) setClaims({ loaded: true, value }); },
      (error: unknown) => {
        console.warn('Falha ao ler as permissões do token', error);
        if (active) setClaims({ loaded: true, value: NO_CLAIMS });
      },
    );
    return () => {
      active = false;
      setClaims({ loaded: false, value: NO_CLAIMS });
    };
  }, [gateway, uid]);

  // Perfil (appAdmin do documento) e vínculos, em tempo real.
  useEffect(() => {
    if (!uid) return;
    const offProfile = gateway.onUserDoc(uid, (value) => setProfile({ loaded: true, value }));
    const offMemberships = gateway.onMemberships(
      uid,
      (list) => setMemberships({ loaded: true, failed: false, list }),
      (error) => {
        console.warn('Falha ao ler os vínculos', error);
        setMemberships((prev) => ({ ...prev, loaded: true, failed: true }));
      },
    );
    return () => {
      offProfile();
      offMemberships();
      lastMinistryName.current = undefined;
      setProfile({ loaded: false, value: { appAdmin: false } });
      setMemberships({ loaded: false, failed: false, list: [] });
    };
  }, [gateway, uid]);

  // Ministério atual: o primeiro vínculo (a interface aceita um só).
  const first = memberships.list[0];
  const ministryId = first?.ministryId;
  useEffect(() => {
    setMinistryInfo(null);
    if (!ministryId) return;
    return gateway.onMinistry(ministryId, setMinistryInfo);
  }, [gateway, ministryId]);
  useEffect(() => {
    if (ministryInfo) lastMinistryName.current = ministryInfo.name;
  }, [ministryInfo]);

  // Vínculo que some (havia, agora não há): apaga o cache local e avisa na entrada.
  useEffect(() => {
    const has = memberships.list.length > 0;
    const had = hadMinistry.current;
    hadMinistry.current = has;
    if (memberships.loaded && had && !has) void gateway.forgetLocalData(lastMinistryName.current);
  }, [gateway, memberships]);

  // Claim divergente do vínculo ou do appAdmin do documento: renova o token e relê os claims.
  // O gatilho que grava os claims pode levar segundos: repete com espera crescente, e para.
  const hasMinistry = memberships.list.length > 0;
  const appAdminDoc = profile.value.appAdmin;
  const ready = claims.loaded && profile.loaded && memberships.loaded && !memberships.failed;
  const mismatch = ready && (claims.value.hasMinistry !== hasMinistry || claims.value.appAdmin !== appAdminDoc);
  useEffect(() => {
    if (!uid || !mismatch) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          await gateway.refreshToken();
          const value = await gateway.getClaims();
          if (!active) return;
          setClaims({ loaded: true, value });
          if (value.hasMinistry === hasMinistry && value.appAdmin === appAdminDoc) return;
        } catch (error) {
          console.warn('Falha ao atualizar o token de sessão', error);
          return;
        }
        if (attempt >= RETRY_DELAYS_MS.length) return;
        await new Promise<void>((resolve) => { timer = setTimeout(resolve, RETRY_DELAYS_MS[attempt] ?? 0); });
        if (!active) return;
      }
    })();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [gateway, uid, mismatch, hasMinistry, appAdminDoc]);

  // Estável entre mudanças de sessão: a tela de entrada aquece o popup uma vez só.
  const prepareSignIn = useCallback(() => gateway.prepareSignIn(), [gateway]);

  const value = useMemo<AuthState>(() => {
    const user = session.resolved ? session.user : null;
    const status: AuthState['status'] =
      !session.resolved || (user && !profile.loaded) ? 'loading' : user ? 'signed-in' : 'signed-out';
    const access: AuthState['access'] =
      status !== 'signed-in' || !claims.loaded
        ? 'checking'
        : claims.value.hasMinistry || claims.value.appAdmin
          ? 'granted'
          : 'blocked';
    const ministry: CurrentMinistry | null =
      first && ministryInfo
        ? { id: first.ministryId, name: ministryInfo.name, city: ministryInfo.city, role: first.role }
        : null;
    return {
      status,
      user,
      access,
      appAdmin: claims.value.appAdmin,
      canUploadSong: claims.value.canUploadSong,
      ministry,
      prepareSignIn,
      signIn: () => gateway.signIn(),
      signOut: () => gateway.signOut(),
    };
  }, [session, profile.loaded, claims, first, ministryInfo, gateway, prepareSignIn]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

Pontos a verificar no PR: (a) `forgetLocalData` roda uma vez por transição, mesmo sob o StrictMode (o efeito só age quando `had && !has`); (b) o efeito de sincronização não guarda chave de dedupe: as dependências já impedem repetição.

`roles.ts`: remover `canEdit`, `canEditSetlists` e `isAdmin`; os demais exports ficam até a Tarefa 25 (os consumidores migram nas tarefas 18 a 24).

- [ ] **Passo 4: rodar e ver passar**

Run: `npm run test -w @cifras/web -- src/auth`. Esperado: verde. O `typecheck` do cliente fecha só na Tarefa 25.

- [ ] **Passo 5: entrega**

Arquivos: os listados no Passo 3 e os testes. Mensagem sugerida: `feat(web): vínculo e claims no provedor de sessão`.

---

### Task 16: Dados de ministérios no cliente (`ministries/ministriesApi.ts`)

**Arquivos:** criar `apps/web/src/ministries/ministriesApi.ts`, `normalize.ts`, `callable.ts` (único lugar que traduz erro de callable), `apps/web/src/stats/types.ts`, `apps/web/src/test/fakeMinistriesApi.ts` (usado pelas Tarefas 17, 22, 23 e 25) e os testes `ministriesApi.test.ts`, `normalize.test.ts`, `callable.test.ts` (contrato C6). A Tarefa 24 reusa `stats/types.ts` e `callable.ts`.

Tipos de estatísticas, sem duplicar: `StatsResult` é o `Stats` que já existe em `stats/statsApi.ts`; `stats/types.ts` reexporta (`export type { Stats as StatsResult, TopSong } from './statsApi';`; se `TopSong` não existir em `statsApi.ts`, define-o em `types.ts` com o formato do ranking atual) e acrescenta só `MinistryRanking` e `StatsCallerResult` (C8). `formatBytes` continua em `statsApi.ts`: não se apaga, porque `statsApi.test.ts` importa.

- [ ] **Passo 1: testes**
  - `normalize.ts`: `normalizeForSearch('São Paulo')` é `'sao paulo'` (mesma regra de `functions/src/ministries/model.ts`, copiada, não importada entre pacotes): `text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()`.
  - `listMinistries`: ordena por `name` (pt-BR) e devolve `nameNormalized`.
  - `subscribeMyRequests(uid)`: a consulta é `collectionGroup(db,'requests')` com `where('uid','==',uid)`; o teste confere os argumentos do mock.
  - `countPending(mid)`: `getCountFromServer` sobre `ministries/{mid}/requests` com `where('status','==','pending')`.
  - `callable.*`: cada método chama `httpsCallable` com a chave de C3 (`{ ministryId }`, `{ ministryId, uid }`, `{ ministryId, uid, role }` etc.).
  - falha **depois** do `ok` (a callable resolve e a releitura falha): o erro sai com a mensagem "Não foi possível concluir. Tente de novo." (`ministriesApi` embrulha só as leituras pós-escrita; a callable devolve o erro do servidor quando tem `message`).
  - `callable.ts`: `callCallable` devolve `data`; erro com `code` `functions/failed-precondition` e `message` vira `CallableError` com `code === 'failed-precondition'` (sem o prefixo) e a mensagem do servidor; erro `functions/internal` (ou sem `code`) vira `CallableError` com a mensagem genérica; `messageFor(error, fallback)` devolve a mensagem do servidor só para os quatro códigos conhecidos, senão o `fallback`.
  - `fakeMinistriesApi` (criado nesta tarefa): leituras vazias e callables resolvidas por padrão; cada teste sobrescreve só o que usa.
- [ ] **Passo 2: rodar e ver falhar** (`npm run test -w @cifras/web -- src/ministries`).
- [ ] **Passo 3: implementação**: `createMinistriesApi({ db, loadFunctions }: FirebaseServices): MinistriesApi`, com `collection`, `collectionGroup`, `query`, `where`, `getCountFromServer` do Firestore SDK e `httpsCallable` (importado com `import('firebase/functions')` como em `stats/statsApi.ts`). Erro de callable tem um único tradutor, `apps/web/src/ministries/callable.ts` (também usado por `statsApi.ts` na Tarefa 24). Preserva `code` (sem `functions/`) e a `message` do servidor só para `failed-precondition`, `permission-denied`, `not-found` e `invalid-argument`; qualquer outro erro vira "Não foi possível concluir. Tente de novo.". Ninguém mais traduz erro de callable (a Tarefa 22 lê `code` por `messageFor`):

```ts
// apps/web/src/ministries/callable.ts
export const GENERIC_MESSAGE = 'Não foi possível concluir. Tente de novo.';
/** Códigos do servidor cuja `message` é a que a pessoa vê (HttpsError). */
export const KNOWN_CODES = ['failed-precondition', 'permission-denied', 'not-found', 'invalid-argument'] as const;

export class CallableError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CallableError';
  }
}

export async function callCallable<T>(call: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await call()).data;
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code.replace(/^functions\//, '') : 'unknown';
    const serverMessage = typeof e.message === 'string' ? e.message : undefined;
    const known = (KNOWN_CODES as readonly string[]).includes(code) && serverMessage !== undefined;
    throw new CallableError(code, known ? serverMessage : GENERIC_MESSAGE);
  }
}

/** Mensagem para a pessoa: a do servidor quando o código é conhecido; senão o `fallback`. */
export function messageFor(error: unknown, fallback: string): string {
  return error instanceof CallableError && (KNOWN_CODES as readonly string[]).includes(error.code)
    ? error.message
    : fallback;
}
```

`apps/web/src/test/fakeMinistriesApi.ts` (novo, nesta tarefa): `createFakeMinistriesApi(overrides)` devolve um `MinistriesApi` em que as leituras entregam listas vazias, `subscribeMyRequests` devolve `() => {}` e cada callable é `vi.fn(() => Promise.resolve())` (`createMinistry` resolve `{ ministryId: 'novo' }`, `getStats` resolve `{ general: null, ministry: null }`). `overrides.callable` mescla por campo, sem substituir o objeto inteiro. Os testes das Tarefas 17, 22, 23 e 25 usam este fake.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(web): API de ministérios e pedidos`.

---

### Task 17: Entrada (quem não tem acesso)

**Por quê:** substitui "Acesso ainda não liberado" (`AccessPending`) pela entrada do paper-spec (telas 34 a 37 e o bloco "Removido" da tela 50). A entrada não lê catálogo nem repertório: só `subscribeMyRequests`, `listMinistries` e as callables.

**Arquivos:**
- Criar: `apps/web/src/ministries/entry/EntryPage.tsx`, `EntryChoose.tsx`, `EntryConfirm.tsx`, `EntrySent.tsx`, e os testes de cada um
- Modificar: `apps/web/src/routes/RequireAccess.tsx` (+ `RequireAccess.test.tsx`), `apps/web/src/routes/LoginPage.tsx` (nota), `routes/LoginPage.test.tsx`
- Modificar: `apps/web/src/routes/routes.test.tsx` (linha ~45: confere a nota nova do login no lugar da antiga; o teste muda nesta tarefa, não na 25)
- Criar: `apps/web/src/auth/removedNotice.test.ts` (`peekRemovedNotice` e `clearRemovedNotice`, criados na Tarefa 15)
- Remover: `apps/web/src/routes/AccessPending.tsx`, `AccessPending.test.tsx`

Textos exatos (pt-BR, do paper-spec, telas 34 a 37 e 50):

| Lugar | Texto |
| --- | --- |
| Eyebrow (34) | "Olá, {primeiro nome}" (sem nome: linha omitida **(inferido)**) |
| Título (34) | "Escolha seu ministério" |
| Apoio (34) | "Peça para entrar no ministério em que você toca. Um admin dele precisa aprovar." |
| Busca (34) | placeholder "Buscar ministério…", `aria-label` "Buscar ministério" |
| Linha (34) | `aria-label` "Pedir para entrar em {nome}, {cidade}"; texto "{nome}" e "{cidade}" |
| Vazio (50) | "Nenhum ministério encontrado" / "Confira o nome ou peça ao admin da app para criar o seu ministério." |
| Erro (50) | "Não foi possível carregar os ministérios. Tente de novo." + "Tentar de novo" |
| Carregando (50) | esqueleto (`.skeleton`, `aria-busy="true"`), texto oculto "Carregando…" |
| Rodapé (34) | eyebrow "Conta", e-mail, botão "Sair" |
| Diálogo (35) | título "Pedir para entrar em {nome}?"; texto "Um admin da {nome} vai receber o seu pedido. Quando ele aprovar, o app abre sozinho."; "Cancelar" e "Pedir para entrar" |
| Erro do pedido (35) | "Não foi possível enviar o pedido. Tente de novo." **(inferido)** |
| Pedido enviado (36) | título "Pedido enviado"; texto "Um admin da {nome} precisa aprovar. Quando ele aprovar, o app abre sozinho; você não precisa sair e entrar."; eyebrow "Pedido para" + "{nome} · {cidade}"; pílula "Aguardando"; eyebrow "Conta" + e-mail; "Cancelar pedido" e "Sair" |
| Pedido recusado (37) | caixa `role="alert"`: "Seu pedido para {nome} não foi aprovado."; apoio "Você pode pedir de novo ou escolher outro ministério." |
| Removido (50) | caixa informativa: "Você não faz mais parte de {nome}." e apoio "Escolha um ministério para continuar." |
| Nota do login | "Quem entra pela primeira vez escolhe o ministério e pede para entrar. Um admin aprova." (texto novo, para o `product-owner`) |

- [ ] **Passo 1: testes que falham**
  - `RequireAccess.test.tsx`: com `access === 'checking'` mostra "Carregando…" (`role="status"`); com `blocked` mostra `EntryPage` e **não** monta os provedores de dados (um `SetlistsProvider` de teste registra a montagem num contador; o contador fica em zero); com `granted` renderiza o `Outlet`.
  - `EntryPage.test.tsx`: `listMinistries` é chamado uma vez pela própria página, inclusive com pedido pendente (a tela "Pedido enviado" mostra nome e cidade depois de recarregar); `subscribeMyRequests` com `pending` mostra "Pedido enviado" e "Um admin da Haja Luz precisa aprovar."; com `rejected` mostra "Seu pedido para Haja Luz não foi aprovado." e a lista de escolha; "Cancelar pedido" chama `callable.cancelRequest('hajaluz')`; sem pedidos, a lista aparece.
  - `EntryChoose.test.tsx`: busca "sao" acha "São Paulo" e "Sao Carlos" (sem acento e sem maiúscula); vazio mostra "Nenhum ministério encontrado"; erro mostra "Não foi possível carregar os ministérios. Tente de novo." e "Tentar de novo" chama `onRetry` (quem refaz a leitura é a `EntryPage`, testada no próprio `EntryPage.test.tsx`).
  - `EntryConfirm.test.tsx`: tocar numa linha abre o diálogo com "Pedir para entrar em Haja Luz?"; "Pedir para entrar" chama `callable.requestAccess('hajaluz')` e desabilita o botão (`aria-busy`) durante a chamada; erro mostra "Não foi possível enviar o pedido. Tente de novo."; Esc fecha; foco inicial em "Cancelar".
  - `removedNotice.test.ts`: `peekRemovedNotice()` devolve o nome sem apagar (duas leituras, mesmo valor); `clearRemovedNotice()` apaga e a leitura seguinte devolve `null`; `sessionStorage` que lança não derruba nada.
  - `EntryPage` (aviso de remoção): com o nome no `sessionStorage`, o aviso aparece no primeiro render e o storage fica vazio depois do efeito.
  - `LoginPage.test.tsx` e `routes.test.tsx` (linha ~45): a nota nova aparece; a antiga sai.

- [ ] **Passo 2: rodar e ver falhar.** `npm run test -w @cifras/web -- src/ministries/entry src/routes`.

- [ ] **Passo 3: implementação**

`RequireAccess.tsx` recebe a API (o `App` passa, Tarefa 25):

```tsx
import { Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import type { MinistriesApi } from '../ministries/ministriesApi';
import { EntryPage } from '../ministries/entry/EntryPage';

/**
 * Layout route entre RequireAuth e os provedores de dados: sem acesso liberado, nenhum
 * provedor, listener ou rota de dados é montado. A entrada só lê vínculos e pedidos da própria pessoa.
 */
export function RequireAccess({ api }: { api: MinistriesApi }) {
  const { access } = useAuth();
  if (access === 'checking')
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  if (access === 'blocked') return <EntryPage api={api} />;
  return <Outlet />;
}
```

`removedNotice.ts` (Tarefa 15): a `EntryPage` lê com `peekRemovedNotice()` no `useState` (primeiro render) e apaga com `clearRemovedNotice()` num `useEffect`. Assim o aviso sobrevive ao StrictMode (a segunda montagem lê o mesmo valor). A nota do login muda (tabela acima), e `routes/routes.test.tsx` (linha ~45) acompanha nesta tarefa.

`EntryPage.tsx` (código exato):

```tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/useAuth';
import { clearRemovedNotice, peekRemovedNotice } from '../../auth/removedNotice';
import type { MinistriesApi, MinistryItem } from '../ministriesApi';
import { EntryChoose } from './EntryChoose';
import { EntrySent } from './EntrySent';

type Requests = { loaded: boolean; failed: boolean; pending: string | null; rejected: string | null };
type Catalog = { status: 'loading' | 'ready' | 'error'; list: MinistryItem[] };

export function EntryPage({ api }: { api: MinistriesApi }) {
  const { user, signOut } = useAuth();
  const uid = user?.uid;
  const [requests, setRequests] = useState<Requests>({ loaded: false, failed: false, pending: null, rejected: null });
  // A página é dona da leitura de ministérios: EntryChoose e EntrySent usam o mesmo `catalog`.
  const [attempt, setAttempt] = useState(0);
  const [catalog, setCatalog] = useState<Catalog>({ status: 'loading', list: [] });
  // Lido no primeiro render e apagado num efeito (StrictMode: o useState repete a leitura sem apagar).
  const [removed] = useState(() => peekRemovedNotice());
  const [busy, setBusy] = useState(false);
  const [exitFailed, setExitFailed] = useState(false);

  useEffect(() => {
    clearRemovedNotice();
  }, []);

  useEffect(() => {
    let active = true;
    api.listMinistries().then(
      (list) => {
        if (active) setCatalog({ status: 'ready', list });
      },
      () => {
        if (active) setCatalog({ status: 'error', list: [] });
      },
    );
    return () => {
      active = false;
    };
  }, [api, attempt]);

  useEffect(() => {
    if (!uid) return;
    return api.subscribeMyRequests(
      uid,
      (list) => {
        setRequests({
          loaded: true,
          failed: false,
          pending: list.find((r) => r.status === 'pending')?.ministryId ?? null,
          rejected: list.find((r) => r.status === 'rejected')?.ministryId ?? null,
        });
      },
      () => setRequests((prev) => ({ ...prev, loaded: true, failed: true })),
    );
  }, [api, uid]);

  if (!requests.loaded && !requests.failed)
    return (
      <main className="entry-card" aria-busy="true">
        <p role="status" className="sr-only">Carregando…</p>
      </main>
    );

  const pendingId = requests.pending;
  if (pendingId) {
    return (
      <EntrySent
        ministries={catalog.status === 'ready' ? catalog.list : null}
        ministryId={pendingId}
        email={user?.email ?? ''}
        // EntrySent mostra "Não foi possível concluir. Tente de novo." quando esta promessa rejeita.
        onCancel={async () => {
          setBusy(true);
          try {
            await api.callable.cancelRequest(pendingId);
          } finally {
            setBusy(false);
          }
        }}
        onExit={exit}
        busy={busy}
      />
    );
  }

  return (
    <EntryChoose
      api={api}
      catalog={catalog}
      onRetry={() => {
        setCatalog({ status: 'loading', list: [] });
        setAttempt((n) => n + 1);
      }}
      firstName={user?.displayName?.split(' ')[0]}
      rejectedId={requests.rejected}
      removedFrom={removed}
      email={user?.email ?? ''}
      onExit={exit}
      exitFailed={exitFailed}
    />
  );

  function exit() {
    setExitFailed(false);
    signOut().catch(() => setExitFailed(true));
  }
}
```

Observações: (a) `cancelRequest` com erro: o `EntrySent` mostra "Não foi possível concluir. Tente de novo." (ele trata a promessa rejeitada). (b) Falha ao ler os pedidos (`requests.failed`): a lista de escolha aparece, sem "Pedido enviado" e sem a caixa de recusa **(inferido)**. (c) A leitura de ministérios é da própria `EntryPage`: uma vez por montagem e de novo só por "Tentar de novo" (`attempt`). Como `EntryChoose` e `EntrySent` recebem o mesmo `catalog`, o pedido enviado mostra nome e cidade também depois de recarregar a página. Falha na leitura de ministérios em "Pedido enviado" deixa só o título, como descrito em `EntrySent`.

`EntrySent.tsx`: recebe `ministries`, `ministryId`, `email`, `onCancel` (com estado de erro interno: "Não foi possível concluir. Tente de novo."), `onExit`, `busy`. Mostra o cartão de (36): tile mini, "Pedido para", "{nome} · {cidade}", pílula "Aguardando", "Conta" e e-mail; `role="status"` no bloco de título. Enquanto `ministries` for `null`, mostra só o título "Pedido enviado". Botões: "Cancelar pedido" (`.entry-footer`, largura total), "Sair" (texto).

`EntryChoose.tsx`: recebe `catalog` (`{ status, list }`) e `onRetry` da `EntryPage`; não chama `listMinistries` sozinho (estados: carregando, vazio, erro, lista); busca com `normalizeForSearch`, mostra a caixa "Seu pedido para {nome} não foi aprovado." quando `rejectedId` (busca o nome em `ministries`), mostra a caixa informativa "Você não faz mais parte de {removedFrom}." quando `removedFrom` (com o apoio "Escolha um ministério para continuar."). Ao tocar numa linha, abre `EntryConfirm`. Ao concluir o pedido, o `EntryPage` troca para `EntrySent` pela assinatura (sem estado local).

`EntryConfirm.tsx`: diálogo (`role="dialog"`, `aria-modal`, `aria-labelledby`), foco inicial em "Cancelar", Esc e toque no scrim cancelam, `api.callable.requestAccess(ministry.id)` no "Pedir para entrar". Erro vira a caixa vermelha dentro do diálogo.

- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(web): entrada com escolha e pedido de ministério`. Remover `AccessPending.tsx` e o teste no mesmo commit; `redesign-access.css` sai na Tarefa 25.

---

### Task 18: Repertórios no ministério atual (`setlists/*`)

**Arquivos:** modificar `setlists/setlistApi.ts`, `setlists/SetlistPage.tsx`, `setlists/SetlistsTab.tsx`, `setlists/NextCultoCard.tsx` (se usar `role`), `setlists/ActiveSetlistProvider.tsx` (sem mudança de formato de link), e os testes. Ajustes de teste nesta tarefa: `setlistApi.firebase.test.ts` passa `{ ministryId: 'hajaluz' }` em `createSetlistApi` (linhas ~55, 174, 197 e 252); `SetlistPage.test.tsx` (linha ~100) confere o título, a frase de apoio e o botão da tela 49.

- [ ] **Passo 1: testes que falham**
  - `subscribeSetlists` lê `ministries/{mid}/setlists` (nunca a raiz): o mock de `collection` recebe `('ministries', 'hajaluz', 'setlists')`.
  - `subscribeSetlist('x')` de id que não existe no ministério devolve `setlist: null`, e a tela 49 mostra o título "Repertório não encontrado" (sem ponto), a frase de apoio do paper-spec e o botão "Ver repertórios".
  - `updateSetlistMeta`, `applyOp` e `deleteSetlist` gravam em `ministries/{mid}/setlists/{id}`.
  - `setlistApi.firebase.test.ts` (emulador): repertório de outro ministério não aparece na lista do `hajaluz`.
  - `SetlistPage.test.tsx`: `editable` é true só para `ministry.role === 'admin'`; membro vê o repertório sem "Editar" e sem "Excluir".
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação**

  `setlistApi.ts`: a API recebe o ministério; todos os caminhos passam pelos dois helpers:

  ```ts
  export function createSetlistApi(
    { auth, db }: FirebaseServices,
    { ministryId, hostname = window.location.hostname }: { ministryId: string; hostname?: string },
  ): SetlistApi {
    const setlistsCol = () => collection(db, 'ministries', ministryId, 'setlists');
    const setlistRef = (id: string) => doc(db, 'ministries', ministryId, 'setlists', id);
    // ...o resto da API troca `collection(db, 'setlists')` por `setlistsCol()` e `doc(db, 'setlists', id)` por `setlistRef(id)`
  }
  ```

  Tela 49 (`SetlistPage.tsx`, quando `subscribeSetlist` devolve `null` depois de carregar; paper-spec, bloco "49 · Repertório não encontrado"): sem barra inferior, "‹ Voltar" no topo, bloco de ícone (64px, `.empty-card`, ícone de camadas 30px), título `h1` "Repertório não encontrado" (sem ponto), apoio "Esse repertório não existe no seu ministério ou foi removido. Confira o link com quem compartilhou.", botão `.btn-primary` "Ver repertórios" (largura total). O botão leva à aba Repertório (`/busca?aba=repertorios`, **inferido** na rota exata). Foco inicial no `h1` (`tabIndex={-1}`).

  ```tsx
  export function SetlistNotFound() {
    const navigate = useNavigate();
    const titleRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
      titleRef.current?.focus();
    }, []);
    return (
      <main className="empty-card">
        <h1 ref={titleRef} tabIndex={-1}>Repertório não encontrado</h1>
        <p>Esse repertório não existe no seu ministério ou foi removido. Confira o link com quem compartilhou.</p>
        <button type="button" className="btn-primary" onClick={() => navigate('/busca?aba=repertorios')}>Ver repertórios</button>
      </main>
    );
  }
  ```

  `SetlistPage.tsx`:

  ```tsx
  import { canEditSetlist } from '../auth/permissions';
  import { useAuth } from '../auth/useAuth';
  // ...
  const auth = useAuth();
  const editable = canEditSetlist(auth) && !active.removed;
  ```

  `ActiveSetlistProvider.tsx`: sem mudança de formato. Ele lê o id de `/repertorios/:id` ou de `?repertorio=` (links antigos continuam iguais), e a API do ministério atual devolve `null` quando o id não existe nele. O reset de estado quando o ministério muda vem de `key={ministry.id}` no escopo da Tarefa 25.

  `SetlistsTab.tsx` e `NextCultoCard.tsx`: se usarem `role`, trocar pelo predicado (`canEditSetlist` para editar, `canListSetlists` para aparecer).

- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(setlists): repertórios no ministério atual`.

---

### Task 19: Viewer: "Mudar tom" para todos, "Gerenciar" só para admin da app (`viewer/*`)

**Arquivos:** modificar `viewer/ViewerPage.tsx` (linhas 15, 153, 423 e 501 hoje usam `canEdit`/`isAdmin`/`role`), `viewer/ManageMenu.tsx`, e os `ViewerPage.*.test.tsx`.

- [ ] **Passo 1: testes:** membro vê "Mudar tom" (`canChangeKey`) e não vê "Gerenciar"; admin do ministério também não vê "Gerenciar"; admin da app vê "Gerenciar" (apagar cifra, corrigir nome e cantor); pessoa sem ministério e sem app admin não abre o viewer (fica na entrada, Tarefa 17); `repertorio=` de outro ministério mostra "Repertório não encontrado".
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação:**

  ```tsx
  const auth = useAuth();
  const canChange = canChangeKey(auth);     // antes: canEdit(role)
  const admin = canManageSongs(auth);       // antes: isAdmin(role)
  ```

  `ManageMenu` só renderiza com `admin`. Nenhum outro comportamento muda.
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(viewer): tom para todo membro e gerenciar só para admin da app`.

---

### Task 20: Busca: "＋ Nova cifra" e aba Repertórios (`search/HomePage.tsx`, `routes/RequireRole.tsx`)

**Arquivos:** modificar `search/HomePage.tsx` (as duas ocorrências de `TABS`: a barra de abas, hoje ~73, e a resolução de `?aba=`, hoje ~142; conferir no pré-voo), `HomePage.test.tsx`; modificar `routes/RequireRole.tsx` e criar `routes/RequireRole.test.tsx`.

- [ ] **Passo 1: testes:** `?aba=repertorios` sem `canListSetlists` mostra a primeira aba visível e não renderiza a aba Repertórios em nenhuma das duas ocorrências de `TABS`; "＋ Nova cifra" só com `canUpload`; aba "Repertório" só com `canListSetlists`; botão de novo repertório só com `canEditSetlist`; `RequireRole when="upload"` redireciona para `/` quando a pessoa não pode subir.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação.**

  ```tsx
  // HomePage.tsx
  const auth = useAuth();
  // Uma lista só, usada nas DUAS ocorrências de TABS (barra de abas e resolução de ?aba=).
  const visibleTabs = TABS.filter((t) => t.id !== 'repertorios' || canListSetlists(auth));
  // ?aba=repertorios sem permissão cai na primeira aba visível (a aba escondida nunca aparece).
  const requested = searchParams.get('aba'); // o nome de `searchParams` é o que a HomePage já usa
  const activeTab = visibleTabs.find((t) => t.id === requested) ?? visibleTabs[0];
  // ...no lugar de `(tab.id === 'repertorios' ? canEditSetlists(role) : canEdit(role))`:
  {(tab.id === 'repertorios' ? canEditSetlist(auth) : canUpload(auth)) && /* botão atual */}
  ```

  `RequireRole` (sem `roles`):

  ```tsx
  import { Navigate, Outlet } from 'react-router';
  import { canUpload, isAppAdmin, isMinistryAdmin } from '../auth/permissions';
  import { useAuth } from '../auth/useAuth';

  export function RequireRole({ when }: { when: 'upload' | 'appAdmin' | 'ministryAdmin' }) {
    const auth = useAuth();
    const ok = when === 'upload' ? canUpload(auth) : when === 'appAdmin' ? isAppAdmin(auth) : isMinistryAdmin(auth);
    return ok ? <Outlet /> : <Navigate to="/" replace />;
  }
  ```
- [ ] **Passo 4 e 5:** verde; mensagem sugerida `feat(search): nova cifra e repertórios conforme o papel`.

---

### Task 21: Mais e Avisos (`more/MaisPage.tsx`, `push/PushProvider.tsx`, `push/AvisosCard.tsx`)

**Arquivos:** modificar `more/MaisPage.tsx` (linhas 3, 44, 61, 75, 89, 103 hoje), `more/MaisPage.test.tsx`, `push/PushProvider.tsx` (linhas 2, 17, 19), `push/AvisosCard.tsx` (linhas 2, 27, 35), e `push/*.test.tsx` correspondentes.

Estrutura pela ordem do paper-spec (telas 38 a 40 e L11 a L13):
- perfil (`.profile-card`): nome, e-mail e pílulas de papel: "{Ministério} · Membro" (`.role-badge--member`), "{Ministério} · Admin" (`--admin`), "Admin da app" (`--app`); admin da app que também é admin do ministério vê as duas, "Admin da app" primeiro;
- bloco do ministério (só com `ministry !== null`, e as linhas só para admin do ministério): "Pessoas do ministério" (com `count-badge` de `countPending(ministry.id)`, `aria-label` "Pessoas do ministério, {N} pedidos pendentes"), "Estatísticas do ministério", "Importar" (só com `canUpload`);
- bloco comum: "Avisos" (só com `ministry !== null`, `AvisosRow`) e "Sair";
- bloco da app (só com `appAdmin`): "Gestão" com `count-badge` de `countPendingAll()`.
- Nenhuma linha "Pessoas · Em breve" (decisão de 23/11).

Textos de apoio das linhas (paper-spec, telas 39 e 40): "Pedidos de entrada e membros da {ministério}"; "Cifras mais usadas nos repertórios da {ministério}"; "Importar várias cifras em PDF de uma vez"; "Pedidos, ministérios e estatísticas da app".

- [ ] **Passo 1: testes:** cada linha aparece ou não conforme o predicado (membro: só "Avisos" e "Sair"; admin do ministério: também "Pessoas do ministério", "Estatísticas do ministério" e "Importar" (com `canUpload`); admin da app sem ministério: só "Gestão" e "Sair"); contadores vêm de `countPending` e `countPendingAll` e somem com zero; "Avisos" some para quem não tem ministério; `PushProvider` é elegível com `access === 'granted' && ministry !== null`.
- [ ] **Passo 2 a 5:** falhar, implementar, verde. Implementação de `PushProvider`: `const eligible = access === 'granted' && ministry !== null;` (lendo `const { status, user, access, ministry } = useAuth();`). `AvisosCard`: `canEdit: ministry !== null` no `avisosPolicy`. Mensagem sugerida `feat(mais): menu por papel no ministério e na app`.

---

### Task 22: Pessoas do ministério (`people/*`) (código exato)

**Por quê:** a tela Pessoas antiga (lista global de usuários com `setUserRole`) sai. A nova lista é do ministério: pedidos pendentes e membros, com as ações do admin do ministério (ou do admin da app, quando abre pela Gestão).

**Arquivos:** reescrever `people/PeoplePage.tsx` (aceita `ministryId`, usado por `/pessoas` e por `/gestao/ministerios/:mid`) e `people/peopleApi.ts` (sai; a API é `ministriesApi`); testes em `people/PeoplePage.test.tsx`.

Props: `PeoplePage({ api, ministryId, ministryName, selfUid, appAdminView }: { api: MinistriesApi; ministryId: string; ministryName: string; selfUid?: string; appAdminView: boolean })`. Na visão do admin do ministério, `selfUid` é o uid da pessoa (linha "(você)" fixa); na visão da app, `selfUid` é `undefined` (sem "(você)").

Estados e textos (paper-spec, tela 41 e bloco de estados da tela 50):
- carregando: linhas em esqueleto (`aria-busy="true"`, texto oculto "Carregando…");
- erro de carregamento: caixa de erro "Não foi possível carregar. Tente de novo." + "Tentar de novo";
- pedidos vazios: "Nenhum pedido pendente" / "Quando alguém pedir para entrar, o pedido aparece aqui.";
- erro de ação (aprovar, recusar, alterar papel): caixa de erro com a mensagem do servidor quando ela existe (ex.: "Todo ministério precisa de pelo menos um admin."), senão "Não foi possível atualizar. O pedido continua pendente." (pedido) ou "Não foi possível atualizar. Tente de novo." (papel e remoção), com "Tentar de novo" que repete a ação;
- sucesso de aprovação: `.notice` "✓ {nome} agora é membro de {ministryName}".

Código:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { messageFor, type MinistriesApi, type PersonRow } from '../ministries/ministriesApi';
import type { MinistryRole } from '../auth/useAuth';

// `messageFor` vem de `ministries/ministriesApi.ts` (Tarefa 16): um único mapeamento de erro de callable. Não redefinir aqui.

type Action = { kind: 'approve' | 'reject' | 'role' | 'remove'; person: PersonRow; role?: MinistryRole };

export function PeoplePage({ api, ministryId, ministryName, selfUid, appAdminView }: Props) {
  const [data, setData] = useState<{ requests: PersonRow[]; members: PersonRow[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; retry: Action } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<PersonRow | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [requests, members] = await Promise.all([api.listRequests(ministryId), api.listMembers(ministryId)]);
      setData({ requests, members });
    } catch {
      setLoadError(true);
    }
  }, [api, ministryId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: Action) {
    setPendingUid(action.person.uid);
    setActionError(null);
    setNotice(null);
    try {
      if (action.kind === 'approve') {
        await api.callable.approve(ministryId, action.person.uid);
        setNotice(`✓ ${action.person.displayName ?? action.person.email ?? 'Pessoa'} agora é membro de ${ministryName}`);
      } else if (action.kind === 'reject') {
        await api.callable.reject(ministryId, action.person.uid);
      } else if (action.kind === 'role') {
        await api.callable.setRole(ministryId, action.person.uid, action.role ?? 'member');
      } else {
        await api.callable.removeMember(ministryId, action.person.uid);
      }
      await load();
    } catch (error) {
      const fallback = action.kind === 'approve' || action.kind === 'reject'
        ? 'Não foi possível atualizar. O pedido continua pendente.'
        : 'Não foi possível atualizar. Tente de novo.';
      setActionError({ message: messageFor(error, fallback), retry: action });
    } finally {
      setPendingUid(null);
    }
  }
  // Render: "Pedidos pendentes" (cartões com Recusar/Aprovar, sem confirmação), "Membros" (linhas com
  // role-select; o menu tem "Tornar admin"/"Tornar membro" e "Remover do ministério", que abre o diálogo).
  // Desabilitado: a própria pessoa (sem chevron, aria-disabled) e o último admin para quem não é admin da app.
}
```

Regras de desabilitar (paper-spec, tela 41): `isSelf = person.uid === selfUid`; `lastAdmin = person.role === 'admin' && members.filter((m) => m.role === 'admin').length === 1`; a ação de rebaixar ou remover fica desabilitada quando `isSelf || (lastAdmin && !appAdminView)`; a nota final (13px, centralizada) é "Todo ministério precisa de pelo menos um admin. Só o admin da app pode remover o último.".

Diálogo de remover (paper-spec, tela 50): título "Remover {nome} de {ministryName}?", texto "Ele deixa de ver os repertórios e de receber os avisos da {ministryName}. Para voltar, precisa pedir de novo.", "Cancelar" (foco inicial) e "Remover" (`.btn-danger`).

Textos do menu (3.8): "Tornar admin" (membro), "Tornar membro" (admin, **inferido**), "Remover do ministério" (vermelho).

- [ ] **Passo 1: testes:** seção "Pedidos" com nome, e-mail e "Pediu em dd/mm"; Aprovar e Recusar sem confirmação; seção "Membros" com `role-select` "Membro" ou "Admin" e `aria-label` "Papel de {nome}: {Membro|Admin}. Alterar"; a própria linha tem "(você)" e o seletor `aria-disabled="true"` (visão do admin do ministério); na visão da app, nenhuma linha tem "(você)"; o último admin tem o seletor desabilitado; Remover pede confirmação e só então chama `removeMember`; erro de `approve` com `failed-precondition` mostra a mensagem do servidor; erro genérico mostra "Não foi possível atualizar. O pedido continua pendente." e "Tentar de novo" chama `approve` de novo; vazio "Nenhum pedido pendente".
- [ ] **Passo 2 a 5:** falhar, implementar, verde. Mensagem sugerida `feat(people): pessoas do ministério (pedidos e membros)`.

---

### Task 23: Gestão (`gestao/*`)

**Depende da Tarefa 22:** `gestao/MinistryDetailPage.tsx` importa `people/PeoplePage`. A 23 começa depois da 22 verde; não roda em paralelo com ela.

**Arquivos:** criar `gestao/GestaoPage.tsx` (tela 42), `gestao/MinistriesPage.tsx` (tela 43 e folha 44), `gestao/MinistryDetailPage.tsx` (tela 45; reusa `PeoplePage` com `ministryId`), `gestao/AdminsPage.tsx` (tela 48), `gestao/validateMinistryForm.ts` e testes.

Regras e textos:
- **Gestão (42)**: "‹ Voltar", eyebrow "Admin da app", título "Gestão". Seção "Pedidos pendentes" com contador (total de todos os ministérios). **Lista completa**, rolando na tela (decisão de 23/11): sem nota "Mais N pedidos". Cada cartão de pedido (`.request-card`) mostra a linha de destino (`.dest-chip` "{Ministério} · {Cidade}") no lugar de "Pediu em". Cartão de menu com três linhas: "Ministérios" ("{N} ministérios · criar e editar nome e cidade"), "Estatísticas da app" ("PDFs, espaço e cifras mais usadas"), "Admins da app" ("Quem pode gerenciar tudo"). Vazio: "Nenhum pedido pendente".
- **Ministérios (43)**: "‹ Voltar", eyebrow "Gestão", título "Ministérios", botão "Novo ministério" (`.btn-primary`, 48px, largura total). Linhas: tile, nome, "{Cidade} · {N} membros" (plural: "0 membros", "1 membro"), `count-badge` "{N} pedidos" / "1 pedido" (`.status-pill`, sem pedidos: reserva de 22px). `aria-label` "{nome}, {cidade}, {N} membros, {N} pedidos". Vazio: "Nenhum ministério encontrado".
- **Novo ministério (44)**: folha (`.sheet`), título "Novo ministério", campos "Nome" e "Cidade", ajuda "O ministério nasce vazio. O líder pede para entrar, você aprova e toca em Tornar admin.", "Cancelar" e "Criar ministério". Validação: `validateMinistryForm` (abaixo); erro de campo é texto vermelho abaixo do campo.
- **Detalhe (45)**: "‹ Voltar", eyebrow "Gestão · Ministérios", título "{nome}", apoio "{cidade} · {N} membros", botão "Editar" (abre a folha com título "Editar ministério", campos preenchidos, "Salvar" no lugar de "Criar ministério", sem a frase de ajuda **(inferido)**). Abaixo, `PeoplePage` com `ministryId`, `appAdminView` e sem `selfUid`.
- **Admins da app (48)**: "‹ Voltar", eyebrow "Gestão", título "Admins da app", texto "Admin da app cria ministérios, vê as estatísticas gerais e corrige cifras de todos. Só aparecem quem já entrou.". Linhas de pessoa (apoio "Admin da app: não" / "Admin da app: sim" no lugar do e-mail; `role-select` "Não"/"Sim", o "Sim" em `--color-accent-text`). A própria linha: "Kaique Silva (você)", `aria-disabled`, sem ação. Menu com "Tornar admin da app" / "Remover admin da app" **(inferido)**. Nota: "Você não pode alterar o próprio papel.".
- Textos: "Gestão", "Ministérios", "Novo ministério", "Admins da app", "Nenhum ministério encontrado", "Você não pode alterar o próprio acesso" (`title` da linha desabilitada).

`gestao/validateMinistryForm.ts`:

```ts
export type MinistryFormErrors = { name?: string; city?: string };

/** Nome e cidade são obrigatórios, depois de trim(), com até 60 caracteres. Nome duplicado é checado pela lista carregada. */
export function validateMinistryForm(
  input: { name: string; city: string },
  existingNames: string[],
): MinistryFormErrors | null {
  const name = input.name.trim();
  const city = input.city.trim();
  const errors: MinistryFormErrors = {};
  if (name === '') errors.name = 'Informe o nome.';
  else if (name.length > 60) errors.name = 'Use até 60 caracteres.';
  else if (existingNames.some((n) => normalize(n) === normalize(name))) errors.name = 'Já existe um ministério com esse nome.';
  if (city === '') errors.city = 'Informe a cidade.';
  else if (city.length > 60) errors.city = 'Use até 60 caracteres.';
  return Object.keys(errors).length > 0 ? errors : null;
}
```

Import de `normalize` de `../ministries/normalize`. Textos "Informe o nome.", "Informe a cidade.", "Já existe um ministério com esse nome." e "Use até 60 caracteres." são **(inferidos)**.

- [ ] **Passo 1: testes:** cada tela com carregando, vazio e erro; a criação valida nome e cidade (`validateMinistryForm`: vazio, 61 caracteres, duplicado sem acento e sem maiúscula); a própria linha de "Admins da app" não tem ação; pedidos de todos aparecem com o ministério de destino; "Novo ministério" chama `createMinistry` com `{ name, city }` já com `trim()`.
- [ ] **Passo 2 a 5:** falhar, implementar, verde. Mensagem sugerida `feat(gestao): pedidos, ministérios e admins da app`.

---

### Task 24: Estatísticas (`stats/*`)

**Arquivos:** modificar `stats/StatsPage.tsx`, `stats/statsApi.ts` (usa `callCallable` da Tarefa 16; `formatBytes` e o `Stats` atual ficam, não se apagam, porque `statsApi.test.ts` importa), e os testes (`StatsPage.test.tsx`, `statsApi.test.ts`). Criar `apps/web/src/test/fakeStatsApi.ts` (`createFakeStatsApi(result)`, com `getStats: vi.fn(...)`).

Duas variantes no mesmo componente (`variant: 'app' | 'ministry'`). Regras de chamada e de ranking:
- Variante `app`: "Todos os ministérios" chama `getStats()` (sem id) e o ranking vem de `general.topAllTime` / `general.topLast30Days`; um ministério escolhido chama `getStats(ministryId)` e o ranking vem de `ministry.topAllTime` / `ministry.topLast30Days`. Os cartões vêm sempre de `general` (**inferido**: o filtro de ministério não troca os cartões; o `product-owner` confere).
- Variante `ministry`: chama `getStats(ministry.id)` e o ranking vem de `result.ministry`. Para o admin do ministério, `general` é `null` (C8): não há cartões.

Visão geral:
- `/gestao/estatisticas` (`app`): cartões "PDFs" (`flex: 2`, "{n}" e "{à mão} à mão · {gerados} gerados"), "Músicas" (`flex: 1.2`, "no acervo"), "Armazenamento" (largo, `formatBytes`, "só PDFs · média de {média} por arquivo"); ranking "Cifras mais usadas"; segmento "Todo o período" / "Últimos 30 dias"; filtro "Ministério" (pílula, valor "Todos os ministérios" ou o nome, menu com "Todos os ministérios" e cada ministério **(inferido)**), que chama `api.getStats(ministryId)`.
- `/estatisticas` (`ministry`): **sem** cartões, **sem** filtro. Só "‹ Voltar", eyebrow "{nome do ministério}", título "Estatísticas", "Cifras mais usadas", o segmento e a lista do ministério, mais a nota final.

Nota final (ambas): "Uma música conta quando entra em um repertório que já fechou, isto é, depois do dia seguinte ao culto. Contada uma vez por repertório."

`stats/statsApi.ts`:

```ts
import type { StatsCallerResult } from './types';

export interface StatsApi {
  getStats(ministryId?: string): Promise<StatsCallerResult>;
}
// Implementação: callCallable(() => httpsCallable<{ ministryId?: string }, StatsCallerResult>(functions, 'getStats')({ ministryId }))
// (o erro passa por `callCallable`, da Tarefa 16; sem tradução própria aqui)
```

Os tipos vêm de `stats/types.ts` (Tarefa 16): `StatsResult` e `TopSong` reexportados do `statsApi.ts` atual; `MinistryRanking` e `StatsCallerResult` novos (C8). O cliente não importa de `functions`.

Estados: carregando (esqueleto dos cartões e das linhas, `aria-busy`), vazio do ranking "Ainda não há cifras usadas nesse período." **(inferido)**, erro com caixa vermelha "Não foi possível carregar. Tente de novo." e "Tentar de novo" (**inferido** para o texto genérico).

- [ ] **Passo 1: testes:** cartões só na variante `app`; o filtro chama `getStats('hajaluz')` quando escolhido; "Todos os ministérios" chama `getStats()` e lê `general.topAllTime`; a variante `ministry` chama `getStats(ministry.id)` e lê `result.ministry`; com filtro de ministério os cartões continuam os gerais (**inferido**); a variante `ministry` não mostra cartões nem filtro; o ranking da variante `ministry` usa `result.ministry`; erro e vazio com os textos acima; "Últimos 30 dias" troca para `topLast30Days`.
- [ ] **Passo 2 a 5:** falhar, implementar, verde. Mensagem sugerida `feat(stats): estatísticas da app e do ministério`.

---

### Task 25: Cabeamento do cliente (`App.tsx`, `bootstrap.tsx`, `main.tsx`, `routes/routes.test.tsx`, `auth/roles.ts`)

**Arquivos:** modificar `App.tsx`, `bootstrap.tsx`, `main.tsx` (remove a importação de `./ui/redesign-access.css`; antes, `git grep -n "access-" apps/web/src` deve mostrar só `AccessPending.tsx`, já removido, e `redesign-access.*`), `routes/routes.test.tsx` (props das rotas e a tabela C7), `routes/RequireRole.tsx` e `routes/RequireRole.test.tsx` (`when="listSetlists"`), `setlists/nullSetlistApi.ts` e teste (novos), `ui/themeTokens.test.ts` (passa a ler `styles.css` e `ui/redesign-ministries.css`, sem `redesign-access.css`), os três `App*.test.tsx` (props, ver Passo 3); remover `ui/redesign-access.css` e `ui/redesign-access.test.ts`; remover `auth/roles.ts` quando `git grep -n "auth/roles" apps/web/src` não achar nada.

- [ ] **Passo 1: teste de rotas.** A tabela C7 vira o teste: cada rota com seu papel (membro, admin do ministério, admin da app, sem acesso); `/repertorios/x` sem ministério cai em `/`; `/gestao/*` só para `appAdmin`; `/nova` e `/importar` só com `canUpload`; `/pessoas` e `/estatisticas` só com `isMinistryAdmin`.
- Sem ministério, `/`, `/busca`, `/mais` e `/gestao` (admin da app) continuam renderizando: o provedor de repertórios do layout tem API nula e não some com a rota. `HomePage` e `PadPage` renderizados sem ministério não lançam por falta de `SetlistsProvider`.
- Trocar de ministério remonta só a subárvore de repertórios (`key`), não o restante da app.
- [ ] **Passo 2: rodar e ver falhar.**
- [ ] **Passo 3: implementação.** `App.tsx` recebe `services` (e não a API de repertórios) e cria a API do ministério atual; o provedor de repertórios fica no layout (API nula sem ministério); só a subárvore de repertórios remonta (`key`):

  ```tsx
  // Layout (acima de todas as rotas): o provedor de repertórios existe sempre e nunca devolve `null`,
  // senão `/`, `/busca`, `/mais` e `/gestao` sumiriam. Sem acesso liberado ou sem ministério carregado
  // (ou enquanto `onMinistry` não respondeu), a API é a nula: lista vazia, escrita recusada.
  function MinistryScope({ services, children }: { services: FirebaseServices; children: ReactNode }) {
    const auth = useAuth();
    // Só com `access === 'granted'` e ministério carregado existe API real (Revisão de foco 4).
    const ministryId = auth.access === 'granted' ? auth.ministry?.id : undefined;
    const api = useMemo<SetlistApi>(
      () => (ministryId ? createSetlistApi(services, { ministryId }) : createNullSetlistApi()),
      [services, ministryId],
    );
    return <SetlistsProvider api={api}>{children}</SetlistsProvider>;
  }

  // Subárvore de /repertorios/:id: só ela remonta quando o ministério muda (estado local não vaza entre ministérios).
  function RepertoryScope() {
    const { ministry } = useAuth();
    if (!ministry) return <Navigate to="/" replace />;
    return (
      <div key={ministry.id}>
        <Outlet />
      </div>
    );
  }
  ```

  Rotas de repertório: `/repertorios/:id` fica sob `RequireRole when="listSetlists"` (sem ministério, `Navigate` para `/`) e depois `RepertoryScope`. `RequireAccess` recebe `api={ministriesApi}`.

**`setlists/nullSetlistApi.ts` (novo, com teste):** `createNullSetlistApi(): SetlistApi` implementa a interface inteira. Cada leitura (`subscribe*`) entrega lista vazia (ou `null` para um repertório) e devolve `() => {}`; cada escrita rejeita com `new Error('Sem ministério: nada a gravar.')`. O TypeScript garante que nenhum membro falta. O teste percorre as chaves do objeto: leitura não lança; escrita rejeita. O provedor nulo não toca no Firestore, então não quebra a Revisão de foco 4.

Se o `SetlistsProvider` mantiver dado do ministério anterior ao trocar `api`, o `key` sobe para o provedor (decisão do PR, com teste de troca de ministério). Até lá, a Tarefa mantém o `key` só na subárvore, como acima.

`RequireRole` troca `roles=` por `when=` e ganha `listSetlists` (`canListSetlists`); use `switch` com os quatro casos, sem ternário aninhado:

  ```tsx
  <Route element={<RequireRole when="upload" />}>{/* /nova, /importar */}</Route>
  <Route element={<RequireRole when="ministryAdmin" />}>{/* /pessoas, /estatisticas */}</Route>
  <Route element={<RequireRole when="appAdmin" />}>{/* /gestao/* */}</Route>
  <Route element={<RequireRole when="listSetlists" />}>{/* /repertorios/:id, dentro de MinistryScope */}<Route path="/repertorios/:id" element={<RepertoryScope />} /></Route>
  ```

  `bootstrap.tsx` deixa de criar `setlistApi` global e cria `ministriesApi = createMinistriesApi(services)`; `peopleApi`/`statsApi` das rotas antigas saem.

**Props de `App` e migração dos três `App*.test.tsx`:** saem `peopleApi`, `setlistApi` e `statsApi`; entram `services` (para o `MinistryScope`) e `ministriesApi` (default `createMinistriesApi(services)` no `bootstrap.tsx`). Nos testes: `ministriesApi={createFakeMinistriesApi()}` (Tarefa 16) no lugar de `peopleApi` e `statsApi`; o repertório não deve usar Firestore no teste, então `vi.mock('../setlists/setlistApi', () => ({ createSetlistApi: () => <o fake de repertórios que o teste já usava> }))` (caminho relativo ao arquivo de teste) substitui a prop `setlistApi`; `services` recebe `{} as FirebaseServices`, porque com o `vi.mock` nada real o usa. O login de cada teste continua o `signInAs` da Tarefa 15.

- [ ] **Passo 3b: limpeza.** `ui/themeTokens.test.ts` deixa de ler `redesign-access.css` (lê `styles.css` e `redesign-ministries.css`; o teste de paridade dos dois temas fica igual). Antes de remover os arquivos antigos, conferir o resíduo só em `apps/web/src/main.tsx`, `apps/web/src/ui` e `apps/web/src/auth` (`git grep -n "redesign-access\|auth/roles\|peopleApi\|statsApi" -- apps/web/src/main.tsx apps/web/src/ui apps/web/src/auth`).
- [ ] **Passo 4: rodar e ver passar:** `npm run test -w @cifras/web -- src/routes src/auth`; depois `npm run typecheck` (fecha aqui, pela primeira vez desde a Tarefa 15) e `npm run lint`.
- [ ] **Passo 5: entrega.** Mensagem sugerida `feat(web): rotas e escopo de ministério`.

---

---

## Parte E e X: E2E e documentação

### Task 26: E2E atualizado (`e2e/**`)

**Por quê:** AGENTS, "Definição de pronto": texto de UI mudou, então os specs E2E são atualizados no mesmo PR.

- [ ] **Passo 1: achar os textos e os seeds antigos.** Run: `git grep -n "Acesso ainda não liberado\|Quem entra pela primeira vez\|Pessoas e papéis\|role\|setlists\|AccessPending" -- apps e2e`. Listar cada ocorrência no PR.
- [ ] **Passo 2a: `e2e/fixtures/app.ts` primeiro** (reescrito antes dos specs, porque todos o usam):
  - `expectRole(page, label)` confere o selo de papel do perfil: `'Haja Luz · Admin'`, `'Haja Luz · Membro'` ou `'Admin da app'` (textos da Tarefa 21);
  - `signInAs(page, papel)`: `'member' | 'admin' | 'appAdmin' | 'none'`, com as contas de teste do seed (ADMIN e MEMBER; `none` é uma conta sem vínculo);
  - `promoteToMember(page, admin, email)`: a conta de teste pede entrada pela escolha de ministério; o admin abre Mais › "Pessoas do ministério" e toca em Aprovar (sem confirmação); a espera termina com o contador de pedidos zerado.
- [ ] **Passo 2 (specs):** escrever os specs novos depois do fixture (falham até o cliente mudar):
  - `auth.spec.ts`: login sem vínculo cai em "Escolha seu ministério"; a nota do login é a nova;
  - `visitor.spec.ts`: "Pedido enviado" e "Cancelar pedido" no lugar de "Acesso ainda não liberado";
  - `setlists.spec.ts`: repertório criado no ministério aparece; repertório de outro ministério não;
  - `avisos*.spec.ts`: aviso de repertório novo só para quem é do ministério;
  - `people.spec.ts`: "Pessoas do ministério" com pedidos e membros; `manage.spec.ts`: "Gestão" só para admin da app;
  - `fixtures/emulator.ts` (linhas ~236-254): seeds passam a `ministries/hajaluz` (nome "Haja Luz", cidade "São Paulo"), `ministries/hajaluz/members/{uid}` (ADMIN com `role: 'admin'`, MEMBER com `role: 'member'`), `users/{ADMIN}.appAdmin: true` e claims novos (`hasMinistry`, `canUploadSong`, `appAdmin`). O ADMIN é admin da app **e** admin da Haja Luz (tela L13). A limpeza apaga `ministries/hajaluz/setlists` e os membros semeados.
  - `setlists.spec.ts` (linha ~31): semeia e limpa `ministries/hajaluz/setlists`, não a raiz `setlists`.
  - `avisos.spec.ts` (linha ~48): reescrito para o caminho `ministries/{mid}/setlists`; o aviso de repertório novo só vai para membro do ministério.
- [ ] **Passo 3: implementação** só nos fixtures, seeds e textos; nenhum teste E2E roda local (CI).
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
- `npm run test -w @cifras/web -- src/auth src/ministries src/setlists src/viewer src/search src/more src/people src/stats src/routes src/push src/ui`.
- `npm run typecheck` e `npm run lint` (CI e orquestrador). Os dois fecham de verdade ao fim da Tarefa 25 (cliente) e da 13 (Functions).
- `npm run build -w @cifras/functions` quando houver memória; senão fica para o CI.
- `npm run test:harness` (design tokens, Tarefa 14).
- E2E: só no CI.
- **Paper (designer, Sonnet):** atualizar os artboards 34 a 50 e L11 a L13 com o que foi desenvolvido (escuro; claro nas telas raiz). Se o MCP estiver indisponível: "Paper pendente: <o que>" no PR.
- Revisão: `code-reviewer` em cada grupo de commits (Rules, Functions, cliente, E2E, docs) e revisão final (Sonnet, high). Etiqueta `revisado` só sem pendência crítica nem importante; `qa-ok` quando o QA estiver verde; `teste-celular-ok` só com o "ok" da pessoa, registrado na Análise com a data.

---

## Decisões

Fechadas em 23/11 pelo orquestrador (substituem a antiga seção "Pontos em aberto").

**Decisões do orquestrador:**

1. **Substituir tom gerado por PDF feito à mão (`replaceArrangement`)**: só quem pode subir cifra (`canUploadSong`: admin de ministério ou da app), guarda `requireUploader`. Não é `requireCatalogContributor`. "Mudar tom" para todo membro já funciona: quando o tom existe, o app só abre (sistema.md). Esta é a decisão B da pessoa (upload).
2. **Tom gerado**: permitido com `hasMinistry` **ou** `appAdmin` (spec §3 dá o ✓ ao admin da app), nas Rules do Firestore (Tarefa 4) e do Storage (Tarefa 5). Admin da app sem vínculo gera tom.
3. **Texto de "removido do ministério"**: o do Paper, tela 50: "Você não faz mais parte de {nome}." e "Escolha um ministério para continuar.". O aviso atravessa o reload por `sessionStorage` (`auth/removedNotice.ts`, Tarefa 15/17).
4. **"Pessoas · Em breve" sai de Mais**: as telas 38 a 40 validadas não a têm.
5. **Gestão (tela 42)**: lista completa de pedidos pendentes, rolando na tela. Sem a nota "Mais N pedidos".
6. **Pré-entrega P (Tarefas 1 e 2)**: PR e release próprios, antes do pacote. O PR de P usa `Parte de #136` no corpo. Não há sub-issue para P.

**Correções do pré-voo do backend (aceitas):**

7. **Tarefa 3**: `tests/rules/firestore.rules.test.ts` entra (casos de `users` com `appAdmin`); `setlists.rules.test.ts` é repontado para `ministries/hajaluz/setlists/*`, com os membros semeados em `members` (a validação não perde cobertura); a raiz passa a leitura só para membro da Haja Luz pelo documento, e escrita negada.
8. **Tarefa 4**: slugs `C`/`D` (sensível a caixa: `validArrangement` exige `slug == key.replace('#','s')`); `memberDb()` declara `{ role: 'member', hasMinistry: true, canUploadSong: true }`; usa `songData`, `arrData` e `seedArrangement` reais.
9. **Tarefa 5**: `pdfFor(uid)` e `one` reais do `storage.rules.test.ts`; `'hasMinistry' in request.auth.token` validado no emulador (fallback `keys().hasAny`).
10. **Tarefa 6**: a matriz de §4.4 já existia em `ministerios.rules.test.ts` (`CTX`, `LEITURAS`, escrita, edição); a tarefa acrescenta só as lacunas. Uso de `updateDoc`: `updatedBy` e `updatedAt: serverTimestamp()`.
11. **Tarefa 8**: `createFakeMinistryDeps` devolve `log`; o teste desestrutura `{ deps, log }`; `runTransaction` do `adminDeps` ganha as duas leituras de grupo; o guard do fake cobre as leituras novas. Pedido `pending` do mesmo ministério devolve sem gravar.
12. **Tarefa 9**: migração **completa** do `roles` em `push/` (sem alias). `getUserRole`, `getUserRoles` e `RoleDeps` saem; entram `getUserMinistries` (bulk, `in` de 30) e `listMembershipsOfUser` (guards). `adminDeps.test.ts` ganha o caso de `ministriesOfUids` (301 uids, 11 consultas).
13. **Tarefa 10 (crítica)**: `ministryId` é obrigatório no aviso de repertório (tipo `RepertorioSend`, com `@ts-expect-error` de teste) e `sendToDevices` recusa entrada sem `ministryId` nem aparelho. O gatilho **não** troca o filtro no lugar: vira `onMinistrySetlistWritten` e a antiga `onSetlistWritten` sai do export (o deploy `--force` apaga). O mock de `reminderDeps.test.ts` ganha `collectionGroup` e `ref.parent.parent`. Teste com fake real (`push/fakeDeps.ts`).
14. **Tarefa 11**: formato de retorno `StatsCallerResult = { general, ministry }` (C8), compatível com `StatsResult` (o geral não muda); `ministryIdOf(ref)` é função pura em `ministries/model.ts`, testada, e exclui a raiz; `rankingOf` e os fakes estão em código.
15. **Tarefa 12**: a remoção do export de `mirrorTrigger` em `index.ts` acontece na própria Tarefa 12.
16. **Tarefa 13**: depende das Tarefas 7, 9 e 11. `changeUserRole` sai junto com `setUserRole` (sem uso, e o `noUnusedLocals` do typecheck não deixaria ficar).

**Pontos que estavam em aberto e ficam resolvidos:**

17. **Chaves de `setAppAdmin`**: confirmadas em `apps/functions/src/ministries/admin.ts`: `{ uid, appAdmin }`.
18. **Corrida na limpeza de cache**: `forgetLocalData` nunca lança (cada passo tem `try/catch`) e o `reload()` vem por último. Sem reload que funcione, a pessoa fica na tela de carregamento: aceito; o caminho feliz é coberto pela Tarefa 15 e a falha vai no PR.
19. **Callables antigas que saem** (`setUserRole`): a tela Pessoas antiga some. Clientes em cache que ainda a chamam recebem erro até recarregar (spec §7). Aceito; registrar no corpo do release.
20. **Valores visuais**: o paper-spec fecha os valores (§2 e §3). A Parte D não tem mais bloqueio; o `designer` só valida a estrutura no Paper antes do PR.
21. **Forma `in` sobre o token nas Rules**: `'hasMinistry' in request.auth.token` (Tarefas 4 e 5). Se o emulador recusar, `keys().hasAny([...])`; registrar no PR.
22. **Ministério atual**: a interface aceita um vínculo; `ministry` é o primeiro da lista. Quem tem mais de um (não deveria ocorrer pelo fluxo de pedido) vê o primeiro.

**Textos de UI que o `product-owner` confere (marcados "inferido" no paper-spec ou neste plano):** "Olá, {nome}" sem nome; "Tornar membro"; "Tornar admin da app" e "Remover admin da app"; "Pedir para entrar" com erro "Não foi possível enviar o pedido. Tente de novo."; "Informe o nome.", "Informe a cidade.", "Use até 60 caracteres.", "Já existe um ministério com esse nome."; "Editar ministério" (folha sem frase de ajuda); "Ainda não há cifras usadas nesse período."; "Não foi possível carregar. Tente de novo."; "Não foi possível atualizar. Tente de novo."; a nota de login da Tarefa 17.

---

## Passos manuais da pessoa (ordem)

1. **Pré-entrega P** (Tarefas 1 e 2): release com merge commit, fora da janela (quinta e domingo, 16h30 às 23h59, bloqueados). Combinar com a pessoa.
2. **Firestore > Índices:** `members.uid`, `requests.uid` e `requests.status` (COLLECTION_GROUP, já da #135) e os novos `setlists.date` e `setlists.rehearsalAt` (COLLECTION_GROUP) em "Ativado". Esperar os minutos de criação.
3. **Migração da #135 já rodada e conferida** (`docs/deploy.md`): o teste no celular usa os dados reais da Haja Luz.
4. **Contas de teste:** uma conta Google sem ministério (entrada) e uma conta de membro da Haja Luz. A pessoa fornece ou cria.
5. **Teste no celular:** o orquestrador dispara `gh workflow run site-teste.yml --ref main -f branch=feat/136-ministerios-pacote -f issue=136` (ou a pessoa, por `docs/deploy.md`, se o workflow não estiver na `main`). Com a etiqueta `no-site-teste`, na vez da fila. Roteiro abaixo.
6. **Release do pacote** (merge commit do orquestrador, fora da janela): depois do "ok" de `teste-celular-ok`. Corpo do PR com passos, risco, volta e itens 7 e 8 abaixo.
7. **Pós-release:** confirmar no console de Functions que `mirrorSetlists` e `onSetlistWritten` foram apagadas (o deploy usa `--force`) e que `onMinistrySetlistWritten` existe e observa `ministries/{ministryId}/setlists/{setlistId}`.
8. **Smoke em produção:** abrir `https://louvor-hajaluz.web.app` como membro e como admin da Haja Luz (repertórios, Mais, Pessoas do ministério) e com a conta sem ministério (vê só a entrada). O orquestrador confirma à mão.

---

## Riscos

1. **Teste no celular usa dados reais.** O site de teste grava na mesma base de produção. Pedir à pessoa para criar e apagar um repertório "TESTE" durante o teste.
2. **Pacote não testável no site de teste.** Rules e Functions do pacote só valem no release (spec §7). O teste cobre a interface com as Rules de produção; `test:rules` e o CI cobrem o resto. Por isso a pré-entrega P é obrigatória antes.
3. **Índice de grupo não ativo.** Pedido, vínculo e lembrete falham com `failed-precondition` até o índice ficar "Ativado". Passo 2 antes do teste.
4. **Espelho durante o teste.** Enquanto o pacote não sai, uma edição da raiz pelo cliente antigo é copiada para `ministries/hajaluz/setlists` e pode sobrescrever a edição feita no site de teste. Aceito; não editar repertório real durante o teste.
5. **Token até 1 h.** A remoção vale no refresh: o provedor força `refreshToken()` quando o claim diverge do vínculo, com esperas de 1 a 16 s (Tarefa 15). Entre a remoção e o refresh, Rules por documento (repertório) já negam. Catálogo e Storage dependem do claim, então valem após o refresh.
6. **Limites conhecidos (para `docs/sistema.md`).** O que o aparelho já baixou antes da remoção fica no cache (até o recarregamento, que o `forgetLocalData` já faz). Cifra subida por admin da app sem ministério fica sem `createdInMinistry`. Um arquivo PDF pode ficar órfão no Storage se o cliente falhar entre o upload e a gravação do tom (o `discardUpload` cobre o caso comum).
7. **Pedidos em massa.** A migração criou pedidos pendentes para os visitantes de hoje (decisão do spec); a Haja Luz vai ver esses pedidos em Pessoas do ministério.
8. **Volta.** Reverter o release (merge da `develop` na `main`, nunca hotfix) e a regra de volta do spec §7. O código antigo volta a instalar `onSetlistWritten` e o espelho; a raiz volta a ser a fonte para o app antigo, com os dados parados desde o release. Repertórios editados em `ministries/` depois do pacote não chegam à raiz. Os dados em `ministries/` não atrapalham o app antigo.
9. **Tamanho do PR único.** Mais de 100 arquivos. Revisão por grupo de commits (Rules, Functions, cliente, E2E, docs).
10. **Reanúncio pelo gatilho novo.** Entre o release de P e o pacote, o espelho ainda copia a raiz para `ministries/hajaluz/setlists`, e o gatilho novo ouve esse caminho. As marcas `avisosEnviados/{id}_novo` já existentes impedem o segundo aviso; o gatilho também respeita `NEW_SETLIST_ANNOUNCE_SINCE`. Conferir em produção que nenhum repertório antigo foi reavisado.
11. **Aparelho apagado só sem vínculo nenhum.** A Function apaga o aparelho só quando o uid não tem ministério nenhum (Tarefa 9). Quem trocou de ministério mantém o aparelho e recebe avisos só do ministério atual.

---

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

- Pré-entrega P: Tarefas 1 e 2 (PR próprio, `Parte de #136`) → release com merge commit → índices "Ativado".
- Pacote, em paralelo: lane R (3 → 6), lane F (7 → 13). Lane D (14) antes da W.
- Lane W: 15 → 16 → 17 → 18; depois 19, 20, 21, 22 e 24 em paralelo; 23 só depois de 22 (reusa `PeoplePage`); depois 25 (fecha `typecheck` e `lint` do cliente; depende de 20, 22 e 23).
- E2E (26) depois de W; docs (27) depois de F e W; verificação final e Paper (seção própria, depois de 27).
- Teste no celular antes do merge; merge do pacote com merge commit, fora da janela.
- Dependências que não podem ser invertidas: 7 antes de 9 e 13; 9 antes de 13; 11 antes de 13; 10 antes de 11 (cria `ministryIdOf`); 3 antes de 4 e 5 (`users` e a raiz); 15 antes de 16 e de todas as telas de W (contrato C4); 16 antes de 17 (`ministriesApi`, `callable.ts`) e de 22 a 24 (`stats/types.ts`, `fakeMinistriesApi`); 22 antes de 23 (`PeoplePage`); 20 antes de 25 (`RequireRole`).
