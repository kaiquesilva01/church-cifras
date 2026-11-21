# Convite "Cifras como app" (#109) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Mostrar um cartão flutuante no topo da aba Músicas, só para quem está logado, que convida a adicionar o Cifras à tela inicial: botão "Adicionar" no Android/Chromium (abre o diálogo nativo), instrução sem botão no iPhone/iPad com Safari, nada nos outros navegadores, nunca no app instalado, e "Agora não" dispensa por 30 dias.

**Architecture:** Toda a entrega fica em `apps/web/src/pwa/` (lógica, captura e componente), com estilo em `apps/web/src/ui/redesign-install.css` e um ponto de montagem em `search/HomePage.tsx`. Três camadas separadas: (1) `installPolicy.ts`, funções puras (plataforma, standalone, dispensa, registro no storage); (2) `installPromptStore.ts`, que captura `beforeinstallprompt` e `appinstalled` na carga da página, fora do React; (3) `useInstallPrompt.ts` e `InstallCard.tsx`, que ligam as duas camadas à tela. O componente recebe o hook por injeção, igual ao `UpdatePrompt` (`useRegister`). Sem Rules, Functions, índices ou variáveis.

**Tech Stack:** React + TypeScript `strict` em `apps/web`; Vitest 5.1.0 com jsdom; `@testing-library/react` 16.3.3 (`renderHook` disponível); Playwright 1.65.1 (projetos `mobile` = Pixel 7 e `desktop`), contra o build com emuladores.

**Spec:** Sem spec próprio. Os critérios de aceite são os 7 itens do corpo da issue #109 (Análise Agêntica). Desenho: Paper, artboards `28 · Músicas · convite para instalar`, `29 · Convite para instalar (iPhone)`, `L7` e `L8` (claro).

## Global Constraints

- Só tokens de cor de `styles.css` (`--color-surface`, `--color-border-strong`, `--color-text`, `--color-muted`, `--color-elevated`, `--color-accent`, `--color-on-accent`) e a sombra `var(--shadow-pop)`, que já existe nos dois temas. Nenhum `#hex` nem `rgb(...)` novo.
- Texto de UI em pt-BR; identificadores em inglês; TypeScript `strict` com `import type`/`type` explícito nas importações de tipo.
- Teste antes do código em toda tarefa. Testes pelo `npx vitest run <arquivo>` dentro de `apps/web`.
- Alvos de toque ≥ 44 px (botão "Adicionar" com alvo de 44 px e pílula visual de 36 px; "×" com alvo de 44 px e disco visual de 28 px). `aria-label` no "×".
- Acesso ao `localStorage` e às gravações sempre em `try/catch`. Sem storage, o cartão aparece e funciona na sessão.
- Não tocar: `apps/web/src/viewer/`, `apps/web/src/setlists/`, `apps/web/src/pad/`, `.claude/`, `.github/workflows/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`, `firestore.rules`, `storage.rules`, `apps/functions/`, `packages/`.
- Conventional Commits em inglês. Formatar só código: `npx prettier --write <arquivos .ts/.tsx/.css>` (o `.prettierignore` exclui `*.md`).
- Sem teste no celular obrigatório: a entrega não altera viewer, setlists nem pad (AGENTS.md § Teste no celular).

## Decisões do tech-lead (pré-voo)

1. **Captura cedo (D1).** `installPromptStore` é importado por efeito colateral em `main.tsx`, antes do `bootstrap` (chunk carregado depois). Motivo: o Chromium dispara `beforeinstallprompt` uma vez por carga, e pode disparar antes do React montar ou antes da HomePage existir. Um hook que só se inscrevesse na Músicas perderia o evento.
2. **Evento de uso único (D2).** `consume()` tira o evento da fila antes de abrir o diálogo, porque `prompt()` só funciona uma vez por evento. Diálogo aceito: o cartão sai. Diálogo recusado (`dismissed`): vale como "Agora não", 30 dias. `prompt()` que falha: o cartão sai (o evento já foi consumido), sem gravar nada.
3. **Registro único e versionado (D3).** Uma chave `cifras.installCard.v1` com JSON `{ "dismissedAt": <ms> | null }`. Valor inválido é tratado como "nunca dispensado".
4. **"Instalado" não é persistido (D4).** `appinstalled` vale só na sessão (snapshot do store). Motivo: se a pessoa desinstala, o convite precisa voltar. O Chromium não dispara o evento de novo para um app já instalado, então não precisa de gravação.
5. **Standalone (D5).** Considera `display-mode` `standalone`, `fullscreen` e `minimal-ui` (além do pedido, que cita só `standalone`) e `navigator.standalone === true` (iOS). Os três modos extras cobrem janelas de PWA que não são aba do navegador.
6. **iOS = Safari (D6).** Safari no iPhone/iPod e no iPadOS (que se anuncia como Mac com toque: `Macintosh` + `maxTouchPoints > 1`). Chrome (`CriOS`), Firefox (`FxiOS`), Edge (`EdgiOS`), Opera (`OPiOS`) e in-apps (`GSA/`, `DuckDuckGo`) ficam sem cartão.
7. **Chromium desktop com evento (D7).** Mesma regra do Android: se o evento existir, mostra o cartão com "Adicionar". Confirmar (ver Dúvida 3).
8. **Posição (D8).** `position: fixed` no viewport: `top: calc(12px + env(safe-area-inset-top))`, `left/right: 20px`, `max-width: 350px`, centralizado, `z-index: 20`. Fica acima da busca fixa (`z-index: 10`) e abaixo do aviso de atualização (100) e dos diálogos (30).
9. **Logo (D9).** `<img src="/icons/icon.svg" alt="" width="48" height="48">`, decorativa (o nome do app está no título ao lado). Reaproveita o arquivo, sem copiar o SVG.
10. **Sombra (D10).** `box-shadow: var(--shadow-pop)`, token que já existe para elementos flutuantes. Assim não entra nenhum `rgb()` literal.
11. **CSS em arquivo novo (D11).** `redesign-install.css`, importado depois de `redesign-stats.css`, incluído na lista de `themeTokens.test.ts`. Sem isso, o teste de cores fixas não lê o arquivo.
12. **Injeção (D12).** `InstallCard({ useInstall = useInstallPrompt })`, mesmo padrão de `UpdatePrompt({ useRegister })`, para testar o componente sem store nem storage.
13. **Compatibilidade do jsdom.** `window.matchMedia` não existe no jsdom: `readInstallEnvironment` checa `typeof matchMedia === 'function'`. Sem isso, os testes da HomePage quebram.

## Dúvidas e lacunas (para o orquestrador e a pessoa)

