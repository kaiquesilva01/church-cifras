# Card "Ative os avisos" (#125) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Mostrar, na aba Músicas e só no app instalado, um cartão que ativa os avisos com um toque em "Ativar" (mesmo fluxo da aba Mais), manda um aviso de teste no sucesso, some em qualquer desfecho e dispensa por 30 dias no "×". Só membro e admin.

**Architecture:** O cartão reaproveita o visual e a política de dispensa do #109 (`ConviteCard`, extraído do `InstallCard`, com CSS `.convite`). A lógica de elegibilidade (`decideAvisosCard`) é pura e roda antes de qualquer checagem de status; só quando elegível o componente monta `usePushAvisos` (o mesmo hook da aba Mais). A dispensa usa chave própria (`cifras.avisosCard.v1`) sobre um registro genérico (`lib/dismissRecord.ts`). A sessão do convite é um singleton em memória (`push/avisosSession.ts`), igual ao padrão de `installPromptStore`. A exclusão mútua com o card de instalar vem da própria política: um exige app instalado, o outro exige o contrário.

**Tech Stack:** React 18 (`useId`, `useSyncExternalStore`) + TypeScript `strict` em `apps/web`; Vitest com jsdom; `@testing-library/react`; Playwright (projetos `mobile` e `desktop`) contra o build com emuladores.

**Spec:** Sem spec próprio. Os critérios de aceite são os 9 itens da Análise Agêntica da issue #125 (`gh issue view 125`). Desenho: Paper, artboard `32 · Músicas · convite para ativar avisos` (escuro) e `L10 · Músicas · convite para ativar avisos (claro)`. Base: #109 (`docs/superpowers/plans/2026-11-21-109-card-instalar-app.md`) e #99/#126 já na develop.

## Global Constraints

- Só tokens de cor de `apps/web/src/ui/styles.css` (`--color-surface`, `--color-border-strong`, `--color-text`, `--color-muted`, `--color-accent`, `--color-accent-text`, `--color-accent-soft`, `--color-on-accent`) e a sombra `var(--shadow-pop)`. Nenhum `#hex` nem `rgb(...)` novo, e nenhum `#` seguido de dígitos em comentários CSS (o teste de cores confunde com hex).
- Texto de UI em pt-BR; identificadores em inglês; `import type` e `type` explícitos nas importações de tipo.
- Alvos de toque ≥ 44 px: pílula "Ativar"/"Adicionar" com alvo de 44 px e visual de 36 px; "×" com alvo de 44 px e disco visual de 28 px. `aria-label="Agora não"` no "×".
- Acesso ao `localStorage` e às gravações sempre em `try/catch`. Sem storage, o cartão aparece e funciona na sessão.
- Teste antes do código em toda tarefa. Rodar testes com `cd apps/web && npx vitest run <arquivo>`.
- Não tocar: `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`, `firestore.rules`, `storage.rules`, `apps/functions/`, `packages/`, `apps/web/src/viewer/`, `apps/web/src/setlists/`, `apps/web/src/pad/`.
- Sem Rules, Functions, índices ou variáveis novas. Sem teste no celular obrigatório: a entrega não altera viewer, setlists nem pad (o roteiro de celular do sino vai na mensagem final).
- Formatar só os arquivos tocados: `npx prettier --write <arquivos>`. Antes de cada commit, `npm run format:check` (o CI barra formatação).
- Commits em Conventional Commits, em inglês, uma vez por tarefa.

## Review Focus

1. Storage bloqueado ou lançando (modo privado): `localStorage.getItem` ou `setItem` lança. O cartão precisa aparecer, funcionar e, no "×", sumir pela sessão. Teste na Tarefa 1 (registro), Tarefa 9 (componente com `setItem` espiado).
2. Duplo toque em "Ativar" ou toque durante "Ativando…": não pode pedir a permissão duas vezes. Teste na Tarefa 9 (segundo clique não chama `enable`).
3. Desfecho ruim (permissão negada no diálogo, erro): o cartão some e não volta ao voltar para a Músicas nesta sessão, sem mensagem nova. Teste na Tarefa 9 (remontagem com a sessão fechada) e na Tarefa 11 (E2E negado, com recarga).
4. Registro dispensado com data futura (relógio voltou): não pode esconder para sempre. Teste na Tarefa 1 (`isDismissedAt` ignora data futura) e na Tarefa 6.
5. Permissão revogada com aparelho gravado ao abrir a Músicas: `load()` remove o registro (comportamento já existente da aba Mais). O cartão precisa tratar o resultado (`available` ou `blocked`) sem erro. Teste na Tarefa 9 (carga com `available`) e na Tarefa 11 (negado).

## Decisões do tech-lead

