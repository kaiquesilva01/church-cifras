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
