import { describe, expect, it } from 'vitest';
import { BELL_PATH } from './bell';

describe('BELL_PATH', () => {
  it('é o contorno do sino da aba Mais e do convite de avisos', () => {
    expect(BELL_PATH).toBe('M6 8a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 14 6 8M10 20a2 2 0 0 0 4 0');
  });
});
