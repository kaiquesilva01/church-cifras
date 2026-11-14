import { describe, expect, it } from 'vitest';
import { artistIdFromName, compareKeys, keyFromSlug, keySlug } from './catalog';

describe('catalog helpers', () => {
  it('slugs keys with sharps', () => {
    expect(keySlug('C#')).toBe('Cs');
    expect(keySlug('F#m')).toBe('Fsm');
    expect(keySlug('Bb')).toBe('Bb');
    expect(keyFromSlug('Fsm')).toBe('F#m');
    expect(keyFromSlug('Bb')).toBe('Bb');
    expect(keyFromSlug('x')).toBeNull();
  });

  it('orders keys majors then minors', () => {
    const keys = ['Am', 'G', 'C#m', 'C', 'Bb'];
    expect([...keys].sort(compareKeys)).toEqual(['C', 'G', 'Bb', 'C#m', 'Am']);
  });

  it('artist id from name', () => {
    expect(artistIdFromName('Aline Barros ')).toBe('aline-barros');
    expect(artistIdFromName('Damáris  ANDRADE')).toBe('damaris-andrade');
  });
});