1. **Cobertura do topo (principal).** Em 390 px, o cartão ocupa x = 20 a 370. O botão sol/lua do cabeçalho fica nessa faixa, e o título "Músicas" também. Enquanto o cartão estiver visível, ele cobre esses controles e a primeira linha da lista. O design system (§5) só proíbe isso na faixa de teste, mas o princípio vale. Opções: (A) como está, conforme o pedido da issue ("sobreposto no topo"); (B) reservar a faixa no topo da Músicas enquanto o cartão aparece (empurra o conteúdo, com um pequeno deslocamento no primeiro paint). **Recomendação:** (B), com decisão do `designer` antes de desenhar as artboards 28, 29, L7 e L8. O plano implementa (A).
2. **Sobreposição com o aviso de atualização.** `.update-prompt` fica no topo, centralizado, com `z-index: 100`. Se os dois aparecerem juntos, ficam um sobre o outro. O plano não coordena os dois (o aviso de atualização fica por cima). Confirmar.
3. **Chromium desktop** (D7). Chrome e Edge no computador também disparam `beforeinstallprompt`. O plano mostra o cartão lá também. Se não for desejado, limitar a `(pointer: coarse)` (uma linha no `decideInstallCard`).
4. **Chrome e Firefox no iPhone** (D6). Não recebem o cartão. O Chrome no iOS também tem "Adicionar à Tela de Início", mas com outro caminho no menu. Confirmar.
5. **iPhone já instalado.** iOS não dispara `appinstalled`, e uma aba do Safari não é standalone. Quem instalou no iPhone e abre o site no Safari vê a instrução até dispensar (30 dias). Registrar como limite em `docs/sistema.md` (Tarefa 4).
6. **E2E e `qa`.** O AGENTS.md atribui o E2E ao `qa` (etapa 5). Este plano põe o spec na Tarefa 8 para o `frontend-dev`, com o padrão dos E2E atuais, e o `qa` revisa na etapa 5. Confirmar.
7. **Paper.** As artboards 28, 29, L7 e L8 são do `designer` (MCP `paper`), fora deste plano de código. Se o MCP estiver indisponível, o PR leva "Paper pendente: 28, 29, L7, L8".
8. **Lacuna do design system.** A §4a de `docs/design-system.md` não lista `redesign-stats.css`, que já é importado em `main.tsx`. A Tarefa 4 corrige isso junto.
9. **Pré-requisito de instalabilidade.** O evento só é disparado pelo Chromium se o manifesto e o service worker estiverem em ordem. Já estão (`createPwaOptions`, `registerType: 'prompt'`, ícones 192 e 512 em PNG). Nada a mudar.

## Interfaces (contratos entre as tarefas)

```ts
// apps/web/src/pwa/installPolicy.ts
export const INSTALL_RECORD_KEY = 'cifras.installCard.v1';
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
export type InstallCardMode = 'hidden' | 'prompt' | 'ios';
export interface InstallRecord { dismissedAt: number | null }
export interface InstallEnvironment {
  userAgent: string; maxTouchPoints: number;
  displayModeStandalone: boolean; navigatorStandalone: boolean;
}
export interface InstallDecisionInput {
  iosSafari: boolean; standalone: boolean; installed: boolean;
  dismissedAt: number | null; now: number; hasPrompt: boolean;
}
export function readInstallEnvironment(win: Window): InstallEnvironment;
export function isIosSafari(env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>): boolean;
export function isStandalone(env: InstallEnvironment): boolean;
export function decideInstallCard(input: InstallDecisionInput): InstallCardMode;
export function localStorageOrUndefined(win: Window): Storage | undefined;
export function readInstallRecord(storage: Pick<Storage, 'getItem'> | undefined): InstallRecord;
export function writeInstallRecord(storage: Pick<Storage, 'setItem'> | undefined, record: InstallRecord): void;

// apps/web/src/pwa/installPromptStore.ts
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
export interface InstallPromptSnapshot { event: BeforeInstallPromptEvent | null; installed: boolean }
export interface InstallPromptStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): InstallPromptSnapshot;
  consume(): BeforeInstallPromptEvent | null;
}
export function createInstallPromptStore(target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>): InstallPromptStore;
export const installPromptStore: InstallPromptStore;

// apps/web/src/pwa/useInstallPrompt.ts
export interface InstallCardState { card: InstallCardMode; install(): Promise<void>; dismiss(): void }
export interface InstallHookDeps {
  store: InstallPromptStore; storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  environment: InstallEnvironment; now: () => number;
}
export function useInstallPrompt(deps?: Partial<InstallHookDeps>): InstallCardState;

// apps/web/src/pwa/InstallCard.tsx
export type UseInstallCard = () => InstallCardState;
export function InstallCard(props: { useInstall?: UseInstallCard }): JSX.Element | null;
```

## Grupos de execução

- **Grupo A (paralelo, arquivos disjuntos):** Tarefa 1 (`pwa/installPolicy.ts`, `test/installFixtures.ts`), Tarefa 2 (`pwa/installPromptStore.ts`), Tarefa 3 (`ui/redesign-install.css`, `ui/themeTokens.test.ts`), Tarefa 4 (`docs/design-system.md`, `docs/sistema.md`).
- **Grupo B (depois de 1 e 2):** Tarefa 5 (`pwa/useInstallPrompt.ts`).
- **Grupo C (depois de 3 e 5):** Tarefa 6 (`pwa/InstallCard.tsx`).
- **Grupo D (depois de 6):** Tarefa 7 (`search/HomePage.tsx`, `search/HomePage.test.tsx`, `main.tsx`). Só esta tarefa toca `main.tsx`.
- **Grupo E (depois de 7):** Tarefa 8 (`e2e/install.spec.ts`).
- **Tarefa 9** (verificação) roda depois de tudo.

---

### Task 1: Regras puras do convite (`installPolicy.ts`)

**Files:**
- Create: `apps/web/src/test/installFixtures.ts`
- Create: `apps/web/src/pwa/installPolicy.test.ts`
- Create: `apps/web/src/pwa/installPolicy.ts`

**Interfaces:**
- Consumes: nada.
- Produces: tudo da seção "Interfaces" de `installPolicy.ts`, e as fixtures (`NOW`, `DAY`, UAs, `fakeInstallEvent`, `memoryStorage`) usadas pelas Tarefas 5 e 7.

- [ ] **Step 1: Fixtures compartilhadas**

Crie `apps/web/src/test/installFixtures.ts`:

