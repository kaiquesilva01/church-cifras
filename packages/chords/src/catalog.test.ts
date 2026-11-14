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

  it('keeps artist ids ASCII-safe and bounded', () => {
    const cyr = artistIdFromName('Эй');
    expect(cyr).toMatch(/^a-[a-z0-9]+$/);
    expect(artistIdFromName('Эй')).toBe(cyr);
    expect(artistIdFromName('Ой')).not.toBe(cyr);
    expect(artistIdFromName('Aline Barros')).toBe('aline-barros');
    expect(artistIdFromName('Hillsong - United!')).toBe('hillsong-united');
    expect(artistIdFromName('a'.repeat(200)).length).toBeLessThanOrEqual(120);
    expect(artistIdFromName('a'.repeat(200))).toMatch(/^[a-z0-9-]{1,120}$/);
  });
});
