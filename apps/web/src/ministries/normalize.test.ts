import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from './normalize';

describe('normalizeForSearch', () => {
  it('tira acentos, põe em minúsculas e reduz espaços', () => {
    expect(normalizeForSearch('São Paulo')).toBe('sao paulo');
    expect(normalizeForSearch('  Haja Luz ')).toBe('haja luz');
  });
});