```ts
import { vi } from 'vitest';
import type { BeforeInstallPromptEvent } from '../pwa/installPromptStore';

export const DAY = 24 * 60 * 60 * 1000;
/** 21/11/2026 às 12:00 UTC. */
export const NOW = Date.UTC(2026, 10, 21, 12);

export const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
export const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
export const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
export const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Evento `beforeinstallprompt` sintético. `rejected` = `prompt()` falha (sem gesto do usuário). */
export function fakeInstallEvent(
  outcome: 'accepted' | 'dismissed' | 'rejected' = 'accepted',
): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt =
    outcome === 'rejected'
      ? vi.fn(() => Promise.reject(new Error('sem gesto do usuário')))
      : vi.fn(() => Promise.resolve());
  const choice = outcome === 'rejected' ? 'dismissed' : outcome;
  return Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: choice, platform: 'web' }),
  }) as BeforeInstallPromptEvent;
}

/** Storage em memória, com o mesmo formato de `Storage` que o código usa. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}
```

- [ ] **Step 2: Teste que falha**

Crie `apps/web/src/pwa/installPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DISMISS_MS,
  INSTALL_RECORD_KEY,
  decideInstallCard,
  isIosSafari,
  isStandalone,
  localStorageOrUndefined,
  readInstallEnvironment,
  readInstallRecord,
  writeInstallRecord,
} from './installPolicy';
import {
  DAY,
  IPAD_SAFARI,
  IPHONE_CHROME,
  IPHONE_SAFARI,
  ANDROID_CHROME,
  NOW,
  memoryStorage,
} from '../test/installFixtures';

const base = {
  iosSafari: false,
  standalone: false,
  installed: false,
  dismissedAt: null,
  now: NOW,
  hasPrompt: false,
};

describe('decideInstallCard', () => {
  it('shows the native install button when the browser offered the event (Android/Chromium)', () => {
    expect(decideInstallCard({ ...base, hasPrompt: true })).toBe('prompt');
  });

  it('shows the iOS instructions on Safari, with no event involved', () => {
    expect(decideInstallCard({ ...base, iosSafari: true })).toBe('ios');
  });

  it('shows nothing where there is no event and it is not iOS Safari (ex.: Firefox Android)', () => {
    expect(decideInstallCard(base)).toBe('hidden');
  });

  it('never shows in the installed app or after appinstalled', () => {
    for (const extra of [{ standalone: true }, { installed: true }]) {
      expect(decideInstallCard({ ...base, ...extra, hasPrompt: true })).toBe('hidden');
      expect(decideInstallCard({ ...base, ...extra, iosSafari: true })).toBe('hidden');
    }
  });

  it('stays hidden for 30 days after a dismissal, then comes back', () => {
    const dismissed = { ...base, hasPrompt: true };
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 29 * DAY })).toBe('hidden');
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 30 * DAY })).toBe('prompt');
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 31 * DAY })).toBe('prompt');
  });

  it('ignores a dismissal dated in the future (clock moved back)', () => {
    expect(decideInstallCard({ ...base, hasPrompt: true, dismissedAt: NOW + DAY })).toBe('prompt');
  });

  it('uses 30 days for the dismissal window', () => {
    expect(DISMISS_MS).toBe(30 * DAY);
  });
});

describe('platform detection', () => {
  const env = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

  it('recognizes Safari on iPhone and on iPad (which reports itself as a Mac with touch)', () => {
    expect(isIosSafari(env(IPHONE_SAFARI, 5))).toBe(true);
    expect(isIosSafari(env(IPAD_SAFARI, 5))).toBe(true);
  });

  it('does not treat a desktop Mac as iOS', () => {
    expect(isIosSafari(env(IPAD_SAFARI, 0))).toBe(false);
  });

  it('leaves other iOS browsers out (Chrome, Firefox)', () => {
    expect(isIosSafari(env(IPHONE_CHROME, 5))).toBe(false);
    expect(isIosSafari(env(IPHONE_CHROME.replace('CriOS', 'FxiOS'), 5))).toBe(false);
  });

  it('does not treat Android Chrome as iOS', () => {
    expect(isIosSafari(env(ANDROID_CHROME, 5))).toBe(false);
  });
});

describe('readInstallEnvironment', () => {
  function fakeWindow(modes: string[], standalone?: boolean): Window {
    return {
      matchMedia: (query: string) => ({
        matches: modes.some((mode) => query === `(display-mode: ${mode})`),
      }),
      navigator: { userAgent: 'UA', maxTouchPoints: 0, standalone },
    } as unknown as Window;
  }

  it('reads the display mode and navigator.standalone', () => {
    expect(readInstallEnvironment(fakeWindow(['standalone']))).toMatchObject({
      displayModeStandalone: true,
      navigatorStandalone: false,
    });
    expect(readInstallEnvironment(fakeWindow([], true))).toMatchObject({
      navigatorStandalone: true,
    });
    expect(isStandalone(readInstallEnvironment(fakeWindow(['browser'])))).toBe(false);
  });

  it('counts fullscreen and minimal-ui as installed windows', () => {
    expect(isStandalone(readInstallEnvironment(fakeWindow(['fullscreen'])))).toBe(true);
    expect(isStandalone(readInstallEnvironment(fakeWindow(['minimal-ui'])))).toBe(true);
  });

  it('works without matchMedia (jsdom and old browsers)', () => {
    const win = { navigator: { userAgent: 'UA', maxTouchPoints: 0 } } as unknown as Window;
    expect(readInstallEnvironment(win).displayModeStandalone).toBe(false);
  });
});

describe('install record storage', () => {
  it('reads "never dismissed" when storage is missing, blocked, or holds junk', () => {
    expect(readInstallRecord(undefined)).toEqual({ dismissedAt: null });
    expect(
      readInstallRecord({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual({ dismissedAt: null });
    expect(readInstallRecord({ getItem: () => '{não é json' })).toEqual({ dismissedAt: null });
    expect(
      readInstallRecord({ getItem: () => JSON.stringify({ dismissedAt: 'ontem' }) }),
    ).toEqual({ dismissedAt: null });
  });

  it('round-trips the dismissal under the versioned key', () => {
    const storage = memoryStorage();
    writeInstallRecord(storage, { dismissedAt: NOW });
    expect(storage.map.get(INSTALL_RECORD_KEY)).toBe(JSON.stringify({ dismissedAt: NOW }));
    expect(readInstallRecord(storage)).toEqual({ dismissedAt: NOW });
  });

  it('keeps the key versioned', () => {
    expect(INSTALL_RECORD_KEY).toBe('cifras.installCard.v1');
  });

  it('a write that throws, or missing storage, never breaks the app', () => {
    expect(() =>
      writeInstallRecord(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        { dismissedAt: NOW },
      ),
    ).not.toThrow();
    expect(() => writeInstallRecord(undefined, { dismissedAt: NOW })).not.toThrow();
  });

  it('hides a localStorage that throws on access (privacy modes)', () => {
    const win = {} as Window;
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(localStorageOrUndefined(win)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/pwa/installPolicy.test.ts`
Expected: FAIL com "Cannot find module './installPolicy'".

