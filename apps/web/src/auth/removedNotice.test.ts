import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRemovedNotice, peekRemovedNotice, setRemovedNotice } from './removedNotice';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('removedNotice', () => {
  it('peek devolve o nome sem apagar: duas leituras, mesmo valor', () => {
    setRemovedNotice('Haja Luz');
    expect(peekRemovedNotice()).toBe('Haja Luz');
    expect(peekRemovedNotice()).toBe('Haja Luz');
  });

  it('clear apaga e a leitura seguinte devolve null', () => {
    setRemovedNotice('Haja Luz');
    clearRemovedNotice();
    expect(peekRemovedNotice()).toBeNull();
  });

  it('sem aviso, peek devolve null', () => {
    expect(peekRemovedNotice()).toBeNull();
  });

  it('sessionStorage que lança não derruba nada', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cheio');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => setRemovedNotice('Haja Luz')).not.toThrow();
    expect(peekRemovedNotice()).toBeNull();
    expect(() => clearRemovedNotice()).not.toThrow();
  });
});
