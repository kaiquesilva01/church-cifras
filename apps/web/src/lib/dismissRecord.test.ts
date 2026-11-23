import { describe, expect, it } from 'vitest';
import { DISMISS_MS, isDismissedAt, readDismissRecord, writeDismissRecord } from './dismissRecord';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 23, 12);
const KEY_A = 'cifras.teste.a.v1';
const KEY_B = 'cifras.teste.b.v1';

function memory(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  };
}

describe('isDismissedAt', () => {
  it('vale 30 dias a partir da dispensa', () => {
    expect(DISMISS_MS).toBe(30 * DAY);
    expect(isDismissedAt(NOW - 29 * DAY, NOW)).toBe(true);
    expect(isDismissedAt(NOW - 30 * DAY, NOW)).toBe(false);
  });

  it('é falso sem dispensa e ignora data futura (relógio voltou)', () => {
    expect(isDismissedAt(null, NOW)).toBe(false);
    expect(isDismissedAt(NOW + DAY, NOW)).toBe(false);
  });
});

describe('registro de dispensa por chave', () => {
  it('grava e lê só na chave dada', () => {
    const storage = memory();
    writeDismissRecord(storage, KEY_A, { dismissedAt: NOW });
    expect(storage.map.get(KEY_A)).toBe(JSON.stringify({ dismissedAt: NOW }));
    expect(readDismissRecord(storage, KEY_A)).toEqual({ dismissedAt: NOW });
    expect(readDismissRecord(storage, KEY_B)).toEqual({ dismissedAt: null });
  });

  it('lê "nunca dispensado" quando falta, está bloqueado ou tem lixo', () => {
    expect(readDismissRecord(undefined, KEY_A)).toEqual({ dismissedAt: null });
    expect(
      readDismissRecord(
        {
          getItem: () => {
            throw new Error('denied');
          },
        },
        KEY_A,
      ),
    ).toEqual({ dismissedAt: null });
    expect(readDismissRecord({ getItem: () => '{não é json' }, KEY_A)).toEqual({
      dismissedAt: null,
    });
    expect(
      readDismissRecord({ getItem: () => JSON.stringify({ dismissedAt: 'ontem' }) }, KEY_A),
    ).toEqual({ dismissedAt: null });
  });

  it('uma gravação que lança, ou storage ausente, nunca quebra o app', () => {
    expect(() =>
      writeDismissRecord(
        {
          setItem: () => {
            throw new Error('full');
          },
        },
        KEY_A,
        { dismissedAt: NOW },
      ),
    ).not.toThrow();
    expect(() => writeDismissRecord(undefined, KEY_A, { dismissedAt: NOW })).not.toThrow();
  });
});
