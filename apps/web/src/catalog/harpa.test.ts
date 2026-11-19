import { describe, expect, it } from 'vitest';
import { compareTitles, isHarpa, splitHarpa } from './search';
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

  it('sorts numbered hymns by number, not by text (15 before 134)', () => {
    const titles = ['134 - trabalhai e orai', '15 - conversao', '03 - plena paz', '107 - firmes'];
    expect([...titles].sort(compareTitles)).toEqual([
      '03 - plena paz',
      '15 - conversao',
      '107 - firmes',
      '134 - trabalhai e orai',
    ]);
  });

  it('still sorts plain titles alphabetically in pt-BR', () => {
    expect(['sonda me', 'abre os olhos', 'ágape'].sort(compareTitles)).toEqual([
      'abre os olhos',
      'ágape',
      'sonda me',
    ]);
  });
});