1. **Estado dos avisos (D1).** O cartão reaproveita `usePushAvisos(service)`, o mesmo hook da aba Mais, sem listeners novos e sem contexto novo. A elegibilidade (membro ou admin, app instalado, não dispensado, sessão aberta) é decidida antes de montar o hook, então visitante, navegador e quem dispensou nunca chamam `load()`. A oferta aparece só com status `available` (ou `enabling`); `checking` não renderiza nada, então não pisca. Custo aceito: quem é elegível carrega o chunk do SDK de mensagens (fora do precache) e `load()` roda ao abrir a Músicas. A aba Mais já faz o mesmo. Não elevei o estado ao `PushProvider`: isso mudaria a semântica da linha da aba Mais.
2. **Toque em "Ativar" (D2).** O `onClick` chama `view.enable()` sem nada antes (o hook já garante isso). Um ref `asked` marca o toque; o guarda `status !== 'available'` impede segundo pedido; o botão fica `disabled` com "Ativando…" durante `enabling`.
3. **Desfecho (D3).** Um efeito observa o status. Quando o toque termina (qualquer status diferente de `enabling`), fecha a sessão do convite. Se o status for `active`, chama `sendTest()` uma vez. O componente de oferta continua montado (o pai não depende do status), então o efeito roda. Sem mensagem nova: `blocked`, `error` e demais só escondem o cartão.
4. **Dispensa (D4).** Chave própria `AVISOS_RECORD_KEY = 'cifras.avisosCard.v1'`, JSON `{ "dismissedAt": <ms> }`. O registro genérico `lib/dismissRecord.ts` recebe a chave; `installPolicy.ts` mantém os wrappers com `INSTALL_RECORD_KEY`, então as duas dispensas não se misturam. O "×" grava, fecha a sessão e esconde por estado local, então funciona sem storage.
5. **Sessão (D5).** `avisosSession` é um singleton em memória (reabre só com recarga do app). É fechada por: desfecho do toque em "Ativar", "×" e "Desativar" na aba Mais (no `usePushAvisos.disable`). Motivo do último: quem desativou disse "não agora" nesta sessão. Ponto a confirmar pela pessoa (ver dúvidas).
6. **Exclusão mútua com o card de instalar (D6).** Por construção: `decideAvisosCard` exige `standalone`, e `decideInstallCard` some com `standalone`. Não há coordenação em runtime. Um teste percorre as combinações e prova que nunca aparecem juntos. Os dois usam a mesma posição (`.convite`, fixo no topo, `top: calc(12px + env(safe-area-inset-top))`, `z-index: 20`), acima da busca fixa (10) e abaixo do aviso de atualização (100).
7. **Componente compartilhado (D7).** `ConviteCard` tem a estrutura do #109 (região com título, ícone, apoio, "×", ação opcional). `InstallCard` vira um uso dele. Classes `install-card*` viram `convite*`. Os testes de instalação já consultam por papel e nome acessível (E2E e unitários), então a troca de classe não os quebra; só o `themeTokens.test.ts` lê as classes, e a Tarefa 4 atualiza.
8. **Visual (D8).** Tile do sino 48 px, `--color-accent-soft`, traço `--color-accent-text`, raio 13 px. Pílula "Ativar" igual à "Adicionar" do #109. Estado "Ativando…": pílula desabilitada com opacidade 0.6 (não há token novo; o `designer` confirma no Paper).
9. **Gate de papel (D9).** `canEdit(role)` via `useAuth`, o mesmo critério de `MaisPage` e do FAB da Home. Visitante nem chega à Home (#126; o `visitor.spec.ts` já cobre).
10. **Montagem (D10).** `HomePage` monta `AvisosCard` só quando `tab.id === 'musicas'`, ao lado do `InstallCard`, com a mesma condição.

## Dúvidas e lacunas (para o orquestrador e a pessoa)

1. **Sessão ao desativar (D5).** Recomendo fechar a sessão do convite quando a pessoa desativa na aba Mais. A alternativa é o convite voltar na próxima ida à Músicas da mesma sessão. Confirmar.
2. **Sobreposição no topo.** O cartão cobre o botão sol/lua e o título "Músicas" em 390 px. É o mesmo ponto em aberto do #109 (dúvida 1 de lá). Este plano mantém o comportamento (A), para ficar igual ao card de instalar. Decisão de desenho, com o `designer`.
3. **Paper.** Conferir que os artboards `32` e `L10` existem com o texto final e que o estado "Ativando…" (pílula com opacidade) está desenhado ou especificado. Se o MCP estiver indisponível, o PR leva "Paper pendente: 32, L10 e estado Ativando".
4. **Custo do SDK na Músicas.** Para quem é elegível, `load()` pode carregar o chunk de mensagens ao abrir a Músicas. Aceito pelo tech-lead (ver D1); se o desempenho da Músicas for sensível, a alternativa é só checar depois da primeira ida à aba Mais.
5. **Responsável pelo E2E.** Conforme o pedido, o E2E é do `qa` (Tarefa 11, etapa 5). O código dele está neste plano para o `qa` executar sem redesenho.
6. **Limite de linhas do `sistema.md`.** Está em 300 linhas. A Tarefa 5 atualiza só frases dentro de linhas existentes (saldo zero). Se o `code-reviewer` pedir linhas novas, fundir os dois bullets "Lembretes do ensaio" (linhas 281 e 282).
7. **`format:check` e Markdown.** Confirmar se o `.prettierignore` cobre `*.md`; o comando roda do mesmo jeito.

## Interfaces (contratos entre as tarefas)

```ts
// apps/web/src/lib/dismissRecord.ts
export const DISMISS_MS: number;                       // 30 dias em ms
export interface DismissRecord { dismissedAt: number | null }
export function isDismissedAt(dismissedAt: number | null, now: number): boolean;
export function readDismissRecord(storage: Pick<Storage, 'getItem'> | undefined, key: string): DismissRecord;
export function writeDismissRecord(storage: Pick<Storage, 'setItem'> | undefined, key: string, record: DismissRecord): void;

// apps/web/src/push/bell.ts
export const BELL_PATH: string;

// apps/web/src/push/avisosSession.ts
export interface AvisosSession { isClosed(): boolean; close(): void; reset(): void /* só testes */ }
export function createAvisosSession(): AvisosSession;
export const avisosSession: AvisosSession;

// apps/web/src/push/avisosCard.ts
export const AVISOS_RECORD_KEY: 'cifras.avisosCard.v1';
export type AvisosCardMode = 'hidden' | 'check';
export interface AvisosCardInput { canEdit: boolean; standalone: boolean; dismissedAt: number | null; now: number; sessionClosed: boolean }
export function decideAvisosCard(input: AvisosCardInput): AvisosCardMode;
export function isOfferStatus(status: AvisosStatus): boolean;

// apps/web/src/ui/ConviteCard.tsx
export interface ConviteAction { label: string; disabled?: boolean; onClick: () => void }
export interface ConviteCardProps { icon: ReactNode; title: string; hint: string; onClose: () => void; action?: ConviteAction; busy?: boolean }
export function ConviteCard(props: ConviteCardProps): JSX.Element;

// apps/web/src/pwa/installPolicy.ts (mantém a API pública)
export const INSTALL_RECORD_KEY: 'cifras.installCard.v1';
export { DISMISS_MS } from '../lib/dismissRecord';
export type InstallRecord = DismissRecord;
export function readInstallRecord(storage: Pick<Storage, 'getItem'> | undefined): InstallRecord;
export function writeInstallRecord(storage: Pick<Storage, 'setItem'> | undefined, record: InstallRecord): void;

// apps/web/src/push/usePushAvisos.ts (sem mudança de assinatura; disable fecha a sessão)

// apps/web/src/push/AvisosCard.tsx
export interface AvisosCardProps { session?: AvisosSession }   // default: avisosSession
export function AvisosCard(props: AvisosCardProps): JSX.Element | null;

// apps/web/src/test/fakePushService.ts
export function fakePushService(overrides?: Partial<PushService>): PushService;
```

## Grupos de execução

- **Grupo A (paralelo; arquivos disjuntos):** Tarefa 1 (`lib/dismissRecord*`, `pwa/installPolicy.ts`), Tarefa 2 (`push/bell.ts`, `push/AvisosRow.tsx`), Tarefa 3 (`push/avisosSession*`), Tarefa 4 (`ui/ConviteCard*`, `ui/redesign-install.css`, `ui/themeTokens.test.ts`), Tarefa 5 (`docs/design-system.md`, `docs/sistema.md`).
- **Grupo B (depois de A):** Tarefa 6 (`push/avisosCard*`, depende de 1 e 3), Tarefa 7 (`pwa/InstallCard*`, depende de 4), Tarefa 8 (`push/usePushAvisos*`, depende de 3).
- **Grupo C (depois de B):** Tarefa 9 (`push/AvisosCard*`, `test/fakePushService.ts`; depende de 2, 4, 6, 8).
- **Grupo D (depois de C):** Tarefa 10 (`search/HomePage*`, depende de 9).
- **Grupo E (etapa 5, `qa`):** Tarefa 11 (`e2e/avisos-card.spec.ts`).
- **Tarefa 12** (verificação, orquestrador) roda depois de tudo.

Nenhum arquivo aparece em dois grupos paralelos. Nenhuma tarefa de um grupo toca arquivo de outro grupo do mesmo nível.

---

### Task 1: Registro genérico de dispensa (`lib/dismissRecord.ts`)

**Files:**
- Create: `apps/web/src/lib/dismissRecord.ts`
- Create: `apps/web/src/lib/dismissRecord.test.ts`
- Modify: `apps/web/src/pwa/installPolicy.ts` (passa a usar o registro genérico; API pública intacta)

**Interfaces:**
- Consumes: nada.
- Produces: `DISMISS_MS`, `DismissRecord`, `isDismissedAt`, `readDismissRecord`, `writeDismissRecord` (ver Interfaces).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/lib/dismissRecord.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DISMISS_MS,
  isDismissedAt,
  readDismissRecord,
  writeDismissRecord,
} from './dismissRecord';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23, 12);
const KEY_A = 'cifras.teste.a.v1';
const KEY_B = 'cifras.teste.b.v1';

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe('isDismissedAt', () => {
  it('vale 30 dias a partir da dispensa', () => {
    expect(DISMISS_MS).toBe(30 * DAY);
    expect(isDismissedAt(NOW - 29 * DAY, NOW)).toBe(true);
    expect(isDismissedAt(NOW - 30 * DAY, NOW)).toBe(false);
  });

  it('é falso sem dispensa e ignora data futura (relógio voltou)', () => {
    expect(isDismissedAt(null, NOW)).toBe(false);
    expect(isDismissedAt(NOW + DAY, NOW)).toBe(false);
  });
});

