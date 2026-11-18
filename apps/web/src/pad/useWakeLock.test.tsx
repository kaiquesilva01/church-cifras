import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

class FakeSentinel extends EventTarget {
  release = vi.fn(async () => {
    this.dispatchEvent(new Event('release'));
  });
}

let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  sentinels = [];
  request = vi.fn(async () => {
    const s = new FakeSentinel();
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('requests the screen lock when active and releases it when turned off', async () => {
    const { rerender } = renderHook(({ a }) => useWakeLock(a), { initialProps: { a: true } });
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('screen');
    rerender({ a: false });
    await flush();
    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1);
  });

  it('does not request while inactive', async () => {
    renderHook(() => useWakeLock(false));
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('releases on unmount', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    unmount();
    await flush();
    expect(sentinels[0]?.release).toHaveBeenCalledTimes(1);
  });

  it('releases a sentinel that resolves after the pad was turned off', async () => {
    let resolve!: (s: FakeSentinel) => void;
    request.mockImplementationOnce(() => new Promise<FakeSentinel>((r) => (resolve = r)));
    const { rerender } = renderHook(({ a }) => useWakeLock(a), { initialProps: { a: true } });
    rerender({ a: false });
    const late = new FakeSentinel();
    resolve(late);
    await flush();
    expect(late.release).toHaveBeenCalledTimes(1);
  });

  it('re-acquires when the tab becomes visible after the browser released it', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    sentinels[0]?.dispatchEvent(new Event('release'));
    setVisibility('hidden');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not request again on visibilitychange while the lock is still held', async () => {
    renderHook(() => useWakeLock(true));
    await flush();
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not re-acquire on visibilitychange when inactive', async () => {
    renderHook(() => useWakeLock(false));
    setVisibility('visible');
    await flush();
    expect(request).not.toHaveBeenCalled();
  });

  it('does not throw without navigator.wakeLock', async () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await flush();
  });

  it('swallows a rejected request silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    request.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await flush();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('swallows a rejected release', async () => {
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    sentinels[0]?.release.mockRejectedValueOnce(new Error('boom'));
    expect(() => unmount()).not.toThrow();
    await flush();
  });
});
