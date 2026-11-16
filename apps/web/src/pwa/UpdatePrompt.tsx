import { useRegisterSW } from 'virtual:pwa-register/react';

export type UseRegister = () => {
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
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegister();
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
