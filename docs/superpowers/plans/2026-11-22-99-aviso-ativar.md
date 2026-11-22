# #99 Avisos: ativar na aba Mais — Plano de implementação

> Para execução: `subagent-driven-development` (ou `executing-plans`). Passos com checkbox. TDD em cada tarefa: teste primeiro, vê falhar, implementa, vê passar.

**Goal:** linha "Avisos" na aba Mais (só membro e admin) para ativar e desativar os avisos de push neste aparelho e mandar um aviso de teste, com o service worker de push separado do SW de cache.

**Architecture:** o cliente guarda o token FCM num registro local (`cifras.push.v1`) e fala com três callables já em produção (#98): `registerDevice`, `unregisterDevice`, `sendTestPush`. O SDK `firebase/messaging` é carregado sob demanda atrás de uma porta (`PushMessagingPort`), com uma implementação fake só para o build de emuladores/E2E. Um plugin do Vite gera `firebase-messaging-sw.js` na raiz do build, com a config embutida e os scripts compat da mesma versão do `firebase`. O SW do Workbox (`pwaConfig.ts`, `registerType: 'prompt'`) e os caches não mudam.

**Tech stack:** React 19, TypeScript strict, Vite 8 (rolldown), vitest 5 + jsdom, Playwright (emuladores), firebase 13.3.0 (web), Functions v2 (callables já existentes).

**Ambiente:** worktree `C:\Users\Kaique\orca\workspaces\church-cifras\99-aviso-ativar`, branch `feat/99-aviso-ativar`. Nada de `.github/`, `.claude/`, `firebase.json` ou `cors.json`. Rules não mudam (`pushDevices` segue deny-all; o cliente só usa callables).

---

## 0. Decisões (resumo)

| # | Tema | Decisão | Motivo |
|---|---|---|---|
| D1 | Gate da linha | Só com `VITE_FIREBASE_VAPID_KEY` **e** `VITE_FIREBASE_MESSAGING_SENDER_ID`. Sem qualquer uma, a linha some e não há log. | Critério 1 pede só a VAPID; exigir também o sender id evita linha morta (sem ele o `getToken` falha). |
| D2 | SDK no cliente | `firebase/messaging` por `import()` dinâmico, pré-carregado no mount (`isSupported`), para o toque chamar `getToken` sem `await` antes. | Safari/iOS só aceita `requestPermission` dentro do gesto. |
| D3 | Service worker de push | `firebase-messaging-sw.js` gerado no build (`apps/web/build/messagingSw.ts`), que faz `importScripts` dos scripts **compat** em `https://www.gstatic.com/firebasejs/13.3.0/` (versão lida e testada contra `apps/web/package.json`). Escopo padrão do SDK (`/firebase-cloud-messaging-push-scope`). | Config embutida; sem bundle novo no pipeline. Alternativa descartada: empacotar `firebase/messaging/sw` com um segundo build (mais peças). Risco: depende do gstatic (ver pré-voo P1). |
| D4 | Badge e ícone | **Dentro da #99**: o servidor passa `webpush.notification.icon` e `badge` (absolutos, pela origem do link). Assim não há `onBackgroundMessage` nem notificação duplicada. Requer mudar `apps/functions/src/push/adminDeps.ts` (pequena, coberta por teste). Fallback se o orquestrador não quiser tocar Functions: follow-up, e a #99 entrega só o asset. | O SDK já exibe `notification` sozinho; um segundo `showNotification` duplicaria. |
| D5 | Revalidação ao abrir | No `PushProvider`, uma vez por sessão de membro/admin: se a permissão está `granted` e há registro, `getToken` (sem pedido) e `registerDevice` só se o token mudou **ou** o registro tem mais de 7 dias (`REGISTER_MAX_AGE_MS`). Se o token mudou, `unregisterDevice` do antigo. | O SDK troca o token semanalmente; regravar a cada abertura seria escrita à toa. |
| D6 | Permissão revogada | No `load()`: permissão `denied` + registro → `unregisterDevice`, `deleteToken` local, limpa registro, estado "Bloqueados". | Critério 6. |
| D7 | Desativar | Um toque, sem confirmação: `unregisterDevice` (erro só registra aviso), `deleteToken`, limpa registro. Teto de 5 s para não travar offline. | Critério 5; a poda (#98) cobre o que sobrar no servidor. |
| D8 | Sair da conta | `createAuthGateway(services, { beforeSignOut })`: roda antes de `signOut` (a callable exige sessão), com teto de 5 s; falha ou demora não impede o logout. | Critério 7. |
| D9 | Fake para E2E | `fakeMessaging.ts` só é escolhido com `import.meta.env.VITE_USE_EMULATORS === 'true'`. Em produção (`'false'`) o ramo some no build. Controle via `window.__CIFRAS_PUSH_FAKE__` (definido por `addInitScript`). | `serviceWorkers: 'block'` nos fixtures; o CI não prova a entrega (chegada é [A]). |
| D10 | Token no aparelho | Registro local `cifras.push.v1` = `{ token, registeredAt }` (localStorage). Logs nunca mostram o token. | Precisamos do token para remover o aparelho quando a permissão some. |
| D11 | Precache | O chunk `messaging` entra num grupo nomeado do Vite e sai do precache (`globIgnores` `**/assets/messaging-*`). Não muda o SW nem os caches. | Não empurrar ~o SDK de mensagens para o app shell. |
| D12 | Estado "erro" | Texto muted = o mesmo de "Pode ativar" (a spec não define). Pílula "Tentar de novo". | Não inventar copy fora da spec; confirmar com o designer se quiser outro. |

---

## 1. Interfaces (contratos entre módulos)

Único arquivo com as interfaces: `apps/web/src/push/types.ts` (Tarefa 0). Os demais módulos importam daqui.

**Web ↔ Functions (já em produção, #98):**
- `registerDevice({ token: string, origin: 'producao' | 'teste' })` → `{ ok: true }`
- `unregisterDevice({ token: string })` → `{ ok: true }` (idempotente)
- `sendTestPush()` → `{ sent: number, failed: number, pruned: number }`

**Web ↔ build:** `firebase-messaging-sw.js` na raiz do `dist`, com a config Firebase (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `appId`, `messagingSenderId`). Variáveis lidas no build: `VITE_FIREBASE_*` (já existentes) e `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_VAPID_KEY` (novas, opcionais no cliente; já no GitHub, passagem no #116).

**Hook/contexto (UI ↔ serviço):** `PushContext` (valor `PushService | null`); `null` = sem VAPID, a linha não renderiza.

---

## 2. Mapa de arquivos e grupos paralelos

Nenhum arquivo aparece em dois grupos paralelos.

| Tarefa | Grupo | Executor | Arquivos |
|---|---|---|---|
| 0 Interfaces | G0 (sozinha) | frontend-dev | `apps/web/src/push/types.ts`, `apps/web/src/vite-env.d.ts` |
| 1 Config do cliente | G1 | frontend-dev | `apps/web/src/lib/env.ts`, `env.test.ts`, `apps/web/src/lib/firebase.ts`, `firebase.test.ts` |
| 2 SW de push e build | G1 | frontend-dev | `apps/web/build/messagingSw.ts`, `messagingSw.test.ts`, `apps/web/build/pwaConfig.ts`, `pwaConfig.test.ts`, `apps/web/vite.config.ts`, `apps/web/public/` (nada) |
| 3 Lógica pura | G1 | frontend-dev | `apps/web/src/push/pushState.ts`, `pushState.test.ts`, `apps/web/src/push/pushRecord.ts`, `pushRecord.test.ts` |
| 4 Porta SDK e API | G1 | frontend-dev | `apps/web/src/push/messaging.ts`, `messaging.test.ts`, `apps/web/src/push/fakeMessaging.ts`, `fakeMessaging.test.ts`, `apps/web/src/push/pushApi.ts`, `pushApi.test.ts` |
| 6 UI da linha | G1 | frontend-dev | `apps/web/src/push/usePushAvisos.ts`, `usePushAvisos.test.tsx`, `apps/web/src/push/AvisosRow.tsx`, `AvisosRow.test.tsx`, `apps/web/src/ui/redesign-push.css`, `redesign-push.test.ts`, `apps/web/src/main.tsx`, `apps/web/src/more/MaisPage.tsx`, `MaisPage.test.tsx` |
| 8 Servidor e ícones | G1 | backend-dev | `apps/functions/src/push/adminDeps.ts`, `adminDeps.test.ts`, `apps/web/scripts/generate-icons.mjs`, `apps/web/public/icons/badge-96.png` |
| 10 Docs | G1 | frontend-dev | `docs/design-system.md`, `docs/sistema.md` |
| 5 Serviço e provedor | G2 (depois da 3) | frontend-dev | `apps/web/src/push/pushService.ts`, `pushService.test.ts`, `apps/web/src/push/PushProvider.tsx`, `PushProvider.test.tsx` |
| 7 Ligação | G3 (depois de 1, 4, 5, 6) | frontend-dev | `apps/web/src/bootstrap.tsx`, `apps/web/src/App.tsx`, `apps/web/src/auth/gateway.ts`, `gateway.test.ts` |
| 9 E2E e env | G4 (depois da 7) | frontend-dev | `apps/web/.env.docker`, `apps/web/.env.example`, `e2e/avisos.spec.ts` |
| 11 Verificação | final | orquestrador | (só comandos) |

Ordem de execução: G0 → G1 em paralelo (inclui 3) → 5 → G3 (7) → 9 → 11.

---

## Pré-voo (executor, Haiku high, antes da Tarefa 0)

- [ ] **P1** `curl -sI https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js` e o mesmo para `firebase-app-compat.js`: esperado `HTTP/2 200` (ou `200`). Se não houver, parar e avisar o tech-lead: troca para bundle do `firebase/messaging/sw`.
- [ ] **P2** Ler `firebase.json` e confirmar que o header `**` com `no-cache` cobre `/firebase-messaging-sw.js` (não alterar o arquivo).
- [ ] **P3** Ler `apps/web/.env.docker` e confirmar `VITE_USE_EMULATORS=true` (é o modo `docker` usado pelo E2E). Se não for, parar e avisar.
- [ ] **P4** Ler `apps/web/src/vite-env.d.ts`, `apps/web/src/setlists/types.ts` (tipo `SetlistOrigin`) e `apps/web/src/auth/useAuth.ts`. Confirmar que os nomes batem com as interfaces abaixo; se algo divergir, anotar e avisar antes de implementar.

---

## Tarefa 0: interfaces compartilhadas

**Files:** criar `apps/web/src/push/types.ts`; alterar `apps/web/src/vite-env.d.ts`.

- [ ] **Step 1: Criar `apps/web/src/push/types.ts`**

```ts
import { createContext } from 'react';
import type { SetlistOrigin } from '../setlists/types';

/** Estado da linha "Avisos" na aba Mais. */
export type AvisosStatus =
  | 'checking'
  | 'available'
  | 'enabling'
  | 'active'
  | 'disabling'
  | 'blocked'
  | 'ios-install'
  | 'unsupported'
  | 'error';

/** Resultado do "Enviar aviso de teste". */
export type TestStatus = 'idle' | 'sending' | 'sent' | 'failed';

/** Aparelho gravado neste navegador: o token que o servidor conhece. */
export interface PushRecord {
  token: string;
  /** Quando foi gravado no servidor (ms desde a época). */
  registeredAt: number;
}

export interface PushRecordStore {
  read(): PushRecord | null;
  write(record: PushRecord): void;
  clear(): void;
}

/** Porta sobre `firebase/messaging`. A implementação real está em `messaging.ts`. */
export interface PushMessagingPort {
  isSupported(): Promise<boolean>;
  /** 'unsupported' quando a API de notificação não existe (iOS fora da tela inicial, por exemplo). */
  permission(): NotificationPermission | 'unsupported';
  /** Pede a permissão só se ainda está em 'default'; deve ser a primeira chamada do toque em Ativar. */
  getToken(vapidKey: string): Promise<string>;
  deleteToken(): Promise<void>;
}

/** Callables de #98. */
export interface PushApi {
  register(token: string, origin: SetlistOrigin): Promise<void>;
  unregister(token: string): Promise<void>;
  sendTest(): Promise<{ sent: number; failed: number; pruned: number }>;
}

export interface PushService {
  /** Estado inicial da linha. Com permissão revogada e aparelho gravado, remove o aparelho antes. */
  load(): Promise<AvisosStatus>;
  /** Chamado direto do toque em Ativar: a primeira ação é `port.getToken`, sem `await` antes. */
  enable(): Promise<AvisosStatus>;
  disable(): Promise<AvisosStatus>;
  sendTest(): Promise<TestStatus>;
  /** Ao abrir o app com avisos ativos. Nunca lança. */
  revalidate(): Promise<void>;
  /** Antes de sair da conta. Nunca lança e tem teto de tempo. */
  forgetDevice(): Promise<void>;
}

/** `null` quando a linha não existe (sem VAPID). Os componentes leem daqui. */
export const PushContext = createContext<PushService | null>(null);
```

- [ ] **Step 2: Alterar `apps/web/src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_TEST_BANNER?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
}
```

- [ ] **Step 3: Verificar**

Run (em `apps/web`): `npm run typecheck`. Esperado: sem erros.

- [ ] **Step 4: Commit**

```
git add apps/web/src/push/types.ts apps/web/src/vite-env.d.ts
git commit -m "feat(push): interfaces dos avisos na aba Mais" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Grupo G1 (paralelo: tarefas 1, 2, 3, 4, 6, 8, 10)

### Tarefa 1: config do cliente (`env.ts` e `firebase.ts`)

**Files:** `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.test.ts`, `apps/web/src/lib/firebase.ts`, `apps/web/src/lib/firebase.test.ts`.

- [ ] **Step 1: Teste (`env.test.ts`, acrescentar)**

```ts
import { readPushConfig } from './env';

describe('readPushConfig', () => {
  it('is null without the VAPID key, and never throws', () => {
    expect(readPushConfig({})).toBeNull();
    expect(readPushConfig({ VITE_FIREBASE_MESSAGING_SENDER_ID: '123' })).toBeNull();
  });

  it('is null without the sender id (the line would be dead)', () => {
    expect(readPushConfig({ VITE_FIREBASE_VAPID_KEY: 'vapid' })).toBeNull();
  });

  it('returns both values when both exist', () => {
    expect(
      readPushConfig({ VITE_FIREBASE_VAPID_KEY: 'vapid', VITE_FIREBASE_MESSAGING_SENDER_ID: '123' }),
    ).toEqual({ vapidKey: 'vapid', messagingSenderId: '123' });
  });
});
```

- [ ] **Step 2: Teste (`firebase.test.ts`, acrescentar; o arquivo já mocka `firebase/app`)**

```ts
it('adds messagingSenderId to the app config only when given', () => {
  createFirebase(env);
  const first = vi.mocked(initializeApp).mock.calls.at(-1)![0];
  expect(first).not.toHaveProperty('messagingSenderId');

  createFirebase(env, { messagingSenderId: '123' });
  const second = vi.mocked(initializeApp).mock.calls.at(-1)![0];
  expect(second).toMatchObject({ messagingSenderId: '123' });
});
```
(Se o arquivo não importar `initializeApp` nem `vi`, ajustar os imports no topo; o mock de `firebase/app` já está no arquivo.)

- [ ] **Step 3: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/lib/env.test.ts src/lib/firebase.test.ts`. Esperado: FAIL (função/opção inexistente).

- [ ] **Step 4: Implementar `apps/web/src/lib/env.ts` (acrescentar ao final)**

```ts
export interface PushConfig {
  vapidKey: string;
  messagingSenderId: string;
}

/** Avisos só existem com as duas variáveis. Sem elas, a linha "Avisos" não aparece. */
export function readPushConfig(raw: Record<string, string | undefined>): PushConfig | null {
  const vapidKey = raw.VITE_FIREBASE_VAPID_KEY;
  const messagingSenderId = raw.VITE_FIREBASE_MESSAGING_SENDER_ID;
  if (!vapidKey || !messagingSenderId) return null;
  return { vapidKey, messagingSenderId };
}
```

- [ ] **Step 5: Implementar `apps/web/src/lib/firebase.ts`**

Trocar a assinatura e o `initializeApp`:

```ts
export function createFirebase(
  env: WebEnv,
  options: { messagingSenderId?: string } = {},
): FirebaseServices {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    appId: env.VITE_FIREBASE_APP_ID,
    // O SDK de mensagens lê o sender id da config do app; sem ele a chave da chamada não existe.
    ...(options.messagingSenderId ? { messagingSenderId: options.messagingSenderId } : {}),
  });
```
(O restante da função fica igual.)

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/lib/env.test.ts src/lib/firebase.test.ts`. Esperado: PASS.

- [ ] **Step 7: Lint e tipos**

Run (na raiz): `npm run lint` e `npm run typecheck`. Esperado: verde.

- [ ] **Step 8: Commit**

```
git add apps/web/src/lib/env.ts apps/web/src/lib/env.test.ts apps/web/src/lib/firebase.ts apps/web/src/lib/firebase.test.ts
git commit -m "feat(push): lê as variáveis opcionais de mensagens" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: `firebase-messaging-sw.js` gerado no build

**Files:** criar `apps/web/build/messagingSw.ts`, `apps/web/build/messagingSw.test.ts`; alterar `apps/web/build/pwaConfig.ts`, `apps/web/build/pwaConfig.test.ts`, `apps/web/vite.config.ts`.

- [ ] **Step 1: Teste (`apps/web/build/messagingSw.test.ts`)**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  FIREBASE_SDK_VERSION,
  messagingServiceWorkerSource,
  messagingSwConfig,
  messagingSwPlugin,
} from './messagingSw';

const env = {
  VITE_FIREBASE_API_KEY: 'key',
  VITE_FIREBASE_AUTH_DOMAIN: 'auth.example',
  VITE_FIREBASE_PROJECT_ID: 'proj',
  VITE_FIREBASE_STORAGE_BUCKET: 'bucket',
  VITE_FIREBASE_APP_ID: 'app-id',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123',
};

describe('messagingSwConfig', () => {
  it('reads the six keys and needs all of them', () => {
    expect(messagingSwConfig(env)).toEqual({
      apiKey: 'key',
      authDomain: 'auth.example',
      projectId: 'proj',
      storageBucket: 'bucket',
      appId: 'app-id',
      messagingSenderId: '123',
    });
    expect(messagingSwConfig({ ...env, VITE_FIREBASE_MESSAGING_SENDER_ID: undefined })).toBeNull();
  });
});

describe('messagingServiceWorkerSource', () => {
  it('pins the compat SDK to the firebase version of apps/web/package.json', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(FIREBASE_SDK_VERSION).toBe(pkg.dependencies.firebase);
    const source = messagingServiceWorkerSource(messagingSwConfig(env)!);
    expect(source).toContain(`firebasejs/${FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`);
    expect(source).toContain('"messagingSenderId":"123"');
    expect(source).not.toContain('VITE_');
  });
});

describe('messagingSwPlugin', () => {
  it('emits firebase-messaging-sw.js at the root of the build', () => {
    const emitFile = vi.fn();
    const plugin = messagingSwPlugin(env);
    (plugin.generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: expect.stringContaining('firebase.messaging()'),
      }),
    );
  });

  it('emits nothing without the full config', () => {
    const emitFile = vi.fn();
    const plugin = messagingSwPlugin({ ...env, VITE_FIREBASE_MESSAGING_SENDER_ID: undefined });
    (plugin.generateBundle as (this: unknown) => void).call({ emitFile });
    expect(emitFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Teste (`pwaConfig.test.ts`, acrescentar à lista de `globIgnores` que já existe)**

Dentro do `expect(workbox.globIgnores).toEqual(expect.arrayContaining([ ... ]))`, incluir `'**/assets/messaging-*'`. Acrescentar também um caso: `expect(workbox.globPatterns).toEqual(['index.html', 'assets/*.{js,css}'])` (inalterado; é a garantia de que o SW do Workbox não muda).

- [ ] **Step 3: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run build/messagingSw.test.ts build/pwaConfig.test.ts`. Esperado: FAIL.

- [ ] **Step 4: Implementar `apps/web/build/messagingSw.ts`**

```ts
import type { Plugin } from 'vite';

/** Mesma versão do pacote `firebase` (apps/web/package.json). O teste confere. */
export const FIREBASE_SDK_VERSION = '13.3.0';

export interface MessagingSwConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  appId: string;
  messagingSenderId: string;
}

/** A config do SW vem do build (o SW não lê `VITE_*`). Sem o conjunto completo, não há arquivo. */
export function messagingSwConfig(env: Record<string, string | undefined>): MessagingSwConfig | null {
  const {
    VITE_FIREBASE_API_KEY: apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: authDomain,
    VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_FIREBASE_STORAGE_BUCKET: storageBucket,
    VITE_FIREBASE_APP_ID: appId,
    VITE_FIREBASE_MESSAGING_SENDER_ID: messagingSenderId,
  } = env;
  if (!apiKey || !authDomain || !projectId || !storageBucket || !appId || !messagingSenderId) {
    return null;
  }
  return { apiKey, authDomain, projectId, storageBucket, appId, messagingSenderId };
}

export function messagingServiceWorkerSource(config: MessagingSwConfig): string {
  const cdn = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  return [
    '// Gerado no build por apps/web/build/messagingSw.ts; não editar.',
    `importScripts('${cdn}/firebase-app-compat.js');`,
    `importScripts('${cdn}/firebase-messaging-compat.js');`,
    `firebase.initializeApp(${JSON.stringify(config)});`,
    'firebase.messaging();',
    '',
  ].join('\n');
}

export function messagingSwPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'cifras-messaging-sw',
    generateBundle() {
      const config = messagingSwConfig(env);
      if (!config) return;
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: messagingServiceWorkerSource(config),
      });
    },
  };
}
```

- [ ] **Step 5: Alterar `apps/web/build/pwaConfig.ts`**

Em `workbox.globIgnores`, acrescentar a linha (perto de `'**/assets/pdf.worker*'`):

```ts
      // SDK de mensagens: só carrega com a linha "Avisos" (aba Mais); fora do precache do app shell.
      '**/assets/messaging-*',
