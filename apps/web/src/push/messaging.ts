import type { FirebaseApp } from 'firebase/app';
import type { Messaging } from 'firebase/messaging';
import type { PushMessagingPort } from './types';

export type MessagingSdk = typeof import('firebase/messaging');
type LoadSdk = () => Promise<MessagingSdk>;

interface Loaded {
  sdk: MessagingSdk;
  messaging: Messaging | null;
}

/**
 * Porta real sobre `firebase/messaging`. O módulo entra sob demanda (`loadSdk` é injetável nos testes).
 * Duas causas separadas: falha de carga rejeita (vira erro na linha); `false` só quando o SDK diz que
 * o navegador não suporta. `isSupported()` no mount deixa tudo pronto: `getToken` chama o SDK sem nenhum
 * `await` antes, e o pedido de permissão acontece dentro do toque em Ativar (exigência do Safari).
 * Sem assinatura de mensagens em primeiro plano: com o app aberto nenhum aviso aparece (critério 11).
 */
export function createMessagingPort(
  app: FirebaseApp,
  loadSdk: LoadSdk = () => import('firebase/messaging'),
): PushMessagingPort {
  let loaded: Loaded | undefined;
  // Não guarda a falha: a próxima chamada tenta a carga de novo.
  const prepare = async (): Promise<Loaded> => {
    const sdk = await loadSdk();
    loaded = { sdk, messaging: (await sdk.isSupported()) ? sdk.getMessaging(app) : null };
    return loaded;
  };

  return {
    async isSupported() {
      const current = loaded ?? (await prepare());
      return current.messaging !== null;
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
