import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { THEME_KEY } from '../lib/theme';
import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    delete document.documentElement.dataset.theme;
  });

  it('starts from the saved theme and offers the opposite', () => {
    render(
      <ThemeProvider storage={memoryStorage({ [THEME_KEY]: 'dark' })}>
        <ThemeToggle />
      </ThemeProvider>,
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Mudar para o tema claro' })).toBeInTheDocument();
  });

  it('flips the theme, repaints the page and remembers the choice', () => {
    const storage = memoryStorage({ [THEME_KEY]: 'light' });
    render(
      <ThemeProvider storage={storage}>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o tema escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(storage.getItem(THEME_KEY)).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(storage.getItem(THEME_KEY)).toBe('light');
  });
});
