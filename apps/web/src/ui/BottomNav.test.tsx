import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PadContext, type PadContextValue } from '../pad/usePad';
import { BottomNav } from './BottomNav';

function pad(status: PadContextValue['status']): PadContextValue {
  return {
    status,
    note: status === 'playing' ? 'G' : null,
    owner: null,
    volume: 0.6,
    notice: null,
    cachedNotes: new Set(),
    toggle: vi.fn(),
    follow: vi.fn(),
    setVolume: vi.fn(),
    prefetch: vi.fn(),
  };
}

function renderNav(value: PadContextValue | null) {
  return render(
    <MemoryRouter>
      <PadContext.Provider value={value}>
        <BottomNav active="musicas" />
      </PadContext.Provider>
    </MemoryRouter>,
  );
}

describe('BottomNav', () => {
  it('links the five tabs and marks the active one', () => {
    render(
      <MemoryRouter>
        <BottomNav active="pad" />
      </MemoryRouter>,
    );
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    const links = nav.querySelectorAll('a');
    expect([...links].map((a) => a.getAttribute('href'))).toEqual([
      '/',
      '/?aba=repertorios',
      '/busca',
      '/pad',
      '/mais',
    ]);
    expect(screen.getByRole('link', { name: 'Pad' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Músicas' })).not.toHaveAttribute('aria-current');
  });

  it('shows a green dot on the Pad tab while the pad plays, on any screen', () => {
    const { container } = renderNav(pad('playing'));
    const tab = screen.getByRole('link', { name: 'Pad, tocando' });
    expect(tab).toHaveAttribute('href', '/pad');
    expect(tab.querySelector('.bottom-nav-dot')).not.toBeNull();
    expect(container.querySelectorAll('.bottom-nav-dot')).toHaveLength(1);
  });

  it.each(['off', 'loading', 'error'] as const)('has no dot while the pad is %s', (status) => {
    const { container } = renderNav(pad(status));
    expect(container.querySelector('.bottom-nav-dot')).toBeNull();
    expect(screen.getByRole('link', { name: 'Pad' })).toBeInTheDocument();
  });

  it('has no dot without a pad provider', () => {
    const { container } = renderNav(null);
    expect(container.querySelector('.bottom-nav-dot')).toBeNull();
  });
});