- [ ] **Step 4: Implementação**

Crie `apps/web/src/pwa/installPolicy.ts`:

```ts
/** Chave versionada do convite no localStorage. Mudar o formato pede nova versão da chave. */
export const INSTALL_RECORD_KEY = 'cifras.installCard.v1';
/** "Agora não" vale por 30 dias. */
export const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

export type InstallCardMode = 'hidden' | 'prompt' | 'ios';

export interface InstallRecord {
  dismissedAt: number | null;
}

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
    navigatorStandalone: (win.navigator as Navigator & { standalone?: boolean }).standalone === true,
  };
}

/** Safari de iPhone, iPod e iPad (o iPadOS se anuncia como Mac com toque). Outros navegadores do iOS ficam de fora. */
export function isIosSafari(env: Pick<InstallEnvironment, 'userAgent' | 'maxTouchPoints'>): boolean {
  const ua = env.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !OTHER_IOS_BROWSERS.test(ua);
}

export function isStandalone(env: InstallEnvironment): boolean {
  return env.displayModeStandalone || env.navigatorStandalone;
}

export function decideInstallCard(input: InstallDecisionInput): InstallCardMode {
  if (input.standalone || input.installed) return 'hidden';
  if (input.dismissedAt !== null) {
    const age = input.now - input.dismissedAt;
    if (age >= 0 && age < DISMISS_MS) return 'hidden';
  }
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
  try {
    const raw = storage?.getItem(INSTALL_RECORD_KEY);
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

export function writeInstallRecord(
  storage: Pick<Storage, 'setItem'> | undefined,
  record: InstallRecord,
): void {
  try {
    storage?.setItem(INSTALL_RECORD_KEY, JSON.stringify(record));
  } catch {
    // Armazenamento bloqueado ou cheio: o "Agora não" vale só nesta sessão.
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/pwa/installPolicy.test.ts`
Expected: PASS (todos os casos).

- [ ] **Step 6: Commit sugerido**

`feat(pwa): decide when the install card shows`

---

### Task 2: Captura de `beforeinstallprompt` na carga (`installPromptStore.ts`)

**Files:**
- Create: `apps/web/src/pwa/installPromptStore.test.ts`
- Create: `apps/web/src/pwa/installPromptStore.ts`

**Interfaces:**
- Consumes: nada (tipos próprios).
- Produces: `createInstallPromptStore`, `installPromptStore` (singleton), `BeforeInstallPromptEvent`, `InstallPromptSnapshot`, `InstallPromptStore`. Usados pela Tarefa 5 e importados por efeito colateral em `main.tsx` (Tarefa 7).

- [ ] **Step 1: Teste que falha**

Crie `apps/web/src/pwa/installPromptStore.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createInstallPromptStore } from './installPromptStore';

function newTarget() {
  return new EventTarget();
}

describe('createInstallPromptStore', () => {
  it('keeps beforeinstallprompt and cancels the browser mini-infobar', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(store.getSnapshot().event).toBe(event);
  });

  it('notifies subscribers, and keeps the same snapshot until something changes', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(first);

    unsubscribe();
    target.dispatchEvent(new Event('appinstalled'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('consume hands the event out once', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(store.consume()).not.toBeNull();
    expect(store.consume()).toBeNull();
    expect(store.getSnapshot().event).toBeNull();
  });

  it('appinstalled marks the app as installed and drops any pending event', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    target.dispatchEvent(new Event('appinstalled'));
    expect(store.getSnapshot()).toMatchObject({ event: null, installed: true });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/pwa/installPromptStore.test.ts`
Expected: FAIL com "Cannot find module './installPromptStore'".

- [ ] **Step 3: Implementação**

Crie `apps/web/src/pwa/installPromptStore.ts`:

```ts
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallPromptSnapshot {
  event: BeforeInstallPromptEvent | null;
  installed: boolean;
}

export interface InstallPromptStore {
  subscribe(listener: () => void): () => void;
  /** Mesmo objeto até a próxima mudança (exigido por useSyncExternalStore). */
  getSnapshot(): InstallPromptSnapshot;
  /** Devolve o evento e o tira da fila: `prompt()` só funciona uma vez por evento. */
  consume(): BeforeInstallPromptEvent | null;
}

/**
 * Guarda `beforeinstallprompt` assim que a página carrega. O Chromium dispara o evento uma vez por
 * carga, possivelmente antes do React montar ou antes de a aba Músicas existir.
 */
export function createInstallPromptStore(
  target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
): InstallPromptStore {
  let snapshot: InstallPromptSnapshot = { event: null, installed: false };
  const listeners = new Set<() => void>();
  const update = (next: Partial<InstallPromptSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  };

  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    update({ event: event as BeforeInstallPromptEvent });
  });
  target.addEventListener('appinstalled', () => update({ event: null, installed: true }));

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    consume() {
      const { event } = snapshot;
      if (event) update({ event: null });
      return event;
    },
  };
}

/** Store do app. Criado quando o módulo carrega; `main.tsx` o importa antes de qualquer tela. */
export const installPromptStore = createInstallPromptStore(window);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/pwa/installPromptStore.test.ts`
Expected: PASS (4 casos).

- [ ] **Step 5: Commit sugerido**

`feat(pwa): capture beforeinstallprompt at page load`

---

### Task 3: Estilo do cartão com tokens (`redesign-install.css`)

**Files:**
- Modify: `apps/web/src/ui/themeTokens.test.ts` (incluir o arquivo novo na lista e testar o estilo)
- Create: `apps/web/src/ui/redesign-install.css`

**Interfaces:**
- Consumes: nomes das classes de `InstallCard` (Tarefa 6): `.install-card`, `.install-card__logo`, `.install-card__text`, `.install-card__title`, `.install-card__hint`, `.install-card__add` (com `span` filho), `.install-card__close` (com `span` filho).
- Produces: estilo carregado por `main.tsx` (Tarefa 7).

- [ ] **Step 1: Testes que falham**

Em `apps/web/src/ui/themeTokens.test.ts`, acrescente a leitura do arquivo novo na concatenação de `redesignCss` (depois de `redesign-stats.css`):

Old:
```ts
  readFileSync(resolve(import.meta.dirname, 'redesign-stats.css'), 'utf8');
```
New:
```ts
  readFileSync(resolve(import.meta.dirname, 'redesign-stats.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-install.css'), 'utf8');
```

