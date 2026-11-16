import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

interface Registration {
  update(): Promise<void>;
}

export type UseRegister = (options?: {
  onRegisteredSW?: (url: string, registration?: Registration) => void;
}) => {
  needRefresh: [boolean, unknown];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
};

// `registerType: 'prompt'`: a new build waits until the person agrees, so a cifra open on stage is
// never swapped under their hands.
export function UpdatePrompt({
  useRegister = useRegisterSW as UseRegister,
}: {
  useRegister?: UseRegister;
}) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegister({ onRegisteredSW: (_url, reg) => setRegistration(reg ?? null) });

  // A tab left open for days would never notice a deploy: ask the browser to look for a new worker
  // every hour and whenever the person comes back to the tab.
  useEffect(() => {
    if (!registration) return;
    const check = () => void registration.update().catch(() => undefined);
    const timer = setInterval(check, UPDATE_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [registration]);
  if (!needRefresh) return null;
  return (
    <div role="status" className="update-prompt">
      <span>Nova versão disponível.</span>
      <button type="button" onClick={() => void updateServiceWorker(true)}>
        Atualizar
      </button>
    </div>
  );
}