```

- [ ] **Step 6: Alterar `apps/web/vite.config.ts`**

1. Import: `import { messagingSwPlugin } from './build/messagingSw';`
2. Em `plugins`, depois de `VitePWA(...)`: `messagingSwPlugin(env),`
3. Em `codeSplitting.groups`, acrescentar (antes de `firebase-core`):

```ts
              {
                // Só a aba Mais (avisos) usa; fora do app shell e do precache.
                name: 'messaging',
                test: /node_modules\/(firebase\/messaging|@firebase\/messaging)\//,
              },
```

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run build/messagingSw.test.ts build/pwaConfig.test.ts`. Esperado: PASS.

- [ ] **Step 8: Lint e tipos**

Run (raiz): `npm run lint`, `npm run typecheck`. Esperado: verde.

- [ ] **Step 9: Commit**

```
git add apps/web/build/messagingSw.ts apps/web/build/messagingSw.test.ts apps/web/build/pwaConfig.ts apps/web/build/pwaConfig.test.ts apps/web/vite.config.ts
git commit -m "feat(push): service worker de mensagens gerado no build" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 3: lógica pura (estado da linha e registro local)

**Files:** criar `apps/web/src/push/pushState.ts`, `pushState.test.ts`, `apps/web/src/push/pushRecord.ts`, `pushRecord.test.ts`.

- [ ] **Step 1: Teste (`pushState.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { decideAvisos, iosNotInstalled } from './pushState';