E, dentro de `describe('theme tokens', () => { ... })`, antes do fechamento do `describe`, acrescente:

```ts
  it('styles the install card with the shared shadow token and 44 px tap targets', () => {
    const install = readFileSync(resolve(import.meta.dirname, 'redesign-install.css'), 'utf8');
    expect(install).toMatch(/\.install-card \{[^}]*box-shadow: var\(--shadow-pop\);/);
    expect(install).toMatch(/\.install-card__close \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(install).toMatch(/\.install-card__add \{[^}]*min-height: 44px;/);
    expect(install).toMatch(/\.install-card__add span \{[^}]*height: 36px;/);
    expect(install).toMatch(/\.install-card__close span \{[^}]*width: 28px;[^}]*height: 28px;/);
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/ui/themeTokens.test.ts`
Expected: FAIL com "ENOENT ... redesign-install.css".

- [ ] **Step 3: Implementação**

Crie `apps/web/src/ui/redesign-install.css`:

```css
/* Convite "Cifras como app" (#109), na aba Músicas. Só tokens; tudo escopado em .install-card. */
.install-card {
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

.install-card__logo {
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 48px;
  height: 48px;
}

.install-card__text {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
}

.install-card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-text);
}

.install-card__hint {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--color-muted);
}

.install-card__close {
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

.install-card__close span {
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

.install-card__add {
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

.install-card__add span {
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

.install-card button:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/ui/themeTokens.test.ts`
Expected: PASS (inclusive o teste de cores fixas, que agora lê o arquivo novo).

- [ ] **Step 5: Commit sugerido**

`feat(ui): style the install card with tokens`

---

### Task 4: Docs de design e do sistema (sem teste novo; guardado pelo harness)

**Files:**
- Modify: `docs/design-system.md` (§4a, §5 e §8)
- Modify: `docs/sistema.md` (Telas, PWA e desempenho, Limites aceitos)

**Interfaces:**
- Consumes: nomes de `InstallCard`, `useInstallPrompt`, o CSS e a chave de storage (Tarefas 1, 3, 5 e 6).
- Produces: documentação alinhada com o código, guardada por `npm run test:harness` (`design-harness.test.mjs`, `sistema.test.mjs`).

- [ ] **Step 1: Linha de base do harness**

Run: `npm run test:harness`
Expected: PASS (estado atual).

- [ ] **Step 2: `docs/design-system.md`, §4a**

Na frase que lista os arquivos `redesign*.css` (hoje termina em "`redesign-states.css` (alertas, avisos, aviso de atualização)"), acrescente, na ordem de importação em `main.tsx`: "`redesign-stats.css` (estatísticas), `redesign-install.css` (convite de instalação)". Isso também corrige a omissão de `redesign-stats.css`.

- [ ] **Step 3: `docs/design-system.md`, §5**

Logo depois da linha **Aviso de atualização** da tabela, acrescente esta linha:

```md
| **Convite de instalação** | cartão fixo no topo da aba Músicas, só logado, abaixo da barra de status. Logo `icons/icon.svg` 48 px, título "Cifras como app" (15 px, 800), apoio "Abra direto da tela inicial" (13 px, muted). Android/Chromium: botão âmbar "Adicionar" (pílula 36 px, alvo 44 px) abre o diálogo de instalação. iPhone/iPad com Safari: sem botão; apoio "Toque em Compartilhar e depois em Adicionar à Tela de Início". "×" (aria-label "Agora não"; disco 28 px, alvo 44 px) dispensa por 30 dias. Some no app instalado e outros navegadores sem o evento | `InstallCard`, `pwa/useInstallPrompt.ts`, `ui/redesign-install.css` |
```

- [ ] **Step 4: `docs/design-system.md`, §8 (mapa do Paper)**

Depois de `25 Estados e avisos` (linha 1), acrescente: `28 · Músicas · convite para instalar`, `29 · Convite para instalar (iPhone)`. Na linha do tema claro, depois de `L6 Mais (admin)`, acrescente: `L7 · Músicas · convite para instalar (claro)`, `L8 · Convite para instalar (iPhone, claro)`. Se o designer ainda não criou as artboards no PR, escreva no PR "Paper pendente: 28, 29, L7, L8".

- [ ] **Step 5: `docs/sistema.md`, Telas**

Na linha da tabela `/` (Início), acrescente ao fim da célula "O que faz": `; convite "Cifras como app" na aba Músicas (ver PWA)`.

- [ ] **Step 6: `docs/sistema.md`, PWA e desempenho**

Logo depois da linha `- App instalável na tela inicial, com service worker do app shell e aviso "Atualizar" quando há versão nova.`, acrescente:

```md
- Convite "Cifras como app" na aba Músicas (só logado). Android/Chromium: o `beforeinstallprompt` é guardado já no carregamento; o botão "Adicionar" abre o diálogo de instalação, e recusar o diálogo conta como "Agora não". iPhone e iPad com Safari: sem botão, com a instrução de Compartilhar. Não aparece no app instalado (`display-mode` standalone, fullscreen ou minimal-ui, ou `navigator.standalone`) nem depois de `appinstalled` na sessão. "Agora não" dispensa por 30 dias, guardado no aparelho em `localStorage` (chave `cifras.installCard.v1`); sem armazenamento, o convite volta a cada carga.
```

- [ ] **Step 7: `docs/sistema.md`, Limites aceitos**

Na seção "Limites aceitos", acrescente estas linhas:

```md
- Convite de instalação: Firefox Android e outros navegadores sem `beforeinstallprompt` não recebem o convite (não há API que instale com confiança). No iPhone e no iPad, só o Safari recebe a instrução: Chrome e Firefox do iOS ficam sem convite. No iOS não existe evento de instalação: quem instalou no iPhone e abre o site no Safari vê a instrução até dispensar.
```

- [ ] **Step 8: Harness**

Run: `npm run test:harness`
Expected: PASS (inclusive o limite de 350 linhas em `docs/sistema.md`, hoje em 264).

- [ ] **Step 9: Commit sugerido**

`docs: document the install card in the design system and system map`

---

### Task 5: Hook `useInstallPrompt`

**Files:**
- Create: `apps/web/src/pwa/useInstallPrompt.test.tsx`
- Create: `apps/web/src/pwa/useInstallPrompt.ts`

**Interfaces:**
- Consumes: Tarefa 1 (`installPolicy.ts`, `installFixtures.ts`), Tarefa 2 (`installPromptStore.ts`).
- Produces: `useInstallPrompt`, `InstallCardState`, `InstallHookDeps`, usados pela Tarefa 6.