describe('registro de dispensa por chave', () => {
  it('grava e lê só na chave dada', () => {
    const storage = memory();
    writeDismissRecord(storage, KEY_A, { dismissedAt: NOW });
    expect(storage.map.get(KEY_A)).toBe(JSON.stringify({ dismissedAt: NOW }));
    expect(readDismissRecord(storage, KEY_A)).toEqual({ dismissedAt: NOW });
    expect(readDismissRecord(storage, KEY_B)).toEqual({ dismissedAt: null });
  });

  it('lê "nunca dispensado" quando falta, está bloqueado ou tem lixo', () => {
    expect(readDismissRecord(undefined, KEY_A)).toEqual({ dismissedAt: null });
    expect(
      readDismissRecord(
        {
          getItem: () => {
            throw new Error('denied');
          },
        },
        KEY_A,
      ),
    ).toEqual({ dismissedAt: null });
    expect(readDismissRecord({ getItem: () => '{não é json' }, KEY_A)).toEqual({
      dismissedAt: null,
    });
    expect(
      readDismissRecord({ getItem: () => JSON.stringify({ dismissedAt: 'ontem' }) }, KEY_A),
    ).toEqual({ dismissedAt: null });
  });

  it('uma gravação que lança, ou storage ausente, nunca quebra o app', () => {
    expect(() =>
      writeDismissRecord(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        KEY_A,
        { dismissedAt: NOW },
      ),
    ).not.toThrow();
    expect(() => writeDismissRecord(undefined, KEY_A, { dismissedAt: NOW })).not.toThrow();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/lib/dismissRecord.test.ts`
Expected: FAIL com "Cannot find module './dismissRecord'".

- [ ] **Step 3: Implementar `lib/dismissRecord.ts`**

Crie `apps/web/src/lib/dismissRecord.ts`:

```ts
/** "Agora não" vale por 30 dias. Cada convite tem a sua chave versionada no localStorage. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export interface DismissRecord {
  dismissedAt: number | null;
}

/** Dispensado nos últimos 30 dias. Data futura (relógio voltou) não conta. */
export function isDismissedAt(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null) return false;
  const age = now - dismissedAt;
  return age >= 0 && age < DISMISS_MS;
}

/** Valor ausente, bloqueado ou inválido vale como "nunca dispensado". */
export function readDismissRecord(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
): DismissRecord {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return { dismissedAt: null };
    const parsed: unknown = JSON.parse(raw);
    const dismissedAt = (parsed as { dismissedAt?: unknown } | null)?.dismissedAt;
    return {
      dismissedAt:
        typeof dismissedAt === 'number' && Number.isFinite(dismissedAt) ? dismissedAt : null,
    };
  } catch {
    return { dismissedAt: null };
  }
}

export function writeDismissRecord(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string,
  record: DismissRecord,
): void {
  try {
    storage?.setItem(key, JSON.stringify(record));
  } catch {
    // Armazenamento bloqueado ou cheio: a dispensa vale só nesta sessão.
  }
}
```

- [ ] **Step 4: Trocar `installPolicy.ts` pelo registro genérico**

Substitua o conteúdo de `apps/web/src/pwa/installPolicy.ts` por (mudam só o topo, o `decideInstallCard` e os dois wrappers de registro; o resto permanece igual):

```ts
import {
  isDismissedAt,
  readDismissRecord,
  writeDismissRecord,
  type DismissRecord,
} from '../lib/dismissRecord';

/** Chave versionada do convite de instalação. Mudar o formato pede nova versão da chave. */
export const INSTALL_RECORD_KEY = 'cifras.installCard.v1';
export { DISMISS_MS } from '../lib/dismissRecord';

export type InstallCardMode = 'hidden' | 'prompt' | 'ios';

export type InstallRecord = DismissRecord;

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** `display-mode` standalone, fullscreen ou minimal-ui: o app abriu pela tela inicial. */
  displayModeStandalone: boolean;
  /** `navigator.standalone` (iOS Safari). */
  navigatorStandalone: boolean;
}

export interface InstallDecisionInput {
  iosSafari: boolean;
  standalone: boolean;
  installed: boolean;
  dismissedAt: number | null;
  now: number;
  hasPrompt: boolean;
}

const STANDALONE_MODES = ['standalone', 'fullscreen', 'minimal-ui'] as const;
const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo/;

export function readInstallEnvironment(win: Window): InstallEnvironment {
  // jsdom and some old browsers have no matchMedia: then the app is not installed as far as we know.
  const displayModeStandalone =
    typeof win.matchMedia === 'function' &&
    STANDALONE_MODES.some((mode) => win.matchMedia(`(display-mode: ${mode})`).matches);
  return {
    userAgent: win.navigator.userAgent,
    maxTouchPoints: win.navigator.maxTouchPoints,
    displayModeStandalone,
    navigatorStandalone:
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

/** Safari de iPhone, iPod e iPad (o iPadOS se anuncia como Mac com toque). Outros navegadores do iOS ficam de fora. */
export function isIosSafari(
  env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>,
): boolean {
  const ua = env.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !OTHER_IOS_BROWSERS.test(ua);
}

export function isStandalone(env: InstallEnvironment): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

export function decideInstallCard(input: InstallDecisionInput): InstallCardMode {
  if (input.standalone || input.installed) return 'hidden';
  if (isDismissedAt(input.dismissedAt, input.now)) return 'hidden';
  if (input.hasPrompt) return 'prompt';
  return input.iosSafari ? 'ios' : 'hidden';
}

/** `window.localStorage` pode lançar (SecurityError em modos de privacidade). */
export function localStorageOrUndefined(win: Window): Storage | undefined {
  try {
    return win.localStorage;
  } catch {
    return undefined;
  }
}

export function readInstallRecord(storage: Pick<Storage, 'getItem'> | undefined): InstallRecord {
  return readDismissRecord(storage, INSTALL_RECORD_KEY);
}

export function writeInstallRecord(
  storage: Pick<Storage, 'setItem'> | undefined,
  record: InstallRecord,
): void {
  writeDismissRecord(storage, INSTALL_RECORD_KEY, record);
}
```

- [ ] **Step 5: Rodar os testes de dispensa e os de instalação**

Run: `cd apps/web && npx vitest run src/lib/dismissRecord.test.ts src/pwa/installPolicy.test.ts`
Expected: PASS (os testes de `installPolicy` continuam verdes sem edição).

- [ ] **Step 6: Formatar e commitar**

Run: `npx prettier --write apps/web/src/lib/dismissRecord.ts apps/web/src/lib/dismissRecord.test.ts apps/web/src/pwa/installPolicy.ts`
Commit:
```bash
git add apps/web/src/lib/dismissRecord.ts apps/web/src/lib/dismissRecord.test.ts apps/web/src/pwa/installPolicy.ts
git commit -m "refactor(pwa): generic dismissal record with a key per convite"
```

---

### Task 2: Sino compartilhado (`push/bell.ts`)

**Files:**
- Create: `apps/web/src/push/bell.ts`
- Create: `apps/web/src/push/bell.test.ts`
- Modify: `apps/web/src/push/AvisosRow.tsx` (importa o traço em vez de declarar a constante)

**Interfaces:**
- Consumes: nada.
- Produces: `BELL_PATH` (usado pela Tarefa 9 e pela linha da aba Mais).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/push/bell.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BELL_PATH } from './bell';

describe('BELL_PATH', () => {
  it('é o contorno do sino da aba Mais e do convite de avisos', () => {
    expect(BELL_PATH).toBe(
      'M6 8a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 14 6 8M10 20a2 2 0 0 0 4 0',
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/push/bell.test.ts`
Expected: FAIL com "Cannot find module './bell'".

- [ ] **Step 3: Criar `push/bell.ts` e trocar a constante em `AvisosRow.tsx`**

Crie `apps/web/src/push/bell.ts`:

```ts
/** Traço do sino: linha "Avisos" da aba Mais e convite "Ative os avisos" da aba Músicas. */
export const BELL_PATH = 'M6 8a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 14 6 8M10 20a2 2 0 0 0 4 0';
```

Em `apps/web/src/push/AvisosRow.tsx`:
- remova a linha `const BELL = '...';` (linha 5);
- adicione `import { BELL_PATH } from './bell';` logo após `import type { AvisosStatus, PushService } from './types';`;
- troque `<path d={BELL} />` por `<path d={BELL_PATH} />`.

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run src/push/bell.test.ts src/push/AvisosRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/push/bell.ts apps/web/src/push/bell.test.ts apps/web/src/push/AvisosRow.tsx`
```bash
git add apps/web/src/push/bell.ts apps/web/src/push/bell.test.ts apps/web/src/push/AvisosRow.tsx
git commit -m "refactor(push): share the bell outline with the avisos card"
```

---

### Task 3: Sessão do convite (`push/avisosSession.ts`)

**Files:**
- Create: `apps/web/src/push/avisosSession.ts`
- Create: `apps/web/src/push/avisosSession.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `AvisosSession`, `createAvisosSession`, `avisosSession` (Tarefas 6, 8, 9).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/push/avisosSession.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { avisosSession, createAvisosSession } from './avisosSession';

describe('createAvisosSession', () => {
  it('começa aberta, fecha, e só reabre com reset (helper de teste)', () => {
    const session = createAvisosSession();
    expect(session.isClosed()).toBe(false);
    session.close();
    expect(session.isClosed()).toBe(true);
    session.reset();
    expect(session.isClosed()).toBe(false);
  });

  it('cada sessão criada é independente', () => {
    const a = createAvisosSession();
    const b = createAvisosSession();
    a.close();
    expect(b.isClosed()).toBe(false);
  });

  it('a sessão do app começa aberta', () => {
    expect(avisosSession.isClosed()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/push/avisosSession.test.ts`
Expected: FAIL com "Cannot find module './avisosSession'".

- [ ] **Step 3: Implementar `push/avisosSession.ts`**

Crie `apps/web/src/push/avisosSession.ts`:

```ts
export interface AvisosSession {
  isClosed(): boolean;
  close(): void;
  /** Só para testes: reabre a sessão. O app não chama. */
  reset(): void;
}

export function createAvisosSession(): AvisosSession {
  let closed = false;
  return {
    isClosed: () => closed,
    close: () => {
      closed = true;
    },
    reset: () => {
      closed = false;
    },
  };
}

/**
 * Fechada por qualquer desfecho do convite de avisos e por Desativar na aba Mais.
 * Em memória: reabre só com a recarga do app (mesmo padrão de `installPromptStore`).
 */
export const avisosSession = createAvisosSession();
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run src/push/avisosSession.test.ts`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/push/avisosSession.ts apps/web/src/push/avisosSession.test.ts`
```bash
git add apps/web/src/push/avisosSession.ts apps/web/src/push/avisosSession.test.ts
git commit -m "feat(push): in-memory session flag for the avisos card"
```

---

### Task 4: Cartão compartilhado (`ConviteCard` e CSS `.convite`)

**Files:**
- Create: `apps/web/src/ui/ConviteCard.tsx`
- Create: `apps/web/src/ui/ConviteCard.test.tsx`
- Modify: `apps/web/src/ui/redesign-install.css` (reescrito: classes `.install-card*` viram `.convite*`; acrescenta tile e estado ocupado)
- Modify: `apps/web/src/ui/themeTokens.test.ts:75-81` (bloco que confere o CSS do convite)

**Interfaces:**
- Consumes: nada.
- Produces: `ConviteCard`, `ConviteAction`, `ConviteCardProps` (Tarefas 7 e 9); classes `.convite`, `.convite__icon`, `.convite__tile`, `.convite__text`, `.convite__title`, `.convite__hint`, `.convite__close`, `.convite__action`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/ui/ConviteCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConviteCard } from './ConviteCard';

describe('ConviteCard', () => {
  it('nomeia a região pelo título e mostra o apoio', () => {
    render(
      <ConviteCard
        icon={<span>ícone</span>}
        title="Ative os avisos"
        hint="Repertório novo e lembrete do ensaio"
        onClose={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.getByText('Repertório novo e lembrete do ensaio')).toBeInTheDocument();
  });

  it('"Agora não" chama onClose; sem ação, não há botão de ação', () => {
    const onClose = vi.fn();
    render(<ConviteCard icon={null} title="Título" hint="Apoio" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
  });

  it('a ação roda ao toque e fica desabilitada quando ocupada', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <ConviteCard
        icon={null}
        title="Título"
        hint="Apoio"
        onClose={() => {}}
        action={{ label: 'Ativar', onClick }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <ConviteCard
        icon={null}
        title="Título"
        hint="Apoio"
        onClose={() => {}}
        busy
        action={{ label: 'Ativando…', disabled: true, onClick }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ativando…' })).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Título' })).toHaveAttribute('aria-busy', 'true');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/ui/ConviteCard.test.tsx`
Expected: FAIL com "Cannot find module './ConviteCard'".

- [ ] **Step 3: Implementar `ConviteCard.tsx`**

Crie `apps/web/src/ui/ConviteCard.tsx`:

```tsx
import { useId, type ReactNode } from 'react';

export interface ConviteAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

export interface ConviteCardProps {
  icon: ReactNode;
  title: string;
  hint: string;
  onClose: () => void;
  action?: ConviteAction;
  /** Ação em andamento: marca a região com aria-busy. */
  busy?: boolean;
}

/**
 * Cartão flutuante do topo da aba Músicas, usado pelos convites de instalação e de avisos.
 * Estilo em `redesign-install.css`, escopado em `.convite`.
 */
export function ConviteCard({ icon, title, hint, onClose, action, busy = false }: ConviteCardProps) {
  const titleId = useId();
  return (
    <section className="convite" aria-labelledby={titleId} aria-busy={busy || undefined}>
      <div className="convite__icon">{icon}</div>
      <div className="convite__text">
        <p id={titleId} className="convite__title">
          {title}
        </p>
        <p className="convite__hint">{hint}</p>
      </div>
      <button type="button" className="convite__close" aria-label="Agora não" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
      {action && (
        <button
          type="button"
          className="convite__action"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          <span>{action.label}</span>
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar o teste do cartão**

Run: `cd apps/web && npx vitest run src/ui/ConviteCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Escrever o CSS `.convite` e atualizar `themeTokens.test.ts`**

Em `apps/web/src/ui/themeTokens.test.ts`, substitua o bloco `it('styles the install card ...', ...)` (linhas 75 a 81) por:

```ts
  it('styles the convite cards with the shared shadow token, 44 px tap targets and the accent tile', () => {
    const install = readFileSync(resolve(import.meta.dirname, 'redesign-install.css'), 'utf8');
    expect(install).toMatch(/\.convite \{[^}]*box-shadow: var\(--shadow-pop\);/);
    expect(install).toMatch(/\.convite__close \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(install).toMatch(/\.convite__action \{[^}]*min-height: 44px;/);
    expect(install).toMatch(/\.convite__action span \{[^}]*height: 36px;/);
    expect(install).toMatch(/\.convite__close span \{[^}]*width: 28px;[^}]*height: 28px;/);
    expect(install).toMatch(/\.convite__tile \{[^}]*background: var\(--color-accent-soft\);/);
  });
```

Substitua o conteúdo de `apps/web/src/ui/redesign-install.css` por (mesmas propriedades do #109, classes renomeadas, mais o tile e o estado ocupado):

```css
/* Convites flutuantes do topo da aba Músicas (issues 109 e 125): instalação e avisos. Só tokens; tudo escopado em .convite. */
.convite {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  left: 20px;
  right: 20px;
  z-index: 20;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 44px;
  column-gap: 12px;
  align-items: start;
  max-width: 350px;
  margin: 0 auto;
  padding: 12px 4px 10px 14px;
  border: 1px solid var(--color-border-strong);
  border-radius: 18px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-pop);
}

.convite__icon {
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 48px;
  height: 48px;
}

.convite__tile {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 13px;
  background: var(--color-accent-soft);
  color: var(--color-accent-text);
}

.convite__text {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}

.convite__title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-text);
}

.convite__hint {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--color-muted);
}

.convite__close {
  grid-column: 3;
  grid-row: 1;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -8px -4px 0 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.convite__close span {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: var(--color-elevated);
  color: var(--color-muted);
  font-size: 18px;
  line-height: 1;
}

.convite__action {
  grid-column: 2 / 4;
  grid-row: 2;
  justify-self: start;
  display: flex;
  align-items: center;
  min-height: 44px;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.convite__action span {
  display: inline-flex;
  align-items: center;
  height: 36px;
  padding: 0 18px;
  border-radius: 999px;
  background: var(--color-accent);
  color: var(--color-on-accent);
  font-size: 14px;
  font-weight: 800;
}

/* Ação em andamento: a pílula perde força, sem trocar cor. */
.convite__action:disabled {
  cursor: default;
}

.convite__action:disabled span {
  opacity: 0.6;
}

.convite button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Rodar os testes de tema e do cartão**

Run: `cd apps/web && npx vitest run src/ui/themeTokens.test.ts src/ui/ConviteCard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Formatar e commitar**

Run: `npx prettier --write apps/web/src/ui/ConviteCard.tsx apps/web/src/ui/ConviteCard.test.tsx apps/web/src/ui/redesign-install.css apps/web/src/ui/themeTokens.test.ts`
```bash
git add apps/web/src/ui/ConviteCard.tsx apps/web/src/ui/ConviteCard.test.tsx apps/web/src/ui/redesign-install.css apps/web/src/ui/themeTokens.test.ts
git commit -m "refactor(ui): shared convite card for install and avisos"
```

---

### Task 5: Documentação (`docs/design-system.md` e `docs/sistema.md`)

**Files:**
- Modify: `docs/design-system.md` (linhas 79, 111 e §8)
- Modify: `docs/sistema.md` (linhas 19, 214 e 278; saldo de linhas zero)

**Interfaces:**
- Consumes: nada (texto).
- Produces: nada.

- [ ] **Step 1: Verificar a contagem atual**

Run: `wc -l docs/sistema.md`
Expected: `300 docs/sistema.md`. Depois da edição, o número deve continuar 300.

- [ ] **Step 2: Editar `docs/design-system.md`**

a) Linha 79: troque `redesign-install.css` (convite de instalação) por `redesign-install.css` (convites de instalação e de avisos, classe `.convite`, componente `ConviteCard`).

b) Linha 111 (linha "Convite de instalação"): substitua a linha inteira por:

```
| **Convite (cartão do topo da aba Músicas)** | cartão fixo no topo da aba Músicas, só membro e admin, abaixo da barra de status; componente `ConviteCard` (classe `.convite`; título 15 px 800, apoio 13 px muted; "×" com aria-label "Agora não", alvo 44 px e disco 28 px; pílula âmbar de 36 px com alvo 44 px). **Instalar** (`InstallCard`): logo `icons/icon.svg` 48 px, título "Cifras como app", apoio "Abra direto da tela inicial"; Android/Chromium: "Adicionar" abre o diálogo de instalação; iPhone/iPad com Safari: sem botão, apoio "Toque em Compartilhar e depois em Adicionar à Tela de Início". Some no app instalado e em outros navegadores sem o evento. **Avisos** (`AvisosCard`): só no app instalado e com status "disponível"; tile do sino 48 px em `--color-accent-soft` (traço `--color-accent-text`), título "Ative os avisos", apoio "Repertório novo e lembrete do ensaio", pílula "Ativar" (durante o toque: "Ativando…", desabilitada). Os dois nunca aparecem juntos. "×" dispensa por 30 dias, com chave própria em cada convite | `ConviteCard`, `InstallCard`, `AvisosCard`, `ui/redesign-install.css` |
```

c) §8, linha que começa com `` `28 · Músicas · convite para instalar` ``: insira `` `32 · Músicas · convite para ativar avisos`, `` logo depois de `` `29 · Músicas · convite para instalar (iPhone)`, ``.

d) §8, linha que termina com `` `L9 · Avisos · estados (claro)` ``: acrescente, antes do ponto final da linha, `` , `L10 · Músicas · convite para ativar avisos (claro)` ``.

Check de conteúdo: a linha nova não contém `#` seguido de dígitos.

- [ ] **Step 3: Editar `docs/sistema.md` (sem linhas novas)**

a) Linha 19 (`| \`/\` | Início |...`): troque a frase final `convite "Cifras como app" na aba Músicas (ver PWA)` por `convites "Cifras como app" e "Ative os avisos" na aba Músicas (ver PWA)`.

b) Linha 214 (`- Convite "Cifras como app" na aba Músicas ...`): substitua a linha inteira por:

```
- Convites na aba Músicas (só membro e admin), com o mesmo cartão (`ConviteCard`). Instalar: no Android/Chromium o `beforeinstallprompt` é guardado já no carregamento e "Adicionar" abre o diálogo (recusar conta como "Agora não"); no iPhone e iPad com Safari, a instrução de Compartilhar; some no app instalado. Ative os avisos: só no app instalado, com o estado "disponível"; "Ativar" usa o mesmo fluxo da aba Mais e, no sucesso, manda um aviso de teste. Os dois nunca aparecem juntos. "Agora não" dispensa por 30 dias, com chaves próprias no `localStorage` (`cifras.installCard.v1` e `cifras.avisosCard.v1`); sem armazenamento, volta a cada carga.
```

c) Linha 278 (`- Convite de instalação: Firefox Android ...`): substitua a linha inteira por:

```
- Convites da aba Músicas: o de instalação não chega a Firefox Android nem a outros navegadores sem `beforeinstallprompt`, e no iPhone só o Safari recebe a instrução (Chrome e Firefox do iOS ficam sem convite; quem instalou e abre o Safari vê a instrução até dispensar). O de avisos depende do app instalado (no iPhone, iOS 16.4+) e some na sessão depois de qualquer resultado (ativou, negou, erro, "×" ou Desativar na aba Mais); volta na próxima abertura do app se ainda estiver disponível.
```

- [ ] **Step 4: Conferir a contagem**

Run: `wc -l docs/sistema.md`
Expected: `300 docs/sistema.md`.

- [ ] **Step 5: Commitar**

```bash
git add docs/design-system.md docs/sistema.md
git commit -m "docs: convite de avisos no design system e no mapa do sistema"
```

---

### Task 6: Política do card de avisos (`push/avisosCard.ts`)

**Files:**
- Create: `apps/web/src/push/avisosCard.ts`
- Create: `apps/web/src/push/avisosCard.test.ts`

**Interfaces:**
- Consumes: `isDismissedAt` (Tarefa 1); `AvisosStatus` de `push/types.ts`; `decideInstallCard` de `pwa/installPolicy.ts` (só no teste de exclusão mútua).
- Produces: `AVISOS_RECORD_KEY`, `AvisosCardMode`, `AvisosCardInput`, `decideAvisosCard`, `isOfferStatus` (Tarefa 9).

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/web/src/push/avisosCard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decideInstallCard } from '../pwa/installPolicy';
import type { AvisosStatus } from './types';
import { AVISOS_RECORD_KEY, decideAvisosCard, isOfferStatus } from './avisosCard';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23, 12);
const base = { canEdit: true, standalone: true, dismissedAt: null, now: NOW, sessionClosed: false };

describe('decideAvisosCard', () => {
  it('consulta o estado só para membro ou admin dentro do app instalado', () => {
    expect(decideAvisosCard(base)).toBe('check');
  });

  it('esconde para visitante e para a aba do navegador', () => {
    expect(decideAvisosCard({ ...base, canEdit: false })).toBe('hidden');
    expect(decideAvisosCard({ ...base, standalone: false })).toBe('hidden');
  });

  it('esconde por 30 dias depois de "Agora não", e volta depois', () => {
    expect(decideAvisosCard({ ...base, dismissedAt: NOW - 29 * DAY })).toBe('hidden');
    expect(decideAvisosCard({ ...base, dismissedAt: NOW - 30 * DAY })).toBe('check');
  });

  it('esconde pelo resto da sessão quando a sessão está fechada', () => {
    expect(decideAvisosCard({ ...base, sessionClosed: true })).toBe('hidden');
  });

  it('usa a própria chave versionada, diferente da do convite de instalação', () => {
    expect(AVISOS_RECORD_KEY).toBe('cifras.avisosCard.v1');
    expect(AVISOS_RECORD_KEY).not.toBe('cifras.installCard.v1');
  });

  it('nunca aparece junto do card de instalar, em nenhuma combinação de ambiente', () => {
    for (const standalone of [true, false]) {
      for (const iosSafari of [true, false]) {
        for (const hasPrompt of [true, false]) {
          const install = decideInstallCard({
            iosSafari,
            standalone,
            installed: false,
            dismissedAt: null,
            now: NOW,
            hasPrompt,
          });
          const avisos = decideAvisosCard({ ...base, standalone });
          expect(install !== 'hidden' && avisos === 'check').toBe(false);
        }
      }
    }
  });
});

describe('isOfferStatus', () => {
  it('oferece só com "disponível" ou "ativando" (o toque em andamento)', () => {
    expect(isOfferStatus('available')).toBe(true);
    expect(isOfferStatus('enabling')).toBe(true);
    const others: AvisosStatus[] = [
      'checking',
      'active',
      'disabling',
      'blocked',
      'ios-install',
      'unsupported',
      'error',
    ];
    for (const status of others) expect(isOfferStatus(status)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/push/avisosCard.test.ts`
Expected: FAIL com "Cannot find module './avisosCard'".

- [ ] **Step 3: Implementar `push/avisosCard.ts`**

Crie `apps/web/src/push/avisosCard.ts`:

```ts
import { isDismissedAt } from '../lib/dismissRecord';
import type { AvisosStatus } from './types';

/** Chave própria do convite de avisos (não é a do convite de instalação). */
export const AVISOS_RECORD_KEY = 'cifras.avisosCard.v1';

/** 'check' = vale consultar o estado dos avisos. Só então a Músicas chama `load()`. */
export type AvisosCardMode = 'hidden' | 'check';

export interface AvisosCardInput {
  canEdit: boolean;
  standalone: boolean;
  dismissedAt: number | null;
  now: number;
  sessionClosed: boolean;
}

export function decideAvisosCard(input: AvisosCardInput): AvisosCardMode {
  if (!input.canEdit || !input.standalone || input.sessionClosed) return 'hidden';
  if (isDismissedAt(input.dismissedAt, input.now)) return 'hidden';
  return 'check';
}

/** O cartão aparece com "disponível" e segue aparecendo durante o toque ("ativando"). */
export function isOfferStatus(status: AvisosStatus): boolean {
  return status === 'available' || status === 'enabling';
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd apps/web && npx vitest run src/push/avisosCard.test.ts`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/push/avisosCard.ts apps/web/src/push/avisosCard.test.ts`
```bash
git add apps/web/src/push/avisosCard.ts apps/web/src/push/avisosCard.test.ts
git commit -m "feat(push): eligibility policy for the avisos card"
```

---

### Task 7: Card de instalar usa o `ConviteCard`

**Files:**
- Modify: `apps/web/src/pwa/InstallCard.tsx` (vira um uso de `ConviteCard`)
- Modify: `apps/web/src/pwa/InstallCard.test.tsx` (acrescenta um teste)

**Interfaces:**
- Consumes: `ConviteCard` (Tarefa 4).
- Produces: `InstallCard` com a mesma assinatura (`{ useInstall?: UseInstallCard }`).

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/web/src/pwa/InstallCard.test.tsx`, acrescente dentro do `describe('InstallCard', ...)`:

```tsx
  it('usa o cartão compartilhado (.convite)', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('prompt').useInstall} />);
    expect(container.querySelector('section.convite')).not.toBeNull();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/pwa/InstallCard.test.tsx`
Expected: FAIL no teste novo (o componente ainda usa `install-card`).

- [ ] **Step 3: Reescrever `InstallCard.tsx`**

Substitua o conteúdo de `apps/web/src/pwa/InstallCard.tsx` por:

```tsx
import { ConviteCard } from '../ui/ConviteCard';
import { useInstallPrompt, type InstallCardState } from './useInstallPrompt';

export type UseInstallCard = () => InstallCardState;

// Mesmo padrão de UpdatePrompt: o hook entra por parâmetro, então o componente testa sem storage nem evento.
export function InstallCard({ useInstall = useInstallPrompt }: { useInstall?: UseInstallCard }) {
  const { card, install, dismiss } = useInstall();
  if (card === 'hidden') return null;
  return (
    <ConviteCard
      icon={<img src="/icons/icon.svg" alt="" width={48} height={48} />}
      title="Cifras como app"
      hint={
        card === 'prompt'
          ? 'Abra direto da tela inicial'
          : 'Toque em Compartilhar e depois em Adicionar à Tela de Início'
      }
      onClose={dismiss}
      action={card === 'prompt' ? { label: 'Adicionar', onClick: () => void install() } : undefined}
    />
  );
}
```

- [ ] **Step 4: Rodar os testes de instalação**

Run: `cd apps/web && npx vitest run src/pwa/InstallCard.test.tsx src/pwa/useInstallPrompt.test.tsx`
Expected: PASS (inclui o teste de ícone decorativo, que continua achando o `img`).

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/pwa/InstallCard.tsx apps/web/src/pwa/InstallCard.test.tsx`
```bash
git add apps/web/src/pwa/InstallCard.tsx apps/web/src/pwa/InstallCard.test.tsx
git commit -m "refactor(pwa): install card uses the shared convite card"
```

---

### Task 8: Desativar fecha a sessão do convite (`push/usePushAvisos.ts`)

**Files:**
- Modify: `apps/web/src/push/usePushAvisos.ts` (`disable` fecha a sessão)
- Modify: `apps/web/src/push/usePushAvisos.test.tsx` (acrescenta um teste)

**Interfaces:**
- Consumes: `avisosSession` (Tarefa 3).
- Produces: `usePushAvisos(service): AvisosView` (assinatura intacta).

- [ ] **Step 1: Escrever o teste que falha**

Em `apps/web/src/push/usePushAvisos.test.tsx`, adicione o import `import { avisosSession } from './avisosSession';` e, dentro de `describe('usePushAvisos', ...)`, acrescente:

```tsx
  it('desativar fecha a sessão do convite, para ele não voltar agora', async () => {
    avisosSession.reset();
    const s = service();
    const { result } = renderHook(() => usePushAvisos(s));
    await waitFor(() => expect(result.current.status).toBe('available'));
    await act(async () => {
      result.current.disable();
    });
    expect(avisosSession.isClosed()).toBe(true);
    avisosSession.reset();
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/push/usePushAvisos.test.tsx`
Expected: FAIL no teste novo (`isClosed` é falso).

- [ ] **Step 3: Implementar**

Em `apps/web/src/push/usePushAvisos.ts`:
- adicione `import { avisosSession } from './avisosSession';` no topo;
- troque o bloco `disable` por:

```ts
    disable: () => {
      setTest('idle');
      // Desativar é "agora não" nesta sessão: o convite da Músicas não volta até a próxima carga.
      avisosSession.close();
      run('disabling', () => service.disable());
    },
```

- [ ] **Step 4: Rodar os testes do hook e da linha**

Run: `cd apps/web && npx vitest run src/push/usePushAvisos.test.tsx src/push/AvisosRow.test.tsx`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/push/usePushAvisos.ts apps/web/src/push/usePushAvisos.test.tsx`
```bash
git add apps/web/src/push/usePushAvisos.ts apps/web/src/push/usePushAvisos.test.tsx
git commit -m "feat(push): disabling avisos closes the convite for this session"
```

---

### Task 9: Componente `AvisosCard` e serviço falso de teste

**Files:**
- Create: `apps/web/src/test/fakePushService.ts`
- Create: `apps/web/src/push/AvisosCard.tsx`
- Create: `apps/web/src/push/AvisosCard.test.tsx`

**Interfaces:**
- Consumes: `ConviteCard` (T4), `BELL_PATH` (T2), `decideAvisosCard`, `isOfferStatus`, `AVISOS_RECORD_KEY` (T6), `avisosSession`, `AvisosSession`, `createAvisosSession` (T3), `usePushAvisos` (T8), `readDismissRecord`, `writeDismissRecord` (T1), `localStorageOrUndefined`, `isStandalone`, `readInstallEnvironment` (`pwa/installPolicy.ts`), `PushContext`, `PushService` (`push/types.ts`), `canEdit` e `useAuth`.
- Produces: `AvisosCard`, `AvisosCardProps`; `fakePushService` (usado pela Tarefa 10).

- [ ] **Step 1: Criar o serviço falso compartilhado**

Crie `apps/web/src/test/fakePushService.ts`:

```ts
import { vi } from 'vitest';
import type { AvisosStatus, PushService } from '../push/types';

/** Serviço de avisos falso para testes de componente. Cada método é um `vi.fn`; o teste sobrescreve o que precisa. */
export function fakePushService(overrides: Partial<PushService> = {}): PushService {
  return {
    load: vi.fn(async () => 'available' as AvisosStatus),
    enable: vi.fn(async () => 'active' as AvisosStatus),
    disable: vi.fn(async () => 'available' as AvisosStatus),
    sendTest: vi.fn(async () => 'sent' as const),
    revalidate: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => {}),
    ...overrides,
  };
}
```

- [ ] **Step 2: Escrever o teste que falha**

Crie `apps/web/src/push/AvisosCard.test.tsx`:

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '../auth/roles';
import { AuthContext, type AuthState } from '../auth/useAuth';
import { INSTALL_RECORD_KEY } from '../pwa/installPolicy';
import { testUser } from '../test/fakeGateway';
import { fakePushService } from '../test/fakePushService';
import { AVISOS_RECORD_KEY } from './avisosCard';
import { AvisosCard } from './AvisosCard';
import { createAvisosSession, type AvisosSession } from './avisosSession';
import { PushContext, type AvisosStatus, type PushService } from './types';

const DAY = 24 * 60 * 60 * 1000;

/** `display-mode: standalone` verdadeiro ou falso (jsdom não tem matchMedia). */
function standalone(on: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({ matches: on && query === '(display-mode: standalone)' }),
  });
}

function auth(role: Role): AuthState {
  return {
    status: 'signed-in',
    user: testUser,
    role,
    access: 'granted',
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
}

function renderCard(
  service: PushService | null,
  role: Role = 'member',
  session: AvisosSession = createAvisosSession(),
) {
  return render(
    <AuthContext.Provider value={auth(role)}>
      <PushContext.Provider value={service}>
        <AvisosCard session={session} />
      </PushContext.Provider>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  standalone(true);
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AvisosCard', () => {
  it('não renderiza nada sem serviço de avisos (sem VAPID)', () => {
    const { container } = renderCard(null);
    expect(container).toBeEmptyDOMElement();
  });

  it('nunca consulta o estado para visitante', () => {
    const service = fakePushService();
    const { container } = renderCard(service, 'viewer');
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('nunca consulta o estado fora do app instalado', () => {
    standalone(false);
    const service = fakePushService();
    const { container } = renderCard(service);
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('nunca consulta o estado enquanto dispensado por 30 dias', () => {
    localStorage.setItem(AVISOS_RECORD_KEY, JSON.stringify({ dismissedAt: Date.now() - DAY }));
    const service = fakePushService();
    const { container } = renderCard(service);
    expect(container).toBeEmptyDOMElement();
    expect(service.load).not.toHaveBeenCalled();
  });

  it('fica vazio enquanto verifica e aparece com o estado disponível', async () => {
    let answer!: (status: AvisosStatus) => void;
    const service = fakePushService({
      load: vi.fn(() => new Promise<AvisosStatus>((resolve) => (answer = resolve))),
    });
    renderCard(service);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    await act(async () => answer('available'));
    expect(screen.getByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.getByText('Repertório novo e lembrete do ensaio')).toBeInTheDocument();
  });

  it('o toque chama enable na mesma chamada, e o segundo toque não pede de novo', async () => {
    const service = fakePushService({
      enable: vi.fn(() => new Promise<AvisosStatus>(() => {})),
    });
    renderCard(service);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    expect(service.enable).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: 'Ativando…' });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    expect(service.enable).toHaveBeenCalledTimes(1);
  });

  it('sucesso: o cartão some, o aviso de teste sai uma vez e a sessão fecha', async () => {
    const service = fakePushService({ enable: vi.fn(async () => 'active' as const) });
    const session = createAvisosSession();
    renderCard(service, 'member', session);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
    await waitFor(() => expect(service.sendTest).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(session.isClosed()).toBe(true);
  });

  it.each(['blocked', 'error'] as const)(
    'desfecho "%s" some e não volta ao remontar na mesma sessão, sem mensagem nova',
    async (outcome) => {
      const service = fakePushService({ enable: vi.fn(async () => outcome) });
      const session = createAvisosSession();
      const { unmount } = renderCard(service, 'member', session);
      fireEvent.click(await screen.findByRole('button', { name: 'Ativar' }));
      await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
      expect(service.sendTest).not.toHaveBeenCalled();
      unmount();

      renderCard(service, 'member', session);
      await waitFor(() => expect(service.load).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    },
  );

  it('"Agora não" grava a chave própria por 30 dias e não mexe na do convite de instalação', async () => {
    renderCard(fakePushService());
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(AVISOS_RECORD_KEY) ?? 'null')).toEqual({
      dismissedAt: expect.any(Number),
    });
    expect(localStorage.getItem(INSTALL_RECORD_KEY)).toBeNull();
  });

  it('sem armazenamento, "Agora não" ainda esconde o cartão nesta sessão', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    const session = createAvisosSession();
    renderCard(fakePushService(), 'member', session);
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(session.isClosed()).toBe(true);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/push/AvisosCard.test.tsx`
Expected: FAIL com "Cannot find module './AvisosCard'".

- [ ] **Step 4: Implementar `push/AvisosCard.tsx`**

Crie `apps/web/src/push/AvisosCard.tsx`. Pontos que o implementador não deve mudar: o `useEffect` lê o status depois do render; o `onClick` chama `view.enable()` sem nada antes; o guarda por `status !== 'available'` impede segundo pedido.

```tsx
import { useContext, useEffect, useRef, useState } from 'react';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { readDismissRecord, writeDismissRecord } from '../lib/dismissRecord';
import { isStandalone, localStorageOrUndefined, readInstallEnvironment } from '../pwa/installPolicy';
import { ConviteCard } from '../ui/ConviteCard';
import { AVISOS_RECORD_KEY, decideAvisosCard, isOfferStatus } from './avisosCard';
import { avisosSession, type AvisosSession } from './avisosSession';
import { BELL_PATH } from './bell';
import { usePushAvisos } from './usePushAvisos';
import { PushContext, type PushService } from './types';

export interface AvisosCardProps {
  session?: AvisosSession;
}

/**
 * Convite "Ative os avisos" na aba Músicas. Enquanto não é elegível, não chama `load()`:
 * a elegibilidade é decidida antes de montar `AvisosOffer` (que usa `usePushAvisos`).
 */
export function AvisosCard({ session = avisosSession }: AvisosCardProps) {
  const service = useContext(PushContext);
  const { role } = useAuth();
  const [environment] = useState(() => readInstallEnvironment(window));
  const [storage] = useState(() => localStorageOrUndefined(window));
  const [dismissedAt] = useState(() => readDismissRecord(storage, AVISOS_RECORD_KEY).dismissedAt);
  if (!service) return null;
  const mode = decideAvisosCard({
    canEdit: canEdit(role),
    standalone: isStandalone(environment),
    dismissedAt,
    now: Date.now(),
    sessionClosed: session.isClosed(),
  });
  if (mode === 'hidden') return null;
  return <AvisosOffer service={service} session={session} storage={storage} />;
}

interface AvisosOfferProps {
  service: PushService;
  session: AvisosSession;
  storage: Pick<Storage, 'setItem'> | undefined;
}

function AvisosOffer({ service, session, storage }: AvisosOfferProps) {
  const view = usePushAvisos(service);
  const { status, sendTest } = view;
  const [gone, setGone] = useState(false);
  // Marca o toque em "Ativar". O desfecho vem do status (o SDK decide, o cartão não).
  const asked = useRef(false);

  useEffect(() => {
    if (!asked.current || status === 'enabling') return;
    asked.current = false;
    session.close();
    if (status === 'active') sendTest();
  }, [status, sendTest, session]);

  if (gone || !isOfferStatus(status)) return null;
  const busy = status === 'enabling';

  return (
    <ConviteCard
      icon={
        <span className="convite__tile" aria-hidden="true">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={BELL_PATH} />
          </svg>
        </span>
      }
      title="Ative os avisos"
      hint="Repertório novo e lembrete do ensaio"
      busy={busy}
      onClose={() => {
        writeDismissRecord(storage, AVISOS_RECORD_KEY, { dismissedAt: Date.now() });
        session.close();
        setGone(true);
      }}
      action={{
        label: busy ? 'Ativando…' : 'Ativar',
        disabled: busy,
        onClick: () => {
          // Sem await antes: o SDK pede a permissão dentro deste toque. O guarda impede o segundo pedido.
          if (status !== 'available') return;
          asked.current = true;
          view.enable();
        },
      }}
    />
  );
}
```

- [ ] **Step 5: Rodar os testes do cartão**

Run: `cd apps/web && npx vitest run src/push/AvisosCard.test.tsx`
Expected: PASS. Se o teste de "sem armazenamento" falhar por causa do `vi.spyOn` em `Storage.prototype`, troque o espião por `vi.spyOn(window.localStorage, 'setItem')`; o comportamento testado é o mesmo.

- [ ] **Step 6: Formatar e commitar**

Run: `npx prettier --write apps/web/src/test/fakePushService.ts apps/web/src/push/AvisosCard.tsx apps/web/src/push/AvisosCard.test.tsx`
```bash
git add apps/web/src/test/fakePushService.ts apps/web/src/push/AvisosCard.tsx apps/web/src/push/AvisosCard.test.tsx
git commit -m "feat(push): ative os avisos card in the installed app"
```

---

### Task 10: Montar o cartão na Músicas (`search/HomePage.tsx`)

**Files:**
- Modify: `apps/web/src/search/HomePage.tsx` (importa e monta `AvisosCard` na aba Músicas)
- Modify: `apps/web/src/search/HomePage.test.tsx` (renderHome aceita serviço de avisos; testes novos)

**Interfaces:**
- Consumes: `AvisosCard` (T9), `PushContext` (`push/types.ts`), `fakePushService` (T9).
- Produces: nada novo.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/web/src/search/HomePage.test.tsx`:
a) acrescente os imports `import { PushContext, type PushService } from '../push/types';` e `import { fakePushService } from '../test/fakePushService';`;
b) em `renderHome`, aceite `push?: PushService` em `options` e envolva o conteúdo do `AuthContext.Provider` com `<PushContext.Provider value={options.push ?? null}>` (o `MemoryRouter` continua dentro dele);
c) acrescente este `describe` no fim do arquivo:

```tsx
describe('avisos card on the Músicas tab', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: query === '(display-mode: standalone)' }),
    });
  });

  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
    localStorage.clear();
  });

  it('aparece na Músicas para membro, no app instalado, com o estado disponível', async () => {
    renderHome({ role: 'member', path: '/', push: fakePushService() });
    expect(await screen.findByRole('region', { name: 'Ative os avisos' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cifras como app' })).not.toBeInTheDocument();
  });

  it('não aparece nas outras abas', async () => {
    const service = fakePushService();
    renderHome({ role: 'member', path: '/?aba=cantores', push: service });
    await waitFor(() => expect(screen.queryByRole('region')).not.toBeInTheDocument());
    expect(service.load).not.toHaveBeenCalled();
  });

  it('não aparece para visitante', async () => {
    const service = fakePushService();
    renderHome({ role: 'viewer', path: '/', push: service });
    expect(screen.queryByRole('region', { name: 'Ative os avisos' })).not.toBeInTheDocument();
    expect(service.load).not.toHaveBeenCalled();
  });
});
```

Se `HomePage.test.tsx` ainda não importa `beforeEach`/`afterEach`/`waitFor`, eles já estão importados no topo do arquivo (ver linhas 1 e 3); não duplique.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/search/HomePage.test.tsx`
Expected: FAIL nos três testes novos (o cartão ainda não é montado).

- [ ] **Step 3: Montar o cartão**

Em `apps/web/src/search/HomePage.tsx`:
- adicione `import { AvisosCard } from '../push/AvisosCard';` logo depois de `import { InstallCard } from '../pwa/InstallCard';`;
- troque a linha `{tab.id === 'musicas' && <InstallCard />}` por:

```tsx
      {tab.id === 'musicas' && <InstallCard />}
      {tab.id === 'musicas' && <AvisosCard />}
```

- [ ] **Step 4: Rodar os testes da Home e do convite de instalação**

Run: `cd apps/web && npx vitest run src/search/HomePage.test.tsx src/pwa`
Expected: PASS.

- [ ] **Step 5: Formatar e commitar**

Run: `npx prettier --write apps/web/src/search/HomePage.tsx apps/web/src/search/HomePage.test.tsx`
```bash
git add apps/web/src/search/HomePage.tsx apps/web/src/search/HomePage.test.tsx
git commit -m "feat(search): mount the avisos card on the Músicas tab"
```

---

### Task 11: E2E do cartão (`qa`, etapa 5)

**Files:**
- Create: `e2e/avisos-card.spec.ts`

**Interfaces:**
- Consumes: fixtures de `e2e/fixtures/app.ts` (`ADMIN`, `expect`, `signInAs`, `test`); padrão de `withPushFake` de `e2e/avisos.spec.ts` (duplicado aqui, porque o e2e não importa o app).
- Produces: nada.

Dono: `qa`, na etapa 5, com Haiku low. O `frontend-dev` não escreve este arquivo.

- [ ] **Step 1: Escrever o spec**

Crie `e2e/avisos-card.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { ADMIN, expect, signInAs, test } from './fixtures/app';

const CARD = { name: 'Ative os avisos' };
const INSTALL_CARD = { name: 'Cifras como app' };
const DISMISS_KEY = 'cifras.avisosCard.v1';

/** Mesmo controle de `apps/web/src/push/fakeMessaging.ts`, definido antes de a página carregar. */
async function withPushFake(
  page: Page,
  control: { permission?: 'default' | 'granted' | 'denied'; answer?: 'granted' | 'denied' },
) {
  await page.addInitScript((c) => {
    (window as unknown as { __CIFRAS_PUSH_FAKE__?: unknown }).__CIFRAS_PUSH_FAKE__ = c;
  }, control);
}

/** Abre como app instalado: `display-mode: standalone` verdadeiro (mesmo truque de `install.spec.ts`). */
async function asInstalledApp(page: Page) {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const mql = original(query);
      if (query !== '(display-mode: standalone)') return mql;
      return new Proxy(mql, {
        get(target, prop) {
          if (prop === 'matches') return true;
          const value = Reflect.get(target, prop, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    };
  });
}

const abrirMais = (page: Page) =>
  page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Mais' }).click();

test.describe('card Ative os avisos (app instalado)', () => {
  test('Ativar some com o cartão, sem o cartão de instalar, e a aba Mais mostra Ativados', async ({
    page,
  }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await expect(page.getByRole('region', INSTALL_CARD)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Ativar' })).toBeVisible();

    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card).toHaveCount(0);

    await abrirMais(page);
    await expect(page.locator('li.push-row').getByText('Ativados', { exact: true })).toBeVisible();
  });

  test('"Agora não" dispensa e continua escondido depois de recarregar', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Agora não' }).click();
    await expect(card).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), DISMISS_KEY)).not.toBeNull();

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('permissão negada no diálogo: o cartão some e não volta depois de recarregar', async ({
    page,
  }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'denied' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('o botão Ativar e o "Agora não" têm alvo de pelo menos 44 px', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    for (const name of ['Ativar', 'Agora não']) {
      const box = await card.getByRole('button', { name }).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test('fora do app instalado (aba do navegador) o cartão não aparece', async ({ page }) => {
  await withPushFake(page, { permission: 'default' });
  await signInAs(page, ADMIN, 'Admin');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await expect(page.getByRole('region', CARD)).toHaveCount(0);
});
```

- [ ] **Step 2: Rodar contra o build com emuladores**

Run: `npx playwright test e2e/avisos-card.spec.ts --project=mobile`
Expected: PASS nos quatro testes do app instalado e no teste de navegador. Sem emuladores locais, o CI roda este arquivo; o resultado verde no head é a evidência.

- [ ] **Step 3: Formatar e commitar**

Run: `npx prettier --write e2e/avisos-card.spec.ts`
```bash
git add e2e/avisos-card.spec.ts
git commit -m "test(e2e): avisos card in the installed app"
```

---

### Task 12: Verificação final (orquestrador)

**Files:** nenhum arquivo novo; roda os comandos do repositório.

- [ ] **Step 1: Testes, lint, tipos e formato**

Run, na raiz do repositório:
```bash
npm test
npm run lint
npm run typecheck
npm run format:check
npm run test:harness
npm run build
```
Expected: todos verdes. `npm run test:harness` confere que todo token usado em CSS está documentado (`docs/design-system.md`).

- [ ] **Step 2: Conferir o escopo do PR**

Run: `git diff --stat origin/develop...HEAD`
Expected: só arquivos das tarefas 1 a 11 e o plano. Nada em `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`, `firestore.rules`, `storage.rules`, `apps/functions/`, `packages/`, `viewer/`, `setlists/`, `pad/`.

- [ ] **Step 3: Conferir a lista de critérios**

Confira cada critério da Análise da #125 contra os testes: 1 (Tarefas 6, 9, 10), 2 (Tarefa 9, sem duplo pedido), 3 (Tarefa 9, sucesso e sendTest), 4 (Tarefa 9, blocked e error), 5 (Tarefa 9, "Agora não" com e sem storage), 6 (Tarefa 6, status fora de `available`), 7 (Tarefa 6, exclusão mútua), 8 (Tarefa 4 e Tarefa 11, alvos e tokens; conferência visual com o `designer`), 9 (Tarefa 5).

- [ ] **Step 4: Paper**

O `designer` confere os artboards `32` e `L10` contra o cartão entregue (escuro e claro) e atualiza o que faltar. Sem o MCP, o PR leva "Paper pendente: 32, L10 e estado Ativando".

---

## Self-review (feito pelo tech-lead)

- **Cobertura da Análise:** critérios 1 a 9 cobertos pelas tarefas indicadas em cada item da Tarefa 12.
- **Tipos e nomes:** `AvisosSession`, `avisosSession`, `AVISOS_RECORD_KEY`, `decideAvisosCard`, `isOfferStatus`, `ConviteCard`, `BELL_PATH`, `fakePushService` aparecem com a mesma grafia em todas as tarefas que os usam.
- **Grupos:** nenhum arquivo aparece em dois grupos paralelos. `installPolicy.ts` só na Tarefa 1; `InstallCard.tsx` só na Tarefa 7; `usePushAvisos.ts` só na Tarefa 8; `HomePage.tsx` só na Tarefa 10.
- **Review Focus:** cada linha tem teste nas tarefas indicadas.
