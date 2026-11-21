import { describe, expect, it, vi } from 'vitest';
import { createInstallPromptStore } from './installPromptStore';

function newTarget() {
  return new EventTarget();
}

describe('createInstallPromptStore', () => {
  it('keeps beforeinstallprompt and cancels the browser mini-infobar', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(store.getSnapshot().event).toBe(event);
  });

  it('notifies subscribers, and keeps the same snapshot until something changes', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(first);

    unsubscribe();
    target.dispatchEvent(new Event('appinstalled'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('consume hands the event out once', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    expect(store.consume()).not.toBeNull();
    expect(store.consume()).toBeNull();
    expect(store.getSnapshot().event).toBeNull();
  });

  it('appinstalled marks the app as installed and drops any pending event', () => {
    const target = newTarget();
    const store = createInstallPromptStore(target);
    target.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true }));
    target.dispatchEvent(new Event('appinstalled'));
    expect(store.getSnapshot()).toMatchObject({ event: null, installed: true });
  });
});
