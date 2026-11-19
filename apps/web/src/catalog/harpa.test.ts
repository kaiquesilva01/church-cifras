import { describe, expect, it } from 'vitest';
import { isHarpa, splitHarpa } from './search';
import { makeSong } from '../test/fakeCatalogApi';

describe('harpa section', () => {
  it('recognizes the Harpa singer ignoring case, accents and spaces', () => {
    expect(isHarpa(makeSong({ id: 'a', artistName: 'Harpa' }))).toBe(true);
    expect(isHarpa(makeSong({ id: 'b', artistName: '  HARPA ' }))).toBe(true);
    expect(isHarpa(makeSong({ id: 'c', artistName: 'Hárpa' }))).toBe(true);
  });

  it('does not treat other singers as Harpa', () => {
    expect(isHarpa(makeSong({ id: 'a', artistName: 'Harpa Cristã' }))).toBe(false);
    expect(isHarpa(makeSong({ id: 'b', artistName: 'Aline Barros' }))).toBe(false);
  });

  it('splits songs into the regular list and the Harpa list keeping order', () => {
    const songs = [
      makeSong({ id: '1', artistName: 'Aline Barros' }),
      makeSong({ id: '2', artistName: 'Harpa' }),
      makeSong({ id: '3', artistName: 'Damáris' }),
      makeSong({ id: '4', artistName: 'harpa' }),
    ];
    const { regular, harpa } = splitHarpa(songs);
    expect(regular.map((s) => s.id)).toEqual(['1', '3']);
    expect(harpa.map((s) => s.id)).toEqual(['2', '4']);
  });
});