- [ ] **Step 1: Testes que falham**

Crie `apps/web/src/pwa/useInstallPrompt.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InstallEnvironment } from './installPolicy';
import { INSTALL_RECORD_KEY } from './installPolicy';
import { createInstallPromptStore } from './installPromptStore';
import { useInstallPrompt } from './useInstallPrompt';
import { ANDROID_CHROME, DAY, IPHONE_SAFARI, NOW, fakeInstallEvent, memoryStorage } from '../test/installFixtures';

const ANDROID: InstallEnvironment = {
  userAgent: ANDROID_CHROME,
  maxTouchPoints: 5,
  displayModeStandalone: false,
  navigatorStandalone: false,
};
const IPHONE: InstallEnvironment = { ...ANDROID, userAgent: IPHONE_SAFARI };
const STANDALONE: InstallEnvironment = { ...IPHONE, displayModeStandalone: true };

function setup(options: {
  environment?: InstallEnvironment;
  storage?: ReturnType<typeof memoryStorage> | undefined;
  now?: number;
}) {
  const target = new EventTarget();
  const store = createInstallPromptStore(target);
  const storage = 'storage' in options ? options.storage : memoryStorage();
  const view = renderHook(() =>
    useInstallPrompt({
      store,
      storage,
      environment: options.environment ?? ANDROID,
      now: () => options.now ?? NOW,
    }),
  );
  return { target, storage, ...view };
}

describe('useInstallPrompt', () => {
  it('stays hidden until the event arrives, then shows the native install prompt', () => {
    const { result, target } = setup({});
    expect(result.current.card).toBe('hidden');
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('prompt');
  });

  it('install() opens the native dialog once and hides the card when accepted', async () => {
    const { result, target, storage } = setup({});
    const event = fakeInstallEvent('accepted');
    act(() => void target.dispatchEvent(event));
    await act(async () => {
      await result.current.install();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBeUndefined();
  });

  it('a refused native dialog counts as "Agora não": hidden for 30 days', async () => {
    const { result, target, storage } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent('dismissed')));
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBe(JSON.stringify({ dismissedAt: NOW }));
  });

  it('a failing prompt() hides the card without writing anything', async () => {
    const { result, target, storage } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent('rejected')));
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBeUndefined();
  });

  it('install() without an event does nothing', async () => {
    const { result } = setup({});
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
  });

  it('shows the iOS instructions on Safari without any event', () => {
    const { result } = setup({ environment: IPHONE });
    expect(result.current.card).toBe('ios');
  });

  it('"Agora não" hides the card, and the dismissal survives a remount', () => {
    const { result, storage, unmount } = setup({ environment: IPHONE });
    act(() => result.current.dismiss());
    expect(result.current.card).toBe('hidden');
    unmount();

    const again = renderHook(() =>
      useInstallPrompt({
        store: createInstallPromptStore(new EventTarget()),
        storage,
        environment: IPHONE,
        now: () => NOW + 29 * DAY,
      }),
    );
    expect(again.result.current.card).toBe('hidden');
    again.unmount();

    const later = renderHook(() =>
      useInstallPrompt({
        store: createInstallPromptStore(new EventTarget()),
        storage,
        environment: IPHONE,
        now: () => NOW + 31 * DAY,
      }),
    );
    expect(later.result.current.card).toBe('ios');
  });

  it('never shows in the installed app, even with the event or on iOS', () => {
    const { result, target } = setup({ environment: STANDALONE });
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('hidden');
  });

  it('appinstalled hides the card for the rest of the session', () => {
    const { result, target } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('prompt');
    act(() => void target.dispatchEvent(new Event('appinstalled')));
    expect(result.current.card).toBe('hidden');
  });

  it('without storage the card still shows, and "Agora não" hides it for the session', () => {
    const { result } = setup({ environment: IPHONE, storage: undefined });
    expect(result.current.card).toBe('ios');
    expect(() => act(() => result.current.dismiss())).not.toThrow();
    expect(result.current.card).toBe('hidden');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/pwa/useInstallPrompt.test.tsx`
Expected: FAIL com "Cannot find module './useInstallPrompt'".

- [ ] **Step 3: Implementação**

Crie `apps/web/src/pwa/useInstallPrompt.ts`:

```ts
import { useState, useSyncExternalStore } from 'react';
import {
  decideInstallCard,
  isIosSafari,
  isStandalone,
  localStorageOrUndefined,
  readInstallEnvironment,
  readInstallRecord,
  writeInstallRecord,
  type InstallCardMode,
  type InstallEnvironment,
  type InstallRecord,
} from './installPolicy';
import { installPromptStore, type InstallPromptStore } from './installPromptStore';

export interface InstallCardState {
  card: InstallCardMode;
  /** Abre o diálogo nativo. Usa o evento uma vez; sem evento, não faz nada. */
  install(): Promise<void>;
  /** "Agora não": dispensa por 30 dias. */
  dismiss(): void;
}

export interface InstallHookDeps {
  store: InstallPromptStore;
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  environment: InstallEnvironment;
  now: () => number;
}

export function useInstallPrompt(deps?: Partial<InstallHookDeps>): InstallCardState {
  const store = deps?.store ?? installPromptStore;
  const storage = deps && 'storage' in deps ? deps.storage : localStorageOrUndefined(window);
  const [environment] = useState(() => deps?.environment ?? readInstallEnvironment(window));
  const now = deps?.now ?? Date.now;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [record, setRecord] = useState<InstallRecord>(() => readInstallRecord(storage));

  const dismiss = () => {
    const next: InstallRecord = { dismissedAt: now() };
    writeInstallRecord(storage, next);
    setRecord(next);
  };

  const install = async () => {
    // O evento serve uma vez: consume() o tira da fila antes de abrir o diálogo.
    const event = store.consume();
    if (!event) return;
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'dismissed') dismiss();
    } catch {
      // Diálogo bloqueado ou evento já usado: o cartão já saiu e nada é gravado.
    }
  };

  return {
    card: decideInstallCard({
      iosSafari: isIosSafari(environment),
      standalone: isStandalone(environment),
      installed: snapshot.installed,
      dismissedAt: record.dismissedAt,
      now: now(),
      hasPrompt: snapshot.event !== null,
    }),
    install,
    dismiss,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/pwa/useInstallPrompt.test.tsx`
Expected: PASS (10 casos).

- [ ] **Step 5: Commit sugerido**

`feat(pwa): add useInstallPrompt hook`

---

### Task 6: Componente `InstallCard`

**Files:**
- Create: `apps/web/src/pwa/InstallCard.test.tsx`
- Create: `apps/web/src/pwa/InstallCard.tsx`