const base = { supported: true, iosNotInstalled: false, permission: 'default' as const, hasRecord: false };

describe('decideAvisos', () => {
  it.each([
    [{}, 'available'],
    [{ permission: 'granted' as const, hasRecord: true }, 'active'],
    [{ permission: 'granted' as const, hasRecord: false }, 'available'],
    [{ permission: 'denied' as const }, 'blocked'],
    [{ permission: 'denied' as const, hasRecord: true }, 'blocked'],
    [{ supported: false }, 'unsupported'],
    [{ permission: 'unsupported' as const }, 'unsupported'],
    [{ iosNotInstalled: true, supported: false }, 'ios-install'],
    [{ iosNotInstalled: true, permission: 'denied' as const }, 'ios-install'],
  ])('decides from %o', (overrides, expected) => {
    expect(decideAvisos({ ...base, ...overrides })).toBe(expected);
  });
});

describe('iosNotInstalled', () => {
  const win = (userAgent: string, standalone: boolean) =>
    ({
      navigator: { userAgent, maxTouchPoints: 0, standalone },
      matchMedia: () => ({ matches: false }),
    }) as unknown as Window;
  const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

  it('is true for iPhone Safari outside the home screen', () => {
    expect(iosNotInstalled(win(safari, false))).toBe(true);
  });
  it('is false inside the home screen app and on other browsers', () => {
    expect(iosNotInstalled(win(safari, true))).toBe(false);
    expect(iosNotInstalled(win('Mozilla/5.0 (Windows NT 10.0) Chrome/120', false))).toBe(false);
  });
});
```

- [ ] **Step 2: Teste (`pushRecord.test.ts`)**

```ts
import { describe, expect, it, vi } from 'vitest';
import { PUSH_RECORD_KEY, createPushRecordStore } from './pushRecord';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as unknown as Storage;
}

