export type Theme = 'light' | 'dark';

/** localStorage key; the inline script in index.html reads the same one before the first paint. */
export const THEME_KEY = 'cifras.theme';

/** Browser chrome color per theme (same as `--color-bg`). */
export const THEME_COLORS: Record<Theme, string> = {
  light: '#f4f5f7',
  dark: '#0a0b0d',
};

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** The person's saved choice, or null when they never picked one (or storage is unavailable). */
export function readStoredTheme(storage: ReadableStorage | undefined): Theme | null {
  try {
    const value = storage?.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(storage: WritableStorage | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the choice just does not persist.
  }
}

/** A saved choice wins; otherwise the system setting decides. */
export function resolveTheme(stored: Theme | null, prefersDark: boolean): Theme {
  return stored ?? (prefersDark ? 'dark' : 'light');
}

/** Paints the theme: `data-theme` drives the CSS tokens, the meta tag colors the browser chrome. */
export function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}
