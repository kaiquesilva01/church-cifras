import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { BottomNav } from './BottomNav';

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
});
