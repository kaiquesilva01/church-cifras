import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }));

import { UpdatePrompt, type UseRegister } from './UpdatePrompt';

function register(needRefresh: boolean) {
  const updateServiceWorker = vi.fn(() => Promise.resolve());
  const useRegister: UseRegister = () => ({
    needRefresh: [needRefresh, vi.fn()],
    updateServiceWorker,
  });
  return { useRegister, updateServiceWorker };
}

describe('UpdatePrompt', () => {
  it('shows update prompt and reloads on Atualizar', () => {
    const { useRegister, updateServiceWorker } = register(true);
    render(<UpdatePrompt useRegister={useRegister} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nova versão disponível.');
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    // true = activate the waiting worker and reload the page.
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('renders nothing while there is no new version', () => {
    const { useRegister } = register(false);
    const { container } = render(<UpdatePrompt useRegister={useRegister} />);
    expect(container).toBeEmptyDOMElement();
  });
});