**Interfaces:**
- Consumes: Tarefa 5 (`useInstallPrompt`, `InstallCardState`); classes da Tarefa 3.
- Produces: `InstallCard`, `UseInstallCard`, usados pela Tarefa 7.

- [ ] **Step 1: Testes que falham**

Crie `apps/web/src/pwa/InstallCard.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstallCard } from './InstallCard';
import type { InstallCardState } from './useInstallPrompt';

function fakeHook(card: InstallCardState['card']) {
  const install = vi.fn(() => Promise.resolve());
  const dismiss = vi.fn();
  return {
    install,
    dismiss,
    useInstall: (): InstallCardState => ({ card, install, dismiss }),
  };
}

describe('InstallCard', () => {
  it('offers the native install with "Adicionar" and dismisses with "Agora não"', () => {
    const hook = fakeHook('prompt');
    render(<InstallCard useInstall={hook.useInstall} />);
    expect(screen.getByRole('region', { name: 'Cifras como app' })).toBeInTheDocument();
    expect(screen.getByText('Abra direto da tela inicial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(hook.install).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(hook.dismiss).toHaveBeenCalledTimes(1);
  });

  it('on iPhone Safari shows the instructions and no install button', () => {
    const hook = fakeHook('ios');
    render(<InstallCard useInstall={hook.useInstall} />);
    expect(
      screen.getByText('Toque em Compartilhar e depois em Adicionar à Tela de Início'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('hidden').useInstall} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the app icon as a decorative image', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('prompt').useInstall} />);
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', '/icons/icon.svg');
    expect(logo).toHaveAttribute('alt', '');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/pwa/InstallCard.test.tsx`
Expected: FAIL com "Cannot find module './InstallCard'".

- [ ] **Step 3: Implementação**

Crie `apps/web/src/pwa/InstallCard.tsx`:

```tsx
import { useInstallPrompt, type InstallCardState } from './useInstallPrompt';

export type UseInstallCard = () => InstallCardState;

// Mesmo padrão de UpdatePrompt: o hook entra por parâmetro, então o componente testa sem storage nem evento.
export function InstallCard({ useInstall = useInstallPrompt }: { useInstall?: UseInstallCard }) {
  const { card, install, dismiss } = useInstall();
  if (card === 'hidden') return null;
  return (
    <section className="install-card" aria-labelledby="install-card-title">
      <img className="install-card__logo" src="/icons/icon.svg" alt="" width={48} height={48} />
      <div className="install-card__text">
        <p id="install-card-title" className="install-card__title">
          Cifras como app
        </p>
        <p className="install-card__hint">
          {card === 'prompt'
            ? 'Abra direto da tela inicial'
            : 'Toque em Compartilhar e depois em Adicionar à Tela de Início'}
        </p>
      </div>
      <button type="button" className="install-card__close" aria-label="Agora não" onClick={dismiss}>
        <span aria-hidden="true">×</span>
      </button>
      {card === 'prompt' && (
        <button type="button" className="install-card__add" onClick={() => void install()}>
          <span>Adicionar</span>
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/pwa/InstallCard.test.tsx`
Expected: PASS (4 casos).

- [ ] **Step 5: Commit sugerido**

`feat(pwa): add InstallCard component`

---

### Task 7: Montagem na aba Músicas e captura em `main.tsx`

**Files:**
- Modify: `apps/web/src/search/HomePage.test.tsx` (um bloco de testes novo)
- Modify: `apps/web/src/search/HomePage.tsx` (uma linha e um import)
- Modify: `apps/web/src/main.tsx` (imports de captura e de CSS)

**Interfaces:**
- Consumes: `InstallCard` (Tarefa 6), `installPromptStore` (Tarefa 2), `redesign-install.css` (Tarefa 3), fixtures (Tarefa 1).
- Produces: o cartão visível só na aba Músicas da Início, logado (a rota já exige login: `RequireAuth`).

- [ ] **Step 1: Testes que falham**

Em `apps/web/src/search/HomePage.test.tsx`, acrescente este bloco no fim do arquivo. Use o mesmo helper de render que os outros testes do arquivo (o que monta `MemoryRouter` com `initialEntries`, com `AuthContext` e os providers). Os dois caminhos são `/` e `/?aba=cantores`.

```tsx
describe('install card on the Músicas tab', () => {
  const originalUserAgent = navigator.userAgent;

  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_SAFARI, configurable: true });
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    localStorage.clear();
  });

  it('shows on Músicas (iPhone Safari case)', () => {
    renderHome('/');
    expect(screen.getByRole('region', { name: 'Cifras como app' })).toBeInTheDocument();
  });

  it('is not shown on the other tabs', () => {
    renderHome('/?aba=cantores');
    expect(screen.queryByRole('region', { name: 'Cifras como app' })).not.toBeInTheDocument();
  });
});
```

Adicione os imports que faltam no topo do arquivo:

```ts
import { IPHONE_SAFARI } from '../test/installFixtures';
```

