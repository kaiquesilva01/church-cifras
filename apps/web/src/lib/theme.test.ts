import { describe, expect, it } from 'vitest';
import {
  THEME_COLORS,
  THEME_KEY,
  applyTheme,
  readStoredTheme,
  resolveTheme,
  storeTheme,
} from './theme';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('readStoredTheme', () => {
  it('returns the saved choice when it is valid', () => {
    expect(readStoredTheme(memoryStorage({ [THEME_KEY]: 'dark' }))).toBe('dark');
    expect(readStoredTheme(memoryStorage({ [THEME_KEY]: 'light' }))).toBe('light');
  });

  it('ignores missing or invalid values', () => {
    expect(readStoredTheme(memoryStorage())).toBeNull();
    expect(readStoredTheme(memoryStorage({ [THEME_KEY]: 'sepia' }))).toBeNull();
  });

  it('survives a storage that throws (private mode)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readStoredTheme(broken)).toBeNull();
    expect(() => storeTheme(broken, 'dark')).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('prefers the saved choice over the system setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the system when nothing was saved', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });
});

describe('storeTheme', () => {
  it('saves the choice under the shared key', () => {
    const storage = memoryStorage();
    storeTheme(storage, 'dark');
    expect(storage.getItem(THEME_KEY)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('sets data-theme on <html> and the browser chrome color', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
    applyTheme(document, 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLORS.dark,
    );
    applyTheme(document, 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      THEME_COLORS.light,
    );
  });

  it('works when the page has no theme-color meta', () => {
    document.head.innerHTML = '';
    expect(() => applyTheme(document, 'light')).not.toThrow();
  });
});
