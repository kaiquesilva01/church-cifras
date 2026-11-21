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
