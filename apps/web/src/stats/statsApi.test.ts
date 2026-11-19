import { describe, expect, it } from 'vitest';
import { formatBytes } from './statsApi';

describe('formatBytes', () => {
  it('formata bytes, KB, MB e GB em pt-BR', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(264192)).toBe('258 KB');
    expect(formatBytes(65430938)).toBe('62,4 MB');
    expect(formatBytes(1395864371)).toBe('1,3 GB');
  });
});
