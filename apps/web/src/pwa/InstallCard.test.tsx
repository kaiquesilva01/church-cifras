import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstallCard } from './InstallCard';
import type { InstallCardState } from './useInstallPrompt';

function fakeHook(card: InstallCardState['card']) {
  const install = vi.fn(() => Promise.resolve());
  const dismiss = vi.fn();
  return {
    install,
    dismiss,
    useInstall: (): InstallCardState => ({ card, install, dismiss }),
  };
}

describe('InstallCard', () => {
  it('offers the native install with "Adicionar" and dismisses with "Agora não"', () => {
    const hook = fakeHook('prompt');
    render(<InstallCard useInstall={hook.useInstall} />);
    expect(screen.getByRole('region', { name: 'Cifras como app' })).toBeInTheDocument();
    expect(screen.getByText('Abra direto da tela inicial')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(hook.install).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(hook.dismiss).toHaveBeenCalledTimes(1);
  });

  it('on iPhone Safari shows the instructions and no install button', () => {
    const hook = fakeHook('ios');
    render(<InstallCard useInstall={hook.useInstall} />);
    expect(
      screen.getByText('Toque em Compartilhar e depois em Adicionar à Tela de Início'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('hidden').useInstall} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('usa o cartão compartilhado (.convite)', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('prompt').useInstall} />);
    expect(container.querySelector('section.convite')).not.toBeNull();
    expect(container.querySelector('[class*="install-card"]')).toBeNull();
  });

  it('uses the app icon as a decorative image', () => {
    const { container } = render(<InstallCard useInstall={fakeHook('prompt').useInstall} />);
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('src', '/icons/icon.svg');
    expect(logo).toHaveAttribute('alt', '');
  });
});
