import type { PushMessagingPort } from './types';

/** Controle dos testes E2E, definido por `addInitScript` em `window.__CIFRAS_PUSH_FAKE__`. */
export interface FakePushControl {
  /** Padrão true. */
  supported?: boolean;
  /** Permissão inicial da aba; padrão 'default'. Uma resposta já dada na aba tem precedência. */
  permission?: NotificationPermission;
  /** Resposta do "diálogo" quando a permissão está em 'default'; padrão 'granted'. */
  answer?: 'granted' | 'denied';
  /** `getToken` falha (estado de erro). */
  failEnable?: boolean;
  /** Token devolvido; padrão 'fake-token-e2e'. */
  token?: string;
}

declare global {
  interface Window {
    __CIFRAS_PUSH_FAKE__?: FakePushControl;
  }
}

/** Chave da aba: a resposta sobrevive ao reload da página (o E2E recarrega). */
export const FAKE_PERMISSION_KEY = '__cifras_push_fake_permission__';

/** Só o build de emuladores (VITE_USE_EMULATORS=true) usa esta porta; nunca a de produção. */
export function createFakeMessagingPort(win: Window): PushMessagingPort {
  const control = (): FakePushControl => win.__CIFRAS_PUSH_FAKE__ ?? {};
  let permission: NotificationPermission =
    (win.sessionStorage.getItem(FAKE_PERMISSION_KEY) as NotificationPermission | null) ??
    control().permission ??
    'default';
  const setPermission = (next: NotificationPermission) => {
    permission = next;
    win.sessionStorage.setItem(FAKE_PERMISSION_KEY, next);
  };
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
      if (permission === 'default') setPermission(current.answer ?? 'granted');
      if (permission !== 'granted') {
        throw Object.assign(new Error('permissão negada'), {
          code: 'messaging/permission-blocked',
        });
      }
      return current.token ?? 'fake-token-e2e';
    },
    async deleteToken() {},
  };
}
