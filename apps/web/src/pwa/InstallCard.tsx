import { ConviteCard } from '../ui/ConviteCard';
import { useInstallPrompt, type InstallCardState } from './useInstallPrompt';

export type UseInstallCard = () => InstallCardState;

// Mesmo padrão de UpdatePrompt: o hook entra por parâmetro, então o componente testa sem storage nem evento.
export function InstallCard({ useInstall = useInstallPrompt }: { useInstall?: UseInstallCard }) {
  const { card, install, dismiss } = useInstall();
  if (card === 'hidden') return null;
  return (
    <ConviteCard
      icon={<img src="/icons/icon.svg" alt="" width={48} height={48} />}
      title="Cifras como app"
      hint={
        card === 'prompt'
          ? 'Abra direto da tela inicial'
          : 'Toque em Compartilhar e depois em Adicionar à Tela de Início'
      }
      onClose={dismiss}
      action={card === 'prompt' ? { label: 'Adicionar', onClick: () => void install() } : undefined}
    />
  );
}
