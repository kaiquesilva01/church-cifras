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
export function messagingSwConfig(
  env: Record<string, string | undefined>,
): MessagingSwConfig | null {
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

/** Em `vite dev` o `generateBundle` não roda: o arquivo só existe no build (`vite build`, E2E). */
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
