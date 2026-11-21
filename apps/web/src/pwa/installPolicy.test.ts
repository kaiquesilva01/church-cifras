import { describe, expect, it } from 'vitest';
import {
  DISMISS_MS,
  INSTALL_RECORD_KEY,
  decideInstallCard,
  isIosSafari,
  isStandalone,
  localStorageOrUndefined,
  readInstallEnvironment,
  readInstallRecord,
  writeInstallRecord,
} from './installPolicy';
import {
  DAY,
  IPAD_SAFARI,
  IPHONE_CHROME,
  IPHONE_SAFARI,
  ANDROID_CHROME,
  NOW,
  memoryStorage,
} from '../test/installFixtures';

const base = {
  iosSafari: false,
  standalone: false,
  installed: false,
  dismissedAt: null,
  now: NOW,
  hasPrompt: false,
};

describe('decideInstallCard', () => {
  it('shows the native install button when the browser offered the event (Android/Chromium)', () => {
    expect(decideInstallCard({ ...base, hasPrompt: true })).toBe('prompt');
  });

  it('shows the iOS instructions on Safari, with no event involved', () => {
    expect(decideInstallCard({ ...base, iosSafari: true })).toBe('ios');
  });

  it('shows nothing where there is no event and it is not iOS Safari (ex.: Firefox Android)', () => {
    expect(decideInstallCard(base)).toBe('hidden');
  });

  it('never shows in the installed app or after appinstalled', () => {
    for (const extra of [{ standalone: true }, { installed: true }]) {
      expect(decideInstallCard({ ...base, ...extra, hasPrompt: true })).toBe('hidden');
      expect(decideInstallCard({ ...base, ...extra, iosSafari: true })).toBe('hidden');
    }
  });

  it('stays hidden for 30 days after a dismissal, then comes back', () => {
    const dismissed = { ...base, hasPrompt: true };
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 29 * DAY })).toBe('hidden');
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 30 * DAY })).toBe('prompt');
    expect(decideInstallCard({ ...dismissed, dismissedAt: NOW - 31 * DAY })).toBe('prompt');
  });

  it('ignores a dismissal dated in the future (clock moved back)', () => {
    expect(decideInstallCard({ ...base, hasPrompt: true, dismissedAt: NOW + DAY })).toBe('prompt');
  });

  it('uses 30 days for the dismissal window', () => {
    expect(DISMISS_MS).toBe(30 * DAY);
  });
});

describe('platform detection', () => {
  const env = (userAgent: string, maxTouchPoints = 0) => ({ userAgent, maxTouchPoints });

  it('recognizes Safari on iPhone and on iPad (which reports itself as a Mac with touch)', () => {
    expect(isIosSafari(env(IPHONE_SAFARI, 5))).toBe(true);
    expect(isIosSafari(env(IPAD_SAFARI, 5))).toBe(true);
  });

  it('does not treat a desktop Mac as iOS', () => {
    expect(isIosSafari(env(IPAD_SAFARI, 0))).toBe(false);
  });

  it('leaves other iOS browsers out (Chrome, Firefox)', () => {
    expect(isIosSafari(env(IPHONE_CHROME, 5))).toBe(false);
    expect(isIosSafari(env(IPHONE_CHROME.replace('CriOS', 'FxiOS'), 5))).toBe(false);
  });

  it('does not treat Android Chrome as iOS', () => {
    expect(isIosSafari(env(ANDROID_CHROME, 5))).toBe(false);
  });
});

describe('readInstallEnvironment', () => {
  function fakeWindow(modes: string[], standalone?: boolean): Window {
    return {
      matchMedia: (query: string) => ({
        matches: modes.some((mode) => query === `(display-mode: ${mode})`),
      }),
      navigator: { userAgent: 'UA', maxTouchPoints: 0, standalone },
    } as unknown as Window;
  }

  it('reads the display mode and navigator.standalone', () => {
    expect(readInstallEnvironment(fakeWindow(['standalone']))).toMatchObject({
      displayModeStandalone: true,
      navigatorStandalone: false,
    });
    expect(readInstallEnvironment(fakeWindow([], true))).toMatchObject({
      navigatorStandalone: true,
    });
    expect(isStandalone(readInstallEnvironment(fakeWindow(['browser'])))).toBe(false);
  });

  it('counts fullscreen and minimal-ui as installed windows', () => {
    expect(isStandalone(readInstallEnvironment(fakeWindow(['fullscreen'])))).toBe(true);
    expect(isStandalone(readInstallEnvironment(fakeWindow(['minimal-ui'])))).toBe(true);
  });

  it('works without matchMedia (jsdom and old browsers)', () => {
    const win = { navigator: { userAgent: 'UA', maxTouchPoints: 0 } } as unknown as Window;
    expect(readInstallEnvironment(win).displayModeStandalone).toBe(false);
  });
});

describe('install record storage', () => {
  it('reads "never dismissed" when storage is missing, blocked, or holds junk', () => {
    expect(readInstallRecord(undefined)).toEqual({ dismissedAt: null });
    expect(
      readInstallRecord({
        getItem: () => {
          throw new Error('denied');
        },
      }),
    ).toEqual({ dismissedAt: null });
    expect(readInstallRecord({ getItem: () => '{não é json' })).toEqual({ dismissedAt: null });
    expect(readInstallRecord({ getItem: () => JSON.stringify({ dismissedAt: 'ontem' }) })).toEqual({
      dismissedAt: null,
    });
  });

  it('round-trips the dismissal under the versioned key', () => {
    const storage = memoryStorage();
    writeInstallRecord(storage, { dismissedAt: NOW });
    expect(storage.map.get(INSTALL_RECORD_KEY)).toBe(JSON.stringify({ dismissedAt: NOW }));
    expect(readInstallRecord(storage)).toEqual({ dismissedAt: NOW });
  });

  it('keeps the key versioned', () => {
    expect(INSTALL_RECORD_KEY).toBe('cifras.installCard.v1');
  });

  it('a write that throws, or missing storage, never breaks the app', () => {
    expect(() =>
      writeInstallRecord(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        { dismissedAt: NOW },
      ),
    ).not.toThrow();
    expect(() => writeInstallRecord(undefined, { dismissedAt: NOW })).not.toThrow();
  });

  it('hides a localStorage that throws on access (privacy modes)', () => {
    const win = {} as Window;
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
    expect(localStorageOrUndefined(win)).toBeUndefined();
  });
});
