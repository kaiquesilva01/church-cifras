import { vi } from 'vitest';
import type { BeforeInstallPromptEvent } from '../pwa/installPromptStore';

export const DAY = 24 * 60 * 60 * 1000;
/** 21/11/2026 às 12:00 UTC. */
export const NOW = Date.UTC(2026, 10, 21, 12);

export const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
export const IPAD_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
export const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1';
export const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Evento `beforeinstallprompt` sintético. `rejected` = `prompt()` falha (sem gesto do usuário). */
export function fakeInstallEvent(
  outcome: 'accepted' | 'dismissed' | 'rejected' = 'accepted',
): BeforeInstallPromptEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt =
    outcome === 'rejected'
      ? vi.fn(() => Promise.reject(new Error('sem gesto do usuário')))
      : vi.fn(() => Promise.resolve());
  const choice = outcome === 'rejected' ? 'dismissed' : outcome;
  return Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome: choice, platform: 'web' }),
  }) as BeforeInstallPromptEvent;
}

/** Storage em memória, com o mesmo formato de `Storage` que o código usa. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}
