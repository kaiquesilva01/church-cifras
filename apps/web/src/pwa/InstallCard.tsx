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
      <button
        type="button"
        className="install-card__close"
        aria-label="Agora não"
        onClick={dismiss}
      >
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
