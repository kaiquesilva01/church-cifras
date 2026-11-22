import { describe, expect, it } from 'vitest';
import { decideAvisos, iosNotInstalled } from './pushState';

const base = {
  supported: true,
  iosNotInstalled: false,
  permission: 'default' as const,
  hasRecord: false,
};

describe('decideAvisos', () => {
  it.each([
    [{}, 'available'],
    [{ permission: 'granted' as const, hasRecord: true }, 'active'],
    [{ permission: 'granted' as const, hasRecord: false }, 'available'],
    [{ permission: 'denied' as const }, 'blocked'],
    [{ permission: 'denied' as const, hasRecord: true }, 'blocked'],
    [{ supported: false }, 'unsupported'],
    [{ permission: 'unsupported' as const }, 'unsupported'],
    [{ iosNotInstalled: true, supported: false }, 'ios-install'],
    [{ iosNotInstalled: true, permission: 'denied' as const }, 'ios-install'],
  ])('decides from %o', (overrides, expected) => {
    expect(decideAvisos({ ...base, ...overrides })).toBe(expected);
  });
});

describe('iosNotInstalled', () => {
  const win = (userAgent: string, standalone: boolean) =>
    ({
      navigator: { userAgent, maxTouchPoints: 0, standalone },
      matchMedia: () => ({ matches: false }),
    }) as unknown as Window;
  const safari =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

  it('is true for iPhone Safari outside the home screen', () => {
    expect(iosNotInstalled(win(safari, false))).toBe(true);
  });
  it('is false inside the home screen app and on other browsers', () => {
    expect(iosNotInstalled(win(safari, true))).toBe(false);
    expect(iosNotInstalled(win('Mozilla/5.0 (Windows NT 10.0) Chrome/120', false))).toBe(false);
  });
});