(`beforeEach` e `afterEach` já vêm de `vitest` neste arquivo. `renderHome` é o nome que este plano dá ao helper de render existente: adapte ao nome real no arquivo.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd apps/web && npx vitest run src/search/HomePage.test.tsx`
Expected: FAIL no caso "shows on Músicas" (sem a região). Os outros casos do arquivo continuam passando.

- [ ] **Step 3: Implementação em `HomePage.tsx`**

Adicione o import junto dos outros imports de componentes:

```ts
import { InstallCard } from '../pwa/InstallCard';
```

No JSX, logo depois da abertura `<section>` e antes de `{notice && (`, acrescente:

```tsx
      {tab.id === 'musicas' && <InstallCard />}
```

- [ ] **Step 4: Implementação em `main.tsx`**

Acrescente o import de captura logo depois de `import { prefetchForPath } from './lib/prefetch';` (antes dos CSS), para o evento ser guardado antes de qualquer tela:

```ts
import './pwa/installPromptStore';
```

E acrescente o CSS depois de `redesign-stats.css`:

```ts
import './ui/redesign-install.css';
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd apps/web && npx vitest run src/search/HomePage.test.tsx src/ui/themeTokens.test.ts src/pwa`
Expected: PASS.

- [ ] **Step 6: Commit sugerido**

`feat(search): show the install card on the Músicas tab`

---

### Task 8: E2E no Playwright (`e2e/install.spec.ts`)

**Files:**
- Create: `e2e/install.spec.ts`

**Interfaces:**
- Consumes: fixtures de `e2e/fixtures/app.ts` (`ADMIN`, `signInAs`, `expect`, `test`); a página com o build atual.
- Produces: cobertura E2E dos critérios 1 a 7 que são viáveis no emulador.

O que **não** é viável no emulador, e fica para o roteiro de celular: o `beforeinstallprompt` real (o Chromium headless não dispara sem service worker instalável; o E2E usa o service worker bloqueado), o diálogo nativo de instalação, o `appinstalled` real, o Safari de verdade (aqui só a `userAgent`) e o Samsung Internet.

- [ ] **Step 1: Testes que falham**

Crie `e2e/install.spec.ts`:

```ts
import type { Page } from '@playwright/test';
import { ADMIN, expect, signInAs, test } from './fixtures/app';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CARD = { name: 'Cifras como app' };

type InstallWindow = Window & { __installPrompted?: number };

/**
 * Dispara um `beforeinstallprompt` sintético (o real não aparece no E2E). O `prompt` conta as chamadas
 * em `window.__installPrompted`.
 */
async function fireInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  await page.evaluate((choice) => {
    const w = window as InstallWindow;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        w.__installPrompted = (w.__installPrompted ?? 0) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: choice, platform: 'web' }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

test.describe('convite Cifras como app (Android/Chromium)', () => {
  test('o botão Adicionar abre o diálogo, e aceitar esconde o cartão', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    const card = page.getByRole('region', CARD);
    await expect(card).toHaveCount(0);

    await fireInstallPrompt(page, 'accepted');
    await expect(card).toBeVisible();
    await expect(card.getByText('Abra direto da tela inicial')).toBeVisible();

    await card.getByRole('button', { name: 'Adicionar' }).click();
    expect(await page.evaluate(() => (window as InstallWindow).__installPrompted)).toBe(1);
    await expect(card).toHaveCount(0);
  });

  test('"Agora não" dispensa por 30 dias, mesmo depois de recarregar', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    await fireInstallPrompt(page);
    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Agora não' }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    // O evento volta a cada carga; o convite continua escondido pela dispensa gravada.
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('o app instalado (display-mode standalone) nunca mostra o convite', async ({ page }) => {
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
    await signInAs(page, ADMIN, 'Admin');
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('fora da aba Músicas o convite não aparece', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    await page.goto('/?aba=cantores');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });
});

test.describe('convite Cifras como app (iPhone Safari)', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('mostra a instrução de Compartilhar, sem botão', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await expect(
      card.getByText('Toque em Compartilhar e depois em Adicionar à Tela de Início'),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Adicionar' })).toHaveCount(0);
  });
});
```

Observação para o `frontend-dev`: rode o E2E com a suíte inteira (`npm run test:e2e`, na raiz) ou com `npx playwright test install.spec.ts` no workspace `e2e`, após o build com os emuladores. Se o login pelo popup falhar com o `userAgent` do iPhone, registre no PR e volte a Dúvida 6 ao orquestrador; não troque o teste por um atalho sem login, porque o cartão exige sessão.

- [ ] **Step 2: Rodar e ver falhar (antes da Tarefa 7, o cartão não existe)**

Run (na raiz, com emuladores): `npm run test:e2e`
Expected, antes da Tarefa 7: FAIL nos casos que esperam o cartão visível. Depois da Tarefa 7: PASS.

- [ ] **Step 3: Ajustes, se necessário**

Se o `page.reload()` do caso de dispensa não restaurar a sessão a tempo, aguarde a navegação ("Principal") antes de disparar o evento, como o teste já faz. Não aumente timeouts globais.

- [ ] **Step 4: Commit sugerido**

`test(e2e): cover the install card on Android, iPhone and standalone`

---

### Task 9: Verificação e critérios de pronto (orquestrador ou `qa`)

Esta tarefa não escreve código. Roda depois de todas as anteriores, na worktree:

- [ ] `npm test` verde (inclui `themeTokens.test.ts`, `installPolicy`, `installPromptStore`, `useInstallPrompt`, `InstallCard`, `HomePage`).
- [ ] `npm run lint` verde.
- [ ] `npm run typecheck` verde (inclui `e2e`).
- [ ] `npm run build` verde.
- [ ] `npm run test:harness` verde (`design-harness.test.mjs`, `sistema.test.mjs`).
- [ ] `npm run test:e2e` verde (com emuladores; o CI também roda).
- [ ] `npm run test:rules` **não** é exigido: nenhuma Rule, Function, índice ou variável muda.
- [ ] Conferir visualmente em 360 px e 390 px, nos dois temas, com o `designer` (Dúvida 1 e Paper).
- [ ] `git grep -n "Cifras como app\|Adicionar\|Agora não" -- apps e2e` confere que os textos novos batem entre código, testes e docs. Não há texto antigo a trocar.
- [ ] PR: `Resolve #109`, corpo em pt-BR, "Teste no celular: não obrigatório (não altera viewer, setlists nem pad)", roteiro de celular na mensagem final (Android real: diálogo de instalação; iPhone com Safari real: instrução; app instalado: sem cartão), Paper (ou "Paper pendente: 28, 29, L7, L8").

## Review Focus

Entradas que a pessoa usaria, com o teste que as prova:

1. Android instala e o cartão some; depois, o app instalado abre pela tela inicial e não mostra o cartão. Teste: Tarefa 5 `install() opens the native dialog once and hides the card when accepted`; Tarefa 8 `o botão Adicionar abre o diálogo...` e `o app instalado...`.
2. "Agora não" continua valendo ao recarregar (30 dias). Teste: Tarefa 5 `"Agora não" hides the card, and the dismissal survives a remount`; Tarefa 8 `"Agora não" dispensa por 30 dias...`.
3. Evento que chega depois da tela montar (ou antes do React) não se perde. Teste: Tarefa 2 `keeps beforeinstallprompt...`; Tarefa 5 `stays hidden until the event arrives`.
4. Storage bloqueado ou cheio: o cartão aparece e o "×" funciona na sessão, sem erro. Teste: Tarefa 1 `hides a localStorage that throws...` e `a write that throws...`; Tarefa 5 `without storage the card still shows...`.
5. iPhone Safari sem botão; Chrome do iPhone e Firefox Android sem cartão. Teste: Tarefa 1 `leaves other iOS browsers out` e `shows nothing where there is no event...`; Tarefa 8 `mostra a instrução de Compartilhar...`.
6. Cartão só na aba Músicas. Teste: Tarefa 7 `is not shown on the other tabs`; Tarefa 8 `fora da aba Músicas...`.
7. Alvos de toque ≥ 44 px e tokens nos dois temas. Teste: Tarefa 3 (CSS) e `themeTokens.test.ts` (sem cor fixa). A conferência visual fica com o `designer` e o `code-reviewer`.
