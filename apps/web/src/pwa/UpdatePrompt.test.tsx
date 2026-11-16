import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: vi.fn() }));

import { UpdatePrompt, type UseRegister } from './UpdatePrompt';

function register(needRefresh: boolean) {
  const updateServiceWorker = vi.fn(() => Promise.resolve());
  const update = vi.fn(() => Promise.resolve());
  const onRegisteredSW: { current?: (url: string, reg?: { update(): Promise<void> }) => void } = {};
  const useRegister: UseRegister = (options) => {
    onRegisteredSW.current = options?.onRegisteredSW;
    return { needRefresh: [needRefresh, vi.fn()], updateServiceWorker };
  };
  const registered = () => onRegisteredSW.current?.('/sw.js', { update });
  return { useRegister, updateServiceWorker, update, registered };
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

  it('checks for a new service worker every hour and when the tab becomes visible', () => {
    vi.useFakeTimers();
    try {
      const { useRegister, update, registered } = register(false);
      const view = render(<UpdatePrompt useRegister={useRegister} />);
      act(() => registered());
      expect(update).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(60 * 60 * 1000));
      expect(update).toHaveBeenCalledTimes(1);
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(update).toHaveBeenCalledTimes(2);
      view.unmount();
      act(() => vi.advanceTimersByTime(2 * 60 * 60 * 1000));
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
      expect(update).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders nothing while there is no new version', () => {
    const { useRegister } = register(false);
    const { container } = render(<UpdatePrompt useRegister={useRegister} />);
    expect(container).toBeEmptyDOMElement();
  });
});