describe('createPushRecordStore', () => {
  it('round-trips the record under the versioned key', () => {
    const storage = memory();
    const store = createPushRecordStore(storage);
    expect(store.read()).toBeNull();
    store.write({ token: 'tok', registeredAt: 10 });
    expect(storage.getItem(PUSH_RECORD_KEY)).toContain('"token":"tok"');
    expect(store.read()).toEqual({ token: 'tok', registeredAt: 10 });
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('ignores corrupt or foreign values', () => {
    const storage = memory();
    storage.setItem(PUSH_RECORD_KEY, '{not json');
    expect(createPushRecordStore(storage).read()).toBeNull();
    storage.setItem(PUSH_RECORD_KEY, JSON.stringify({ token: '', registeredAt: 1 }));
    expect(createPushRecordStore(storage).read()).toBeNull();
  });

  it('never throws without storage or when storage throws', () => {
    const broken = { getItem: vi.fn(() => { throw new Error('denied'); }), setItem: vi.fn(() => { throw new Error('full'); }), removeItem: vi.fn(() => { throw new Error('x'); }) } as unknown as Storage;
    const store = createPushRecordStore(broken);
    expect(store.read()).toBeNull();
    expect(() => store.write({ token: 't', registeredAt: 1 })).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(createPushRecordStore(undefined).read()).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/push/pushState.test.ts src/push/pushRecord.test.ts`. Esperado: FAIL.

- [ ] **Step 4: Implementar `apps/web/src/push/pushState.ts`**

```ts
import { isIosSafari, isStandalone, readInstallEnvironment } from '../pwa/installPolicy';

export type RestAvisosStatus = 'available' | 'active' | 'blocked' | 'ios-install' | 'unsupported';

export interface AvisosInput {
  supported: boolean;
  iosNotInstalled: boolean;
  permission: NotificationPermission | 'unsupported';
  hasRecord: boolean;
}

/** Estado de repouso. Checando, ativando, desativando e erro são transitórios (hook). */
export function decideAvisos(input: AvisosInput): RestAvisosStatus {
  if (input.iosNotInstalled) return 'ios-install';
  if (!input.supported || input.permission === 'unsupported') return 'unsupported';
  if (input.permission === 'denied') return 'blocked';
  if (input.permission === 'granted' && input.hasRecord) return 'active';
  return 'available';
}

/** iPhone/iPad com Safari fora da tela inicial: não há push nem pedido de permissão. */
export function iosNotInstalled(win: Window): boolean {
  const env = readInstallEnvironment(win);
  return isIosSafari(env) && !isStandalone(env);
}
```

- [ ] **Step 5: Implementar `apps/web/src/push/pushRecord.ts`**

```ts
import type { PushRecord, PushRecordStore } from './types';

/** Versionada: mudar o formato pede nova chave. */
export const PUSH_RECORD_KEY = 'cifras.push.v1';
/** O SDK troca o token cerca de uma vez por semana; passado esse prazo, o aparelho é regravado. */
export const REGISTER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isPushRecord(value: unknown): value is PushRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<PushRecord>;
  return typeof v.token === 'string' && v.token.length > 0 && typeof v.registeredAt === 'number';
}

/** Storage pode ser ausente ou lançar (modo privado). Nada aqui lança. */
export function createPushRecordStore(storage: StorageLike | undefined): PushRecordStore {
  return {
    read() {
      try {
        const raw = storage?.getItem(PUSH_RECORD_KEY);
        if (!raw) return null;
        const value: unknown = JSON.parse(raw);
        return isPushRecord(value) ? value : null;
      } catch {
        return null;
      }
    },
    write(record) {
      try {
        storage?.setItem(PUSH_RECORD_KEY, JSON.stringify(record));
      } catch {
        // Sem armazenamento: o próximo abrir do app revalida pelo SDK.
      }
    },
    clear() {
      try {
        storage?.removeItem(PUSH_RECORD_KEY);
      } catch {
        // Nada a limpar.
      }
    },
  };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run src/push/pushState.test.ts src/push/pushRecord.test.ts`. Esperado: PASS.

- [ ] **Step 7: Lint e tipos; commit**

```
git add apps/web/src/push/pushState.ts apps/web/src/push/pushState.test.ts apps/web/src/push/pushRecord.ts apps/web/src/push/pushRecord.test.ts
git commit -m "feat(push): estado da linha e registro local do aparelho" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 4: porta do SDK, fake de E2E e API de callables

**Files:** criar `apps/web/src/push/messaging.ts`, `messaging.test.ts`, `fakeMessaging.ts`, `fakeMessaging.test.ts`, `pushApi.ts`, `pushApi.test.ts`.

- [ ] **Step 1: Teste (`pushApi.test.ts`)**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPushApi } from './pushApi';

const callable = vi.fn(async (data?: unknown) => ({ data: { ok: true, data } }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callable) }));
import { httpsCallable } from 'firebase/functions';

const functions = { name: 'functions' };
const api = createPushApi({ loadFunctions: async () => functions as never });

beforeEach(() => {
  callable.mockClear();
  vi.mocked(httpsCallable).mockClear();
});

describe('createPushApi', () => {
  it('calls registerDevice with token and origin', async () => {
    await api.register('tok', 'teste');
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'registerDevice');
    expect(callable).toHaveBeenCalledWith({ token: 'tok', origin: 'teste' });
  });

  it('calls unregisterDevice with the token only', async () => {
    await api.unregister('tok');
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'unregisterDevice');
    expect(callable).toHaveBeenCalledWith({ token: 'tok' });
  });

  it('returns the sendTestPush counts', async () => {
    callable.mockResolvedValueOnce({ data: { sent: 2, failed: 0, pruned: 1 } } as never);
    await expect(api.sendTest()).resolves.toEqual({ sent: 2, failed: 0, pruned: 1 });
    expect(httpsCallable).toHaveBeenCalledWith(functions, 'sendTestPush');
  });
});
```

- [ ] **Step 2: Teste (`fakeMessaging.test.ts`)**

```ts
import { describe, expect, it } from 'vitest';
import { createFakeMessagingPort, type FakeWindow } from './fakeMessaging';

const win = (control?: FakeWindow['__CIFRAS_PUSH_FAKE__']) => ({ __CIFRAS_PUSH_FAKE__: control }) as FakeWindow;

describe('createFakeMessagingPort', () => {
  it('grants on the simulated prompt and returns the fake token', async () => {
    const port = createFakeMessagingPort(win({ permission: 'default', answer: 'granted' }));
    expect(port.permission()).toBe('default');
    await expect(port.getToken('vapid')).resolves.toBe('fake-token-e2e');
    expect(port.permission()).toBe('granted');
  });

  it('rejects with the SDK code when the prompt is answered "denied"', async () => {
    const port = createFakeMessagingPort(win({ permission: 'default', answer: 'denied' }));
    await expect(port.getToken('vapid')).rejects.toMatchObject({ code: 'messaging/permission-blocked' });
  });

  it('fails enable when asked to, and reports unsupported browsers', async () => {
    await expect(createFakeMessagingPort(win({ failEnable: true })).getToken('v')).rejects.toThrow();
    await expect(createFakeMessagingPort(win({ supported: false })).isSupported()).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Teste (`messaging.test.ts`) — mock de `firebase/messaging`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = {
  isSupported: vi.fn(async () => true),
  getMessaging: vi.fn(() => ({ name: 'messaging' })),
  getToken: vi.fn(async () => 'tok-1'),
  deleteToken: vi.fn(async () => true),
};
vi.mock('firebase/messaging', () => sdk);

import { createMessagingPort } from './messaging';

const app = { name: 'app' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Notification', { permission: 'default' });
});

describe('createMessagingPort', () => {
  it('reports unsupported when the SDK says so', async () => {
    sdk.isSupported.mockResolvedValueOnce(false);
    await expect(createMessagingPort(app).isSupported()).resolves.toBe(false);
  });

  it('gets the token with the VAPID key', async () => {
    const port = createMessagingPort(app);
    await port.isSupported(); // pré-carrega no mount
    await expect(port.getToken('vapid')).resolves.toBe('tok-1');
    expect(sdk.getToken).toHaveBeenCalledWith({ name: 'messaging' }, { vapidKey: 'vapid' });
  });

  it('calls the SDK synchronously once loaded (keeps the tap gesture)', async () => {
    const port = createMessagingPort(app);
    await port.isSupported();
    void port.getToken('vapid');
    expect(sdk.getToken).toHaveBeenCalledTimes(1);
  });

  it('reads permission, and "unsupported" without the Notification API', () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(createMessagingPort(app).permission()).toBe('denied');
    vi.stubGlobal('Notification', undefined);
    expect(createMessagingPort(app).permission()).toBe('unsupported');
  });
});
```
(Note: `vi.stubGlobal('Notification', undefined)` pode precisar de `delete (globalThis as any).Notification`; o implementador ajusta se o teste não isolar.)

- [ ] **Step 4: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/push/pushApi.test.ts src/push/fakeMessaging.test.ts src/push/messaging.test.ts`. Esperado: FAIL.

- [ ] **Step 5: Implementar `apps/web/src/push/pushApi.ts`**

```ts
import type { FirebaseServices } from '../lib/firebase';
import type { PushApi } from './types';

/** Callables de #98. Mesmo padrão de peopleApi: o SDK de functions entra sob demanda. */
export function createPushApi({ loadFunctions }: Pick<FirebaseServices, 'loadFunctions'>): PushApi {
  const call = async <Req, Res>(name: string, data?: Req): Promise<Res> => {
    const [{ httpsCallable }, functions] = await Promise.all([
      import('firebase/functions'),
      loadFunctions(),
    ]);
    return (await httpsCallable<Req, Res>(functions, name)(data)).data;
  };
  return {
    async register(token, origin) {
      await call('registerDevice', { token, origin });
    },
    async unregister(token) {
      await call('unregisterDevice', { token });
    },
    sendTest: () =>
      call<undefined, { sent: number; failed: number; pruned: number }>('sendTestPush'),
  };
}
```

- [ ] **Step 6: Implementar `apps/web/src/push/messaging.ts`**

```ts
import type { FirebaseApp } from 'firebase/app';
import type { Messaging } from 'firebase/messaging';
import type { PushMessagingPort } from './types';

type MessagingSdk = typeof import('firebase/messaging');
interface Loaded {
  sdk: MessagingSdk;
  messaging: Messaging | null;
}

/**
 * Porta real sobre `firebase/messaging`. O módulo entra sob demanda; `isSupported()` (no mount)
 * deixa tudo pronto, e aí `getToken` chama o SDK sem nenhum `await` antes: o pedido de permissão
 * do SDK acontece dentro do toque em Ativar (exigência do Safari).
 */
export function createMessagingPort(app: FirebaseApp): PushMessagingPort {
  let loaded: Loaded | undefined;
  const prepare = (): Promise<Loaded> =>
    import('firebase/messaging').then(async (sdk) => {
      loaded = { sdk, messaging: (await sdk.isSupported()) ? sdk.getMessaging(app) : null };
      return loaded;
    });

  return {
    async isSupported() {
      try {
        const current = loaded ?? (await prepare());
        return current.messaging !== null;
      } catch {
        return false;
      }
    },
    permission() {
      return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    },
    async getToken(vapidKey) {
      const current = loaded ?? (await prepare());
      if (!current.messaging) throw new Error('Mensagens não suportadas neste navegador');
      return current.sdk.getToken(current.messaging, { vapidKey });
    },
    async deleteToken() {
      const current = loaded ?? (await prepare());
      if (current.messaging) await current.sdk.deleteToken(current.messaging);
    },
  };
}
```

- [ ] **Step 7: Implementar `apps/web/src/push/fakeMessaging.ts`**

```ts
import type { PushMessagingPort } from './types';

/** Controle dos testes E2E, definido por `addInitScript` em `window.__CIFRAS_PUSH_FAKE__`. */
export interface FakePushControl {
  /** Padrão true. */
  supported?: boolean;
  /** Permissão inicial; padrão 'default'. */
  permission?: NotificationPermission;
  /** O que o "diálogo" responde quando a permissão está em 'default'; padrão 'granted'. */
  answer?: 'granted' | 'denied';
  /** `getToken` falha (estado de erro). */
  failEnable?: boolean;
  /** Token devolvido; padrão 'fake-token-e2e'. */
  token?: string;
}

export interface FakeWindow {
  __CIFRAS_PUSH_FAKE__?: FakePushControl;
}

/** Só o build de emuladores (VITE_USE_EMULATORS=true) usa esta porta; nunca a de produção. */
export function createFakeMessagingPort(win: FakeWindow): PushMessagingPort {
  const control = (): FakePushControl => win.__CIFRAS_PUSH_FAKE__ ?? {};
  let permission: NotificationPermission = control().permission ?? 'default';
  return {
    async isSupported() {
      return control().supported ?? true;
    },
    permission() {
      return permission;
    },
    async getToken() {
      const current = control();
      if (current.failEnable) throw new Error('falha simulada');
      if (permission === 'default') permission = current.answer ?? 'granted';
      if (permission !== 'granted') {
        throw Object.assign(new Error('permissão negada'), { code: 'messaging/permission-blocked' });
      }
      return current.token ?? 'fake-token-e2e';
    },
    async deleteToken() {},
  };
}
```

- [ ] **Step 8: Rodar e ver passar; lint e tipos; commit**

Run: `npx vitest run src/push/pushApi.test.ts src/push/fakeMessaging.test.ts src/push/messaging.test.ts`. Esperado: PASS.

```
git add apps/web/src/push/messaging.ts apps/web/src/push/messaging.test.ts apps/web/src/push/fakeMessaging.ts apps/web/src/push/fakeMessaging.test.ts apps/web/src/push/pushApi.ts apps/web/src/push/pushApi.test.ts
git commit -m "feat(push): porta do SDK de mensagens e chamadas dos avisos" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 6: UI da linha "Avisos" (hook, linha, estilo, aba Mais)

**Files:** criar `apps/web/src/push/usePushAvisos.ts`, `usePushAvisos.test.tsx`, `apps/web/src/push/AvisosRow.tsx`, `AvisosRow.test.tsx`, `apps/web/src/ui/redesign-push.css`, `redesign-push.test.ts`; alterar `apps/web/src/main.tsx`, `apps/web/src/more/MaisPage.tsx`, `MaisPage.test.tsx`.

- [ ] **Step 1: Teste (`AvisosRow.test.tsx`)**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvisosStatus, PushService } from './types';
import { AvisosRow } from './AvisosRow';

function service(status: AvisosStatus, overrides: Partial<PushService> = {}): PushService {
  return {
    load: vi.fn(async () => status),
    enable: vi.fn(async () => 'active' as const),
    disable: vi.fn(async () => 'available' as const),
    sendTest: vi.fn(async () => 'sent' as const),
    revalidate: vi.fn(async () => {}),
    forgetDevice: vi.fn(async () => {}),
    ...overrides,
  };
}

const row = (s: PushService) =>
  render(<ul><AvisosRow service={s} /></ul>);

describe('AvisosRow', () => {
  it('shows the pode-ativar copy with an Ativar pill', async () => {
    row(service('available'));
    expect(await screen.findByText('Receba repertório novo e lembrete do ensaio neste aparelho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativar avisos neste aparelho' })).toBeEnabled();
  });

  it('calls enable on the tap, synchronously', async () => {
    const s = service('available');
    row(s);
    fireEvent.click(await screen.findByRole('button', { name: 'Ativar avisos neste aparelho' }));
    expect(s.enable).toHaveBeenCalledTimes(1);
  });

  it('active: Desativar pill, success text and the test button', async () => {
    row(service('active'));
    expect(await screen.findByText('Ativados neste aparelho')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar avisos neste aparelho' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar aviso de teste' })).toBeInTheDocument();
  });

  it('blocked, ios-install and unsupported have no action pill', async () => {
    const { unmount } = row(service('blocked'));
    expect(await screen.findByText(/Bloqueados no navegador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar|Desativar/ })).toBeNull();
    unmount();
    row(service('ios-install'));
    expect(await screen.findByText('No Safari: Compartilhar › Adicionar à Tela de Início')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ativar|Desativar/ })).toBeNull();
  });

  it('error shows role=alert and Tentar de novo', async () => {
    const s = service('error');
    row(s);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível ativar os avisos. Tente de novo.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(s.enable).toHaveBeenCalled();
  });

  it('test result goes to role=status on success and role=alert on failure', async () => {
    row(service('active', { sendTest: vi.fn(async () => 'failed' as const) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar aviso de teste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível enviar o teste.');
  });
});
```

- [ ] **Step 2: Teste (`usePushAvisos.test.tsx`)**

Cobrir com `renderHook` (testing-library): (a) começa em `checking` e vai para o status de `load`; (b) `enable()` põe `enabling` e depois o resultado; (c) `disable()` zera `test` para `idle`; (d) `sendTest()` com `failed` chama `load()` de novo (refresca a linha); (e) rejeição de `enable` vira `error`.

- [ ] **Step 3: Teste de CSS (`redesign-push.test.ts`)**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('redesign-push.css', () => {
  const css = readFileSync(new URL('./redesign-push.css', import.meta.url), 'utf8');
  it('uses tokens only, no hex colors', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('keeps the action pill at 44 px', () => {
    expect(css).toMatch(/\.push-action\s*{[^}]*min-height:\s*44px/);
  });
});
```

- [ ] **Step 4: Teste (`MaisPage.test.tsx`, acrescentar)**

```tsx
// Acrescentar ao final de MaisPage.test.tsx (usa o AuthContext e o testUser já importados ali).
import { PushContext, type PushService } from '../push/types';

const pushService = (): PushService => ({
  load: vi.fn(async () => 'available' as const),
  enable: vi.fn(async () => 'active' as const),
  disable: vi.fn(async () => 'available' as const),
  sendTest: vi.fn(async () => 'sent' as const),
  revalidate: vi.fn(async () => {}),
  forgetDevice: vi.fn(async () => {}),
});

function renderWithPush(role: Role, service: PushService | null) {
  const auth: AuthState = {
    status: 'signed-in',
    user: testUser,
    role,
    prepareSignIn: () => Promise.resolve(),
    signIn: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
  };
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <PushContext.Provider value={service}>
          <MaisPage />
        </PushContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('MaisPage Avisos row', () => {
  it('shows Avisos above Pessoas for members and admins', () => {
    renderWithPush('member', pushService());
    const avisos = screen.getByText('Avisos');
    const pessoas = screen.getByText('Pessoas');
    expect(avisos.compareDocumentPosition(pessoas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides Avisos from visitors', () => {
    renderWithPush('viewer', pushService());
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
  });

  it('hides Avisos without a push service (no VAPID in the build)', () => {
    renderWithPush('member', null);
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
  });
});
```
A ordem exigida é "Avisos" antes de "Pessoas" no DOM. Os testes antigos do arquivo seguem iguais.

- [ ] **Step 5: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/push/usePushAvisos.test.tsx src/push/AvisosRow.test.tsx src/push/redesign-push.test.ts src/more/MaisPage.test.tsx`. Esperado: FAIL.

- [ ] **Step 6: Implementar `apps/web/src/push/usePushAvisos.ts`**

```ts
import { useEffect, useState } from 'react';
import type { AvisosStatus, PushService, TestStatus } from './types';

export interface AvisosView {
  status: AvisosStatus;
  test: TestStatus;
  enable(): void;
  disable(): void;
  sendTest(): void;
}

export function usePushAvisos(service: PushService): AvisosView {
  const [status, setStatus] = useState<AvisosStatus>('checking');
  const [test, setTest] = useState<TestStatus>('idle');

  useEffect(() => {
    let alive = true;
    service
      .load()
      .then((next) => {
        if (alive) setStatus(next);
      })
      .catch(() => {
        if (alive) setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [service]);

  // `work()` roda na mesma chamada do clique: o toque em Ativar chega ao SDK sem await antes.
  const run = (pending: AvisosStatus, work: () => Promise<AvisosStatus>) => {
    setStatus(pending);
    work().then(setStatus, () => setStatus('error'));
  };

  return {
    status,
    test,
    enable: () => run('enabling', () => service.enable()),
    disable: () => {
      setTest('idle');
      run('disabling', () => service.disable());
    },
    sendTest: () => {
      setTest('sending');
      service
        .sendTest()
        .then(async (result) => {
          setTest(result);
          // Falhou: o servidor pode ter apagado o aparelho; relê o estado da linha.
          if (result === 'failed') setStatus(await service.load());
        })
        .catch(() => setTest('failed'));
    },
  };
}
```

- [ ] **Step 7: Implementar `apps/web/src/push/AvisosRow.tsx`**

```tsx
import type { AvisosStatus, PushService } from './types';
import { usePushAvisos } from './usePushAvisos';

const BELL = 'M6 8a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 14 6 8M10 20a2 2 0 0 0 4 0';
const MUTED_AVAILABLE = 'Receba repertório novo e lembrete do ensaio neste aparelho';

interface Copy {
  text: string;
  tone?: 'success';
  hint?: string;
  action?: {
    label: string;
    aria?: string;
    kind: 'primary' | 'secondary';
    disabled: boolean;
    run: 'enable' | 'disable';
  };
}

export function copyFor(status: AvisosStatus): Copy {
  switch (status) {
    case 'checking':
      return { text: 'Verificando…', action: { label: 'Ativar', kind: 'primary', disabled: true, run: 'enable' } };
    case 'available':
      return {
        text: MUTED_AVAILABLE,
        action: { label: 'Ativar', aria: 'Ativar avisos neste aparelho', kind: 'primary', disabled: false, run: 'enable' },
      };
    case 'enabling':
      return { text: 'Ativando…', action: { label: 'Ativar', kind: 'primary', disabled: true, run: 'enable' } };
    case 'active':
      return {
        text: 'Ativados neste aparelho',
        tone: 'success',
        action: { label: 'Desativar', aria: 'Desativar avisos neste aparelho', kind: 'secondary', disabled: false, run: 'disable' },
      };
    case 'disabling':
      return { text: 'Desativando…', action: { label: 'Desativar', kind: 'secondary', disabled: true, run: 'disable' } };
    case 'blocked':
      return { text: 'Bloqueados no navegador. Libere as notificações nas configurações do site e volte aqui' };
    case 'ios-install':
      return {
        text: 'Instale o app na tela inicial para receber avisos',
        hint: 'No Safari: Compartilhar › Adicionar à Tela de Início',
      };
    case 'unsupported':
      return { text: 'Seu navegador não permite avisos' };
    case 'error':
      return { text: MUTED_AVAILABLE, action: { label: 'Tentar de novo', kind: 'primary', disabled: false, run: 'enable' } };
  }
}

export function AvisosRow({ service }: { service: PushService }) {
  const view = usePushAvisos(service);
  const copy = copyFor(view.status);
  const active = view.status === 'active';
  const busy = view.status === 'enabling' || view.status === 'disabling';
  const action = copy.action;

  return (
    <li className="push-row" aria-busy={busy || undefined}>
      <div className="menu-row menu-row-push">
        <span className="menu-icon" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={BELL} />
          </svg>
        </span>
        <span className="menu-text">
          <strong>Avisos</strong>
          <span className={copy.tone === 'success' ? 'muted push-on' : 'muted'}>{copy.text}</span>
          {copy.hint && <span className="push-hint">{copy.hint}</span>}
        </span>
        {action && (
          <button
            type="button"
            className={
              action.kind === 'primary' ? 'push-action btn-primary' : 'push-action push-action--secondary'
            }
            aria-label={action.aria}
            disabled={action.disabled}
            onClick={action.run === 'enable' ? view.enable : view.disable}
          >
            {action.label}
          </button>
        )}
      </div>
      {active && (
        <div className="push-test">
          <button
            type="button"
            className="push-test-button"
            onClick={view.sendTest}
            disabled={view.test === 'sending'}
          >
            Enviar aviso de teste
          </button>
          {view.test === 'sent' && (
            <p role="status" className="notice">Aviso de teste enviado. Ele chega em instantes.</p>
          )}
          {view.test === 'failed' && (
            <p role="alert" className="notice">Não foi possível enviar o teste.</p>
          )}
        </div>
      )}
      {view.status === 'error' && (
        <p role="alert" className="notice">Não foi possível ativar os avisos. Tente de novo.</p>
      )}
    </li>
  );
}
```

- [ ] **Step 8: Implementar `apps/web/src/ui/redesign-push.css`**

```css
/* Linha "Avisos" na aba Mais (issue 99). Reusa .menu-row; a ação é pílula de 44 px. Só tokens. */
.push-action {
  min-height: 44px;
  min-width: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  font-weight: 800;
  white-space: nowrap;
}

.push-action:disabled {
  opacity: 0.55;
}

.push-action--secondary {
  background: var(--color-elevated);
  color: var(--color-text);
}

.push-on {
  color: var(--color-success);
}

.push-hint {
  display: block;
  font-size: 13px;
  color: var(--color-muted);
}

.push-test {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 16px 12px 60px;
}

.push-test-button {
  min-height: 44px;
  border: 0;
  background: none;
  color: var(--color-accent-text);
  font-weight: 700;
}
```

- [ ] **Step 9: Alterar `apps/web/src/main.tsx`**

Acrescentar após `import './ui/redesign-install.css';`: `import './ui/redesign-push.css';`

- [ ] **Step 10: Alterar `apps/web/src/more/MaisPage.tsx`**

1. Imports: `import { useContext } from 'react';`, `import { AvisosRow } from '../push/AvisosRow';`, `import { PushContext } from '../push/types';`
2. Dentro de `MaisPage`, logo após `const { user, role, signOut } = useAuth();`: `const push = useContext(PushContext);`
3. Imediatamente antes do `<li>` da linha "Pessoas" (o que tem `is-soon`), inserir:

```tsx
        {push && (role === 'member' || isAdmin(role)) && <AvisosRow service={push} />}
```

- [ ] **Step 11: Rodar e ver passar**

Run: `npx vitest run src/push/usePushAvisos.test.tsx src/push/AvisosRow.test.tsx src/push/redesign-push.test.ts src/more/MaisPage.test.tsx`. Esperado: PASS.

- [ ] **Step 12: Lint e tipos; commit**

```
git add apps/web/src/push/usePushAvisos.ts apps/web/src/push/usePushAvisos.test.tsx apps/web/src/push/AvisosRow.tsx apps/web/src/push/AvisosRow.test.tsx apps/web/src/ui/redesign-push.css apps/web/src/ui/redesign-push.test.ts apps/web/src/main.tsx apps/web/src/more/MaisPage.tsx apps/web/src/more/MaisPage.test.tsx
git commit -m "feat(push): linha Avisos na aba Mais" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 8: servidor (ícone e distintivo) e asset (backend-dev)

**Files:** alterar `apps/functions/src/push/adminDeps.ts`, `apps/functions/src/push/adminDeps.test.ts`, `apps/web/scripts/generate-icons.mjs`; criar `apps/web/public/icons/badge-96.png`.

- [ ] **Step 1: Teste (`adminDeps.test.ts`)**

Ajustar o teste `'builds the exact sendEach message for one device'` para esperar, em `webpush.notification`, `icon` e `badge` absolutos pela origem do link. Usar um link de produção (`https://louvor-hajaluz.web.app/repertorios/s1`) e esperar:

```ts
webpush: {
  notification: {
    tag: 'tag-1',
    icon: 'https://louvor-hajaluz.web.app/icons/icon-192.png',
    badge: 'https://louvor-hajaluz.web.app/icons/badge-96.png',
  },
  fcmOptions: { link: 'https://louvor-hajaluz.web.app/repertorios/s1' },
},
```
Acrescentar um caso: link do site de teste → `icon`/`badge` apontam para `https://louvor-hajaluz-teste.web.app/...`.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/functions`): `npx vitest run src/push/adminDeps.test.ts`. Esperado: FAIL no caso alterado.

- [ ] **Step 3: Implementar em `adminDeps.ts`**

No módulo, acima de `createPushDeps` (ou no topo do `sendBatch`):

```ts
// Ícone e distintivo saem do site da origem do link (o aparelho de teste usa o site de teste).
const siteAsset = (link: string, path: string): string => new URL(path, link).href;
```

Dentro de `sendBatch`, substituir o `webpush` por:

```ts
          webpush: {
            notification: {
              tag: message.tag,
              icon: siteAsset(message.link, '/icons/icon-192.png'),
              badge: siteAsset(message.link, '/icons/badge-96.png'),
            },
            fcmOptions: { link: message.link },
          },
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/push/adminDeps.test.ts`. Esperado: PASS.

- [ ] **Step 5: Gerar o distintivo (`apps/web/scripts/generate-icons.mjs`)**

Acrescentar, depois de `maskable`:

```js
// Distintivo monocromático: a barra do Android usa só o alfa. Sem o fundo; o glifo em branco.
const badge = svg
  .replace(/<rect[^>]*rx="112"[^>]*\/>/, '')
  .replace('<g id="note"', '<g id="note" fill="#ffffff"');
```

E no array `targets`, acrescentar: `{ file: 'badge-96.png', source: badge, size: 96 },`

Run (em `apps/web`): `node scripts/generate-icons.mjs`. Esperado: `badge-96.png 96x96 ... bytes`.

Conferir visualmente com a ferramenta de leitura de imagem: o PNG deve ser branco sobre transparente. Se o glifo tiver `fill` próprio nos filhos, trocar por branco e regerar. Conferir alfa com sharp: `metadata().channels === 4` e canto (0,0) com alfa 0. Os PNGs de ícone existentes não devem mudar (conferir com `git status`).

- [ ] **Step 6: Lint e tipos (functions); commit**

Run (em `apps/functions`): `npm run typecheck` (ou `npx tsc --noEmit`), e `npm run lint` na raiz.

```
git add apps/functions/src/push/adminDeps.ts apps/functions/src/push/adminDeps.test.ts apps/web/scripts/generate-icons.mjs apps/web/public/icons/badge-96.png
git commit -m "feat(push): ícone e distintivo no aviso" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 10: docs (design-system e sistema)

**Files:** alterar `docs/design-system.md`, `docs/sistema.md`.

- [ ] **Step 1: `docs/design-system.md`**
  - §5, linha **Aba Mais**: acrescentar "**Avisos** (linha de menu com ação e estado, acima de Pessoas; só membro e admin)".
  - §5, nova linha **Linha de menu com ação e estado**: `.menu-row` com ícone à esquerda, título + apoio (muted) no meio e pílula de 44 px à direita. Pílula primária (`.btn-primary`, âmbar) para Ativar; secundária (`--color-elevated`) para Desativar; sem pílula em bloqueado, iPhone fora da tela inicial e sem suporte. Com avisos ativos, segunda linha "Enviar aviso de teste" (texto em `--color-accent-text`). Estados: carregando, pode ativar, ativando, ativa, desativando, bloqueada, iPhone fora da tela inicial, sem suporte, erro. Ver `src/push/AvisosRow.tsx`, `ui/redesign-push.css`.
  - §5, nova linha **Aviso do sistema**: título e corpo, `tag` por repertório e tipo (`setlist-<id>-novo` para o repertório novo, `setlist-<id>-ensaio` para os dois lembretes do ensaio, que se substituem; `aviso-teste` para o teste; ver `apps/functions/src/push/newSetlist.ts` e `rehearsal.ts`), badge monocromático (`/icons/badge-96.png`: branco com transparência), ícone da PWA.
  - §8 (mapa de telas): acrescentar "Avisos · estados" (escuro e claro) e "Aviso do sistema". Conferir o formato já usado na tabela.
  - Textos fixos (usar exatamente): "Receba repertório novo e lembrete do ensaio neste aparelho"; "Ativados neste aparelho"; "Bloqueados no navegador. Libere as notificações nas configurações do site e volte aqui"; "Instale o app na tela inicial para receber avisos" + "No Safari: Compartilhar › Adicionar à Tela de Início"; "Seu navegador não permite avisos"; "Não foi possível ativar os avisos. Tente de novo."; "Aviso de teste enviado. Ele chega em instantes."; "Não foi possível enviar o teste.".
  - Aviso do sistema: "Novo repertório" / "{rótulo} · {dia} {dd/mm}"; "Ensaio em 30 min" / "{rótulo} · hoje às 18h30. Toque para ver os louvores."; "Ensaio agora" / "{rótulo} · começa às 18h30."; "Aviso de teste" / "Está tudo certo. Você vai receber os avisos do Church Cifras neste aparelho.". Ensaio mudou: "Ensaio mudou para 19h00".

  (Os textos de avisos do sistema vêm de #98/#101/#102 e já estão nas Functions; conferir contra `apps/functions/src/push/` antes de copiar.)

- [ ] **Step 2: `docs/sistema.md`**
  - Seção "### Administração" ou a que descreve a aba Mais: incluir "**Avisos** (membro e admin): ativar e desativar os avisos neste aparelho e enviar aviso de teste; visitante não vê".
  - Seção "### PWA e desempenho": acrescentar que o `firebase-messaging-sw.js` é gerado no build com a config do Firebase, escopo `/firebase-cloud-messaging-push-scope`, separado do SW de cache; que o app revalida o token ao abrir (membro/admin com avisos ativos); que o chunk do SDK de mensagens não entra no precache; e o limite: no iPhone só com o app instalado (iOS 16.4+).
  - "## Limites conhecidos e pendências" / "### Limites aceitos": sem horário de silêncio na v1; modo foco silencia; a descoberta é só pela aba Mais.
  - Linha 245 (histórico do não-objetivo): trocar "só a tela (#99) ainda não existe" por "a tela está na #99". **Manter a frase literal "Notificação push, escala de músicos/líder, comentários"** no histórico.
  - Respeitar o teto de 350 linhas (hoje 300).

- [ ] **Step 3: Verificar**

Run (raiz): `npm run test:harness` (confere tokens documentados; não deve mudar, nenhum token novo). `wc -l docs/sistema.md` ≤ 350.

- [ ] **Step 4: Commit**

```
git add docs/design-system.md docs/sistema.md
git commit -m "docs(push): avisos na aba Mais, service worker e limites" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 5 (G2): serviço de avisos e provedor

Depende da Tarefa 0 e da Tarefa 3 (`pushState`, `pushRecord`).

**Files:** criar `apps/web/src/push/pushService.ts`, `pushService.test.ts`, `apps/web/src/push/PushProvider.tsx`, `PushProvider.test.tsx`.

- [ ] **Step 1: Teste (`pushService.test.ts`) — fábricas de teste**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createPushService } from './pushService';
import type { PushApi, PushMessagingPort, PushRecord, PushRecordStore } from './types';

const VAPID = 'vapid-test';

function memoryStore(initial: PushRecord | null = null): PushRecordStore & { value: PushRecord | null } {
  const store = {
    value: initial,
    read: () => store.value,
    write: (r: PushRecord) => {
      store.value = r;
    },
    clear: () => {
      store.value = null;
    },
  };
  return store;
}

function fakePort(overrides: Partial<PushMessagingPort> = {}): PushMessagingPort {
  return {
    isSupported: vi.fn(async () => true),
    permission: vi.fn(() => 'granted' as const),
    getToken: vi.fn(async () => 'tok-1'),
    deleteToken: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeApi(overrides: Partial<PushApi> = {}): PushApi {
  return {
    register: vi.fn(async () => {}),
    unregister: vi.fn(async () => {}),
    sendTest: vi.fn(async () => ({ sent: 1, failed: 0, pruned: 0 })),
    ...overrides,
  };
}

function build(opts: {
  port?: PushMessagingPort;
  api?: PushApi;
  store?: ReturnType<typeof memoryStore>;
  ios?: boolean;
  hostname?: string;
  now?: number;
} = {}) {
  const port = opts.port ?? fakePort();
  const api = opts.api ?? fakeApi();
  const store = opts.store ?? memoryStore();
  const svc = createPushService({
    vapidKey: VAPID,
    port,
    api,
    store,
    hostname: opts.hostname ?? 'louvor-hajaluz.web.app',
    ios: opts.ios ?? false,
    now: () => opts.now ?? 1_000,
    warn: () => {},
    releaseTimeoutMs: 50,
  });
  return { svc, port, api, store };
}
```

Casos obrigatórios (escrever cada um com `it`):

1. **load**
   - `permission 'default'`, sem registro → `'available'`.
   - `permission 'granted'` com registro → `'active'`.
   - `permission 'denied'` com registro → `'blocked'`, chama `api.unregister` com o token gravado, `deleteToken` e limpa o registro (critério 6).
   - `ios: true` → `'ios-install'` e **não** chama `port.isSupported` (sem SDK no iPhone de fora).
   - `isSupported` false → `'unsupported'`.
2. **enable, gesto**
   - `const p = svc.enable(); expect(port.getToken).toHaveBeenCalledTimes(1); await p;` (chamada síncrona, critério 4).
3. **enable, sucesso**
   - `hostname: 'louvor-hajaluz-teste.web.app'` → `api.register` com `('tok-1', 'teste')`; `store.value` vira `{ token: 'tok-1', registeredAt: 1000 }`; retorno `'active'`.
4. **enable, negada ou dispensada**
   - `getToken` rejeita com `{ code: 'messaging/permission-blocked' }` e `permission` depois é `'default'` → `'available'` (dispensou).
   - mesmo erro e `permission` `'denied'` → `'blocked'`.
   - Nada gravado nos dois casos.
5. **enable, erro**
   - `getToken` rejeita com erro genérico → `'error'`, sem gravar.
   - `api.register` rejeita → `'error'`, sem gravar.
6. **disable**
   - com registro: `unregister` com o token, `deleteToken`, registro limpo; retorno `'available'`.
   - `unregister` rejeita → mesmo assim limpa o registro e retorna `'available'` (teto/erro não travam).
   - `unregister` nunca resolve → retorna depois de `releaseTimeoutMs` (usar `vi.useFakeTimers` ou um timeout real curto de 50 ms).
7. **forgetDevice (sair)**
   - sem registro → nenhuma chamada à API nem ao SDK.
   - com registro e `unregister` rejeitando → não lança; registro limpo.
8. **sendTest**
   - `{ sent: 1, failed: 0, pruned: 0 }` → `'sent'`.
   - `{ sent: 0, failed: 1, pruned: 0 }` → `'failed'`, registro mantido.
   - `{ sent: 0, failed: 0, pruned: 1 }` → `'failed'`, registro limpo e `deleteToken` chamado.
   - rejeição → `'failed'`.
9. **revalidate**
   - sem registro → não chama `getToken`.
   - `permission` `'default'` → não chama `getToken` (não pede permissão no app aberto).
   - mesmo token e registro recente (`registeredAt = 1000`, `now = 1000`) → não chama `register`.
   - token mudou → `register` com o novo, `unregister` com o antigo, registro com o novo token.
   - registro vencido (`now = 1000 + REGISTER_MAX_AGE_MS + 1`) com mesmo token → `register` e registro com `registeredAt` novo.
   - `getToken` rejeita → não lança, sem alterar registro.

- [ ] **Step 2: Rodar e ver falhar**

Run (em `apps/web`): `npx vitest run src/push/pushService.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar `apps/web/src/push/pushService.ts`**

```ts
import { originForHostname } from '../setlists/origin';
import type { SetlistOrigin } from '../setlists/types';
import { REGISTER_MAX_AGE_MS } from './pushRecord';
import { decideAvisos } from './pushState';
import type {
  AvisosStatus,
  PushApi,
  PushMessagingPort,
  PushRecord,
  PushRecordStore,
  PushService,
  TestStatus,
} from './types';

export interface PushServiceDeps {
  vapidKey: string;
  port: PushMessagingPort;
  api: PushApi;
  store: PushRecordStore;
  /** `window.location.hostname`: a origem é `teste` só no site de teste. */
  hostname: string;
  /** iPhone/iPad com Safari fora da tela inicial (ver `iosNotInstalled`). */
  ios: boolean;
  now?: () => number;
  warn?: (message: string, error: unknown) => void;
  /** Teto para soltar o aparelho (desativar e sair), para não travar offline. */
  releaseTimeoutMs?: number;
}

const DEFAULT_RELEASE_TIMEOUT_MS = 5000;
const FORGET_TIMEOUT_MS = 5000;

/** Resolve quando `work` termina ou depois de `ms`. Nunca lança. */
function within(work: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    work.then(done, done);
  });
}

const isPermissionBlocked = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 'messaging/permission-blocked';

export function createPushService(deps: PushServiceDeps): PushService {
  const now = deps.now ?? (() => Date.now());
  const warn = deps.warn ?? ((message: string, error: unknown) => console.warn(message, error));
  const origin: SetlistOrigin = originForHostname(deps.hostname);
  const limit = deps.releaseTimeoutMs ?? DEFAULT_RELEASE_TIMEOUT_MS;

  // Servidor e SDK. Nunca lança; o registro é limpo por quem chama.
  const releaseRemote = async (record: PushRecord): Promise<void> => {
    await deps.api
      .unregister(record.token)
      .catch((error: unknown) => warn('Falha ao remover o aparelho dos avisos', error));
    await deps.port
      .deleteToken()
      .catch((error: unknown) => warn('Falha ao apagar o token local', error));
  };

  // Sem registro, não toca no servidor nem no SDK.
  const release = async (record: PushRecord | null, ms = limit): Promise<void> => {
    if (record) await within(releaseRemote(record), ms);
    deps.store.clear();
  };

  const current = async (): Promise<AvisosStatus> =>
    decideAvisos({
      supported: deps.ios ? false : await deps.port.isSupported(),
      iosNotInstalled: deps.ios,
      permission: deps.port.permission(),
      hasRecord: deps.store.read() !== null,
    });

  return {
    async load() {
      const record = deps.store.read();
      // Permissão revogada com aparelho gravado: remove o token (o navegador não avisa).
      if (record && deps.port.permission() === 'denied') await release(record);
      return current();
    },

    async enable() {
      // Primeira ação, sem await antes: o SDK pede a permissão dentro do toque.
      let token: string;
      try {
        token = await deps.port.getToken(deps.vapidKey);
      } catch (error) {
        if (isPermissionBlocked(error)) return current(); // negada agora, ou dispensada
        warn('Falha ao obter o token de avisos', error);
        return 'error';
      }
      try {
        await deps.api.register(token, origin);
      } catch (error) {
        warn('Falha ao gravar o aparelho nos avisos', error);
        return 'error';
      }
      deps.store.write({ token, registeredAt: now() });
      return 'active';
    },

    async disable() {
      await release(deps.store.read());
      return current();
    },

    async sendTest(): Promise<TestStatus> {
      try {
        const result = await deps.api.sendTest();
        if (result.sent === 0 && result.pruned > 0) {
          // O servidor apagou o aparelho (token morto): libera o local também.
          await deps.port
            .deleteToken()
            .catch((error: unknown) => warn('Falha ao apagar o token local', error));
          deps.store.clear();
          return 'failed';
        }
        return result.sent > 0 ? 'sent' : 'failed';
      } catch (error) {
        warn('Falha ao enviar o aviso de teste', error);
        return 'failed';
      }
    },

    async revalidate() {
      const record = deps.store.read();
      if (!record || deps.port.permission() !== 'granted') return;
      try {
        // Com a permissão concedida, getToken não pergunta de novo.
        const token = await deps.port.getToken(deps.vapidKey);
        const stale = now() - record.registeredAt > REGISTER_MAX_AGE_MS;
        if (token === record.token && !stale) return;
        await deps.api.register(token, origin);
        if (token !== record.token) {
          await deps.api
            .unregister(record.token)
            .catch((error: unknown) => warn('Falha ao remover o token antigo', error));
        }
        deps.store.write({ token, registeredAt: now() });
      } catch (error) {
        warn('Falha ao revalidar o aparelho dos avisos', error);
      }
    },

    async forgetDevice() {
      await release(deps.store.read(), FORGET_TIMEOUT_MS);
    },
  };
}
```

- [ ] **Step 4: Teste (`PushProvider.test.tsx`)**

Casos: (a) membro autenticado com serviço → `revalidate` chamado uma vez; (b) viewer → não chama; (c) `service` null → não quebra e o contexto vale `null`; (d) o contexto entrega o serviço aos filhos (`useContext(PushContext)`). Usar `AuthContext.Provider` com `AuthState` (ver `MaisPage.test.tsx` como modelo).

- [ ] **Step 5: Implementar `apps/web/src/push/PushProvider.tsx`**

```tsx
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { PushContext, type PushService } from './types';

/**
 * Revalida o aparelho quando o app abre com sessão de membro ou admin (uma vez por sessão).
 * Sem serviço (sem VAPID), não faz nada. Fica dentro do AuthProvider.
 */
export function PushProvider({
  service,
  children,
}: {
  service: PushService | null;
  children: ReactNode;
}) {
  const { status, user, role } = useAuth();
  const uid = status === 'signed-in' ? user?.uid : undefined;
  const eligible = role === 'member' || role === 'admin';

  useEffect(() => {
    if (!service || !uid || !eligible) return;
    void service.revalidate();
  }, [service, uid, eligible]);

  return <PushContext.Provider value={service}>{children}</PushContext.Provider>;
}
```

- [ ] **Step 6: Rodar e ver passar; lint; commit**

Run: `npx vitest run src/push/pushService.test.ts src/push/PushProvider.test.tsx`. Esperado: PASS.

```
git add apps/web/src/push/pushService.ts apps/web/src/push/pushService.test.ts apps/web/src/push/PushProvider.tsx apps/web/src/push/PushProvider.test.tsx
git commit -m "feat(push): serviço dos avisos e revalidação ao abrir" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 7 (G3): ligação no bootstrap, App e logout

Depende das Tarefas 1, 4, 5 e 6.

**Files:** alterar `apps/web/src/bootstrap.tsx`, `apps/web/src/App.tsx`, `apps/web/src/auth/gateway.ts`, `apps/web/src/auth/gateway.test.ts`.

- [ ] **Step 1: Teste (`gateway.test.ts`, acrescentar)**

- `beforeSignOut` é chamado **antes** de `signOut(auth)` (usar um array de ordem de chamadas).
- Se `beforeSignOut` rejeita, `signOut` e `reload` ainda acontecem.

Ver como o arquivo já mocka `firebase/auth` e `firebase/firestore`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/auth/gateway.test.ts`. Esperado: FAIL.

- [ ] **Step 3: Implementar `gateway.ts`**

Assinatura:

```ts
export function createAuthGateway(
  { auth, db }: FirebaseServices,
  {
    reload = () => window.location.reload(),
    beforeSignOut,
  }: { reload?: () => void; beforeSignOut?: () => Promise<void> } = {},
): AuthGateway {
```

No `signOut`, antes de `await signOut(auth);`:

```ts
      // Antes do signOut: a callable de avisos exige sessão. Falha não impede o logout.
      try {
        await beforeSignOut?.();
      } catch (error) {
        console.warn('Falha ao desativar os avisos ao sair', error);
      }
```

- [ ] **Step 4: Implementar `bootstrap.tsx`**

Trocar o corpo do `try` de `renderApp` por (imports novos: `readPushConfig`, `createMessagingPort`, `createFakeMessagingPort`, `createPushApi`, `createPushService`, `createPushRecordStore`, `iosNotInstalled`, `localStorageOrUndefined`, `PushProvider`):

```ts
    const raw = import.meta.env as Record<string, string | undefined>;
    const env = readWebEnv(raw);
    const push = readPushConfig(raw);
    const services = createFirebase(env, { messagingSenderId: push?.messagingSenderId });
    const pushService = push
      ? createPushService({
          vapidKey: push.vapidKey,
          port:
            import.meta.env.VITE_USE_EMULATORS === 'true'
              ? createFakeMessagingPort(window)
              : createMessagingPort(services.app),
          api: createPushApi(services),
          store: createPushRecordStore(localStorageOrUndefined(window)),
          hostname: window.location.hostname,
          ios: iosNotInstalled(window),
        })
      : null;
    const gateway = createAuthGateway(services, {
      beforeSignOut: () => pushService?.forgetDevice() ?? Promise.resolve(),
    });
    const peopleApi = createPeopleApi(services);
    // ...(statsApi, catalogApi, setlistApi como estão)
```

E no `root.render`, passar `pushService={pushService}` ao `<App>`.

Atenção: `import.meta.env` tem o tipo `ImportMetaEnv`; o cast `as Record<string, string | undefined>` já existe no código; manter.

- [ ] **Step 5: Implementar `App.tsx`**

1. Import: `import { PushProvider } from './push/PushProvider';` e `import type { PushService } from './push/types';`
2. Adicionar à props de `App` (opcional, para não quebrar os testes): `pushService?: PushService | null`.
3. Envolver o conteúdo de `AuthProvider` com `<PushProvider service={pushService ?? null}>...</PushProvider>` (dentro do `AuthProvider`, por fora das rotas).

- [ ] **Step 6: Rodar e ver passar; lint e tipos**

Run (em `apps/web`): `npx vitest run src/auth/gateway.test.ts src/App.test.tsx src/bootstrap`. Esperado: PASS. Depois `npm run typecheck` e `npm run lint` (raiz).

- [ ] **Step 7: Commit**

```
git add apps/web/src/bootstrap.tsx apps/web/src/App.tsx apps/web/src/auth/gateway.ts apps/web/src/auth/gateway.test.ts
git commit -m "feat(push): liga os avisos ao app e ao logout" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 9 (G4): ambiente do E2E e teste de navegador

Depende da Tarefa 7.

**Files:** alterar `apps/web/.env.docker`, `apps/web/.env.example`; criar `e2e/avisos.spec.ts`.

- [ ] **Step 1: Variáveis de demonstração**

Acrescentar aos dois arquivos (valores fictícios, sem segredo):

```
VITE_FIREBASE_MESSAGING_SENDER_ID=demo-sender-id
VITE_FIREBASE_VAPID_KEY=demo-vapid-key
```

Em `.env.example`, comentário antes: `# Avisos (push): opcionais; sem as duas, a linha "Avisos" não aparece na aba Mais.`

- [ ] **Step 2: E2E (`e2e/avisos.spec.ts`)**

Modelo: copiar o login de membro/visitante de `e2e/people.spec.ts` e `e2e/visitor.spec.ts`, e o `openSession` de `e2e/fixtures/app.ts`. Antes de cada teste: `page.addInitScript(() => { window.__CIFRAS_PUSH_FAKE__ = { permission: 'default', answer: 'granted' }; })` (ou o estado do caso). `openSession` já usa `serviceWorkers: 'block'`.

Casos (um `test` cada):
1. Membro vê "Avisos" acima de "Pessoas" (ordem no DOM) e a linha tem "Ativar avisos neste aparelho".
2. Visitante não vê "Avisos".
3. Toque em "Ativar avisos neste aparelho" → aparece "Ativados neste aparelho" e "Enviar aviso de teste". O aviso de teste (no emulador o envio real falha) aparece em `role="status"` ou `role="alert"`; o teste aceita qualquer um, porque o teste de envio real é [A].
4. "Desativar avisos neste aparelho" (um toque, sem diálogo) → volta para "Receba repertório novo e lembrete do ensaio neste aparelho".
5. Permissão negada (`permission: 'denied'`) → "Bloqueados no navegador…" e nenhum botão de ação.
6. iPhone fora da tela inicial: `test.use({ userAgent: '<UA de iPhone com Safari>' })` → "Instale o app na tela inicial para receber avisos" e "No Safari: Compartilhar › Adicionar à Tela de Início".
7. `supported: false` → "Seu navegador não permite avisos".
8. `failEnable: true` → `role="alert"` "Não foi possível ativar os avisos. Tente de novo." e "Tentar de novo".

- [ ] **Step 3: Rodar**

Run: `npx playwright test e2e/avisos.spec.ts` (o E2E real roda no CI; localmente, se houver memória, rodar só esse arquivo). Se não for rodar local, registrar no PR "E2E: rodar no CI".

- [ ] **Step 4: Commit**

```
git add apps/web/.env.docker apps/web/.env.example e2e/avisos.spec.ts
git commit -m "test(push): estados da linha Avisos no E2E" -m "Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

## Tarefa 11: verificação final (orquestrador)

- [ ] Em `apps/web`: `npx vitest run src/push src/lib src/more src/auth build` (escopo da entrega; a suíte completa fica para o CI).
- [ ] Em `apps/functions`: `npx vitest run src/push/adminDeps.test.ts`.
- [ ] Na raiz: `npm run typecheck`, `npm run lint`, `npm run test:harness` (sem mudança em `.claude/`; confirma os tokens do design system).
- [ ] `git grep -n "Pessoas" -- apps e2e` para conferir que os testes que dependem da ordem da aba Mais continuam válidos.
- [ ] Rules: sem mudança; `npm run test:rules` **não** é obrigatório (nenhum arquivo de `firestore.rules`/`storage.rules` mudou). Confirmar com `git diff --stat`.
- [ ] `git diff --stat origin/develop` não toca `.github/`, `.claude/`, `firebase.json`, `cors.json`, `AGENTS.md`, `CLAUDE.md`.
- [ ] PR: `Parte de #85` e `Resolve #99`; corpo com "teste no celular" e o roteiro [A]:
  1. Android (Chrome, app instalado): ativar, "Enviar aviso de teste" com o app fechado, toque abre a aba (ou a origem).
  2. iPhone 16.4+ (app na tela inicial): mesmo roteiro; checar que o pedido de permissão aparece só no toque.
  3. Desativar, e confirmar que não chega mais aviso.
  4. Bloquear a permissão nas configurações do site e reabrir: "Bloqueados", sem token gravado.
  5. Tema claro e escuro, 360 px sem corte.

---

## Riscos e pontos a confirmar

1. **gstatic para 13.3.0 (P1):** se os scripts compat não existirem na versão, troca para bundle do `firebase/messaging/sw` (mais peças). Pré-voo antes da Tarefa 2.
2. **Gesto no Safari:** a porta pré-carrega no `isSupported()` do mount; o toque chama o SDK sem `await`. Confirmar no iPhone real (critério 4 do [A]).
3. **Badge e ícone via payload (D4):** depende de o FCM passar `webpush.notification.icon/badge/tag` para a notificação exibida pelo SDK. Confirmar no [A]. Se não aparecer, o fallback é `onBackgroundMessage` com `showNotification` de mesma `tag` (substitui sem alerta extra) — só se o [A] mostrar que o campo não chega.
4. **Chunk do SDK no boot:** membros com avisos ativos baixam o chunk `messaging` ao abrir o app (revalidação). Medir o tamanho do chunk; se pesar na meta de desempenho (`sistema.md`), a revalidação pode passar a rodar só no Mais.
5. **Pré-cache:** a exclusão `messaging-*` do `globIgnores` mexe no precache (não no SW nem nos caches). `pwaConfig.test.ts` cobre.
6. **Variáveis:** a linha exige as duas variáveis (D1); o build de produção só terá a linha depois que o #116 passar `VITE_FIREBASE_MESSAGING_SENDER_ID` e `VITE_FIREBASE_VAPID_KEY` ao build (`deploy.yml`, `site-teste.yml`).
7. **Texto de erro (D12):** confirmar com o designer.
8. **Functions no escopo (D4):** a Tarefa 8 toca `apps/functions`. Se o orquestrador preferir a #99 só no cliente, retirar a Tarefa 8 (exceto o asset) e abrir follow-up.

## Dúvidas para o orquestrador

- Confirmar D4 (mudança pequena em `apps/functions/src/push/adminDeps.ts` dentro da #99).
- Confirmar D1 (exigir as duas variáveis, e não só a VAPID).
- Confirmar D12 (texto muted do estado de erro).
