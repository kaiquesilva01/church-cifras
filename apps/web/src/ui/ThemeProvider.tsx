import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, readStoredTheme, resolveTheme, storeTheme, type Theme } from '../lib/theme';

interface ThemeValue {
  theme: Theme;
  /** Flips between light and dark and remembers the choice on this device. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function ThemeProvider({
  children,
  storage = defaultStorage(),
}: {
  children: ReactNode;
  storage?: Storage;
}) {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = resolveTheme(readStoredTheme(storage), systemPrefersDark());
    // The inline script in index.html already did this before the first paint; this keeps tests
    // and any host page without the script in sync.
    applyTheme(document, initial);
    return initial;
  });

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      storeTheme(storage, next);
      applyTheme(document, next);
      return next;
    });
  }, [storage]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme precisa estar dentro do ThemeProvider');
  return value;
}
