import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { applyTheme, readStoredTheme, resolveTheme, storeTheme, type Theme } from '../lib/theme';

interface ThemeValue {
  theme: Theme;
  /** Flips between light and dark and remembers the choice on this device. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function defaultStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function systemMedia(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

export function ThemeProvider({
  children,
  storage = defaultStorage(),
}: {
  children: ReactNode;
  storage?: Storage;
}) {
  // `chosen` is what the person picked (null = never picked); the system setting only matters then.
  const [chosen, setChosen] = useState<Theme | null>(() => readStoredTheme(storage));
  const [systemDark, setSystemDark] = useState(() => systemMedia()?.matches ?? false);
  const theme = resolveTheme(chosen, systemDark);

  // Someone who never picked a theme follows the OS while the app is open (e.g. dark at sunset).
  useEffect(() => {
    const media = systemMedia();
    if (!media) return;
    const onChange = (): void => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // The single place that paints. The inline script in index.html did the same before the first
  // frame; this keeps hosts without the script (tests) and later changes in sync.
  useLayoutEffect(() => {
    applyTheme(document, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    storeTheme(storage, next);
    setChosen(next);
  }, [theme, storage]);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme precisa estar dentro do ThemeProvider');
  return value;
}
