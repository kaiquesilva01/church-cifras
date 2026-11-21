import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { InstallEnvironment } from './installPolicy';
import { INSTALL_RECORD_KEY } from './installPolicy';
import { createInstallPromptStore } from './installPromptStore';
import { useInstallPrompt } from './useInstallPrompt';
import {
  ANDROID_CHROME,
  DAY,
  IPHONE_SAFARI,
  NOW,
  fakeInstallEvent,
  memoryStorage,
} from '../test/installFixtures';

const ANDROID: InstallEnvironment = {
  userAgent: ANDROID_CHROME,
  maxTouchPoints: 5,
  displayModeStandalone: false,
  navigatorStandalone: false,
};
const IPHONE: InstallEnvironment = { ...ANDROID, userAgent: IPHONE_SAFARI };
const STANDALONE: InstallEnvironment = { ...IPHONE, displayModeStandalone: true };

function setup(options: {
  environment?: InstallEnvironment;
  storage?: ReturnType<typeof memoryStorage> | undefined;
  now?: number;
}) {
  const target = new EventTarget();
  const store = createInstallPromptStore(target);
  const storage = 'storage' in options ? options.storage : memoryStorage();
  const view = renderHook(() =>
    useInstallPrompt({
      store,
      storage,
      environment: options.environment ?? ANDROID,
      now: () => options.now ?? NOW,
    }),
  );
  return { target, storage, ...view };
}

describe('useInstallPrompt', () => {
  it('stays hidden until the event arrives, then shows the native install prompt', () => {
    const { result, target } = setup({});
    expect(result.current.card).toBe('hidden');
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('prompt');
  });

  it('install() opens the native dialog once and hides the card when accepted', async () => {
    const { result, target, storage } = setup({});
    const event = fakeInstallEvent('accepted');
    act(() => void target.dispatchEvent(event));
    await act(async () => {
      await result.current.install();
    });
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBeUndefined();
  });

  it('a refused native dialog counts as "Agora não": hidden for 30 days', async () => {
    const { result, target, storage } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent('dismissed')));
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBe(JSON.stringify({ dismissedAt: NOW }));
  });

  it('a failing prompt() hides the card without writing anything', async () => {
    const { result, target, storage } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent('rejected')));
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
    expect(storage?.map.get(INSTALL_RECORD_KEY)).toBeUndefined();
  });

  it('install() without an event does nothing', async () => {
    const { result } = setup({});
    await act(async () => {
      await result.current.install();
    });
    expect(result.current.card).toBe('hidden');
  });

  it('shows the iOS instructions on Safari without any event', () => {
    const { result } = setup({ environment: IPHONE });
    expect(result.current.card).toBe('ios');
  });

  it('"Agora não" hides the card, and the dismissal survives a remount', () => {
    const { result, storage, unmount } = setup({ environment: IPHONE });
    act(() => result.current.dismiss());
    expect(result.current.card).toBe('hidden');
    unmount();

    const again = renderHook(() =>
      useInstallPrompt({
        store: createInstallPromptStore(new EventTarget()),
        storage,
        environment: IPHONE,
        now: () => NOW + 29 * DAY,
      }),
    );
    expect(again.result.current.card).toBe('hidden');
    again.unmount();

    const later = renderHook(() =>
      useInstallPrompt({
        store: createInstallPromptStore(new EventTarget()),
        storage,
        environment: IPHONE,
        now: () => NOW + 31 * DAY,
      }),
    );
    expect(later.result.current.card).toBe('ios');
  });

  it('never shows in the installed app, even with the event or on iOS', () => {
    const { result, target } = setup({ environment: STANDALONE });
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('hidden');
  });

  it('appinstalled hides the card for the rest of the session', () => {
    const { result, target } = setup({});
    act(() => void target.dispatchEvent(fakeInstallEvent()));
    expect(result.current.card).toBe('prompt');
    act(() => void target.dispatchEvent(new Event('appinstalled')));
    expect(result.current.card).toBe('hidden');
  });

  it('without storage the card still shows, and "Agora não" hides it for the session', () => {
    const { result } = setup({ environment: IPHONE, storage: undefined });
    expect(result.current.card).toBe('ios');
    expect(() => act(() => result.current.dismiss())).not.toThrow();
    expect(result.current.card).toBe('hidden');
  });
});
