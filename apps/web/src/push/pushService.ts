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

  // Servidor e SDK em paralelo: o token local sai mesmo se o servidor não responder.
  // Nunca lança; o registro é limpo por quem chama.
  const releaseRemote = async (record: PushRecord): Promise<void> => {
    await Promise.all([
      deps.api
        .unregister(record.token)
        .catch((error: unknown) => warn('Falha ao remover o aparelho dos avisos', error)),
      deps.port
        .deleteToken()
        .catch((error: unknown) => warn('Falha ao apagar o token local', error)),
    ]);
  };

  // Sem registro, não toca no servidor nem no SDK. Lê e limpa o registro de forma síncrona,
  // antes de qualquer await: uma gravação feita durante a espera do servidor não é apagada.
  const release = async (): Promise<void> => {
    const record = deps.store.read();
    deps.store.clear();
    if (record) await within(releaseRemote(record), limit);
  };

  const current = async (): Promise<AvisosStatus> =>
    decideAvisos({
      supported: deps.ios ? false : await deps.port.isSupported(),
      iosNotInstalled: deps.ios,
      permission: deps.port.permission(),
      hasRecord: deps.store.read() !== null,
    });

  // Estado de repouso que nunca lança: falha do SDK vira 'error'.
  const settle = async (): Promise<AvisosStatus> => {
    try {
      return await current();
    } catch (error) {
      warn('Falha ao carregar o estado dos avisos', error);
      return 'error';
    }
  };

  return {
    async load() {
      try {
        // Permissão revogada (ou resetada para 'default') com aparelho gravado: remove o token,
        // porque o navegador não avisa. Sem registro, nada é tocado.
        const permission = deps.port.permission();
        if (deps.store.read() && (permission === 'denied' || permission === 'default')) {
          await release();
        }
        return await current();
      } catch (error) {
        // Falha de carga do SDK é erro, não "sem suporte".
        warn('Falha ao carregar o estado dos avisos', error);
        return 'error';
      }
    },

    async enable() {
      // Primeira ação, sem await antes: o SDK pede a permissão dentro do toque.
      let token: string;
      try {
        token = await deps.port.getToken(deps.vapidKey);
      } catch (error) {
        if (isPermissionBlocked(error)) return settle(); // negada agora, ou dispensada
        warn('Falha ao obter o token de avisos', error);
        return 'error';
      }
      try {
        await deps.api.register(token, origin);
      } catch (error) {
        warn('Falha ao gravar o aparelho nos avisos', error);
        return 'error';
      }
      // Lê o registro depois do getToken: pode ter mudado enquanto o SDK respondia.
      const previous = deps.store.read();
      deps.store.write({ token, registeredAt: now() });
      if (previous && previous.token !== token) {
        // Best-effort e sem await: o token antigo sai do servidor sem segurar a linha em "Ativando…".
        void deps.api
          .unregister(previous.token)
          .catch((error: unknown) => warn('Falha ao remover o token antigo', error));
      }
      return 'active';
    },

    async disable() {
      await release();
      return settle();
    },

    async sendTest(): Promise<TestStatus> {
      try {
        const result = await deps.api.sendTest();
        if (result.sent === 0 && result.pruned > 0 && result.failed === 0) {
          // O servidor apagou o aparelho (token morto): libera o local também.
          // Limpa antes de esperar o SDK: nada de await entre a decisão e a escrita.
          deps.store.clear();
          await deps.port
            .deleteToken()
            .catch((error: unknown) => warn('Falha ao apagar o token local', error));
          return 'failed';
        }
        return result.sent > 0 ? 'sent' : 'failed';
      } catch (error) {
        warn('Falha ao enviar o aviso de teste', error);
        return 'failed';
      }
    },

    async revalidate() {
      try {
        const record = deps.store.read();
        // Permissão 'denied' não remove o token aqui: ele sai em load(), ao abrir a aba Mais (D18).
        if (!record || deps.port.permission() !== 'granted') return;
        // Com a permissão concedida, getToken não pergunta de novo.
        const token = await deps.port.getToken(deps.vapidKey);
        // Desativado ou trocado enquanto o SDK respondia: não registra.
        const latest = deps.store.read();
        if (!latest || latest.token !== record.token) return;
        const stale = now() - record.registeredAt > REGISTER_MAX_AGE_MS;
        if (token === record.token && !stale) return;
        await deps.api.register(token, origin);
        // Desativado ou trocado durante o register: não regrava. Se foi desativado, desfaz o registro novo.
        const after = deps.store.read();
        if (!after) {
          await deps.api
            .unregister(token)
            .catch((error: unknown) => warn('Falha ao remover o aparelho dos avisos', error));
          return;
        }
        if (after.token !== record.token) return;
        // Sem await entre a checagem acima e a escrita: o resto não decide a escrita.
        deps.store.write({ token, registeredAt: now() });
        if (token !== record.token) {
          // Best-effort e sem await: o token antigo sai do servidor sem segurar a revalidação.
          void deps.api
            .unregister(record.token)
            .catch((error: unknown) => warn('Falha ao remover o token antigo', error));
        }
      } catch (error) {
        warn('Falha ao revalidar o aparelho dos avisos', error);
      }
    },

    async forgetDevice() {
      await release();
    },
  };
}
