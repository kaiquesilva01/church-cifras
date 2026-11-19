import { describe, expect, it } from 'vitest';
import { extractLyrics } from './lyrics';
import { findKeyIndicator } from './keyIndicator';
import { line, measure, run } from './__tests__/helpers';

describe('extractLyrics', () => {
  it('drops chord lines and keeps lyric lines', () => {
    const lines = [
      line([run('G', 40), run('D', 120)], 1, 720),
      line([run('Sonda-me, Senhor', 40, false)], 1, 700),
    ];
    expect(extractLyrics(lines)).toBe('Sonda-me, Senhor');
  });

  it('drops the line that holds the key indicator', () => {
    const lines = [
      line([run('Sonda-me - Aline Barros (G)', 40)], 1, 740),
      line([run('Sonda-me, Senhor', 40, false)], 1, 720),
    ];
    const indicator = findKeyIndicator(lines);
    expect(indicator).not.toBeNull();
    expect(extractLyrics(lines, { indicator })).toBe('Sonda-me, Senhor');
  });

  it('keeps a bold non-chord line', () => {
    const lines = [line([run('Santo é o Senhor', 40)], 1, 700)];
    expect(extractLyrics(lines)).toBe('Santo é o Senhor');
  });

  it('joins runs of one line with a space only when there is a gap', () => {
    const glued = [line([run('Son', 40, false), run('da', 58, false)], 1, 700)];
    expect(extractLyrics(glued)).toBe('Sonda');

    const spaced = [line([run('Son', 40, false), run('da', 58 + 0.3 * 10, false)], 1, 700)];
    expect(extractLyrics(spaced)).toBe('Son da');
  });

  it('treats each wide-gap segment as its own line', () => {
    const lines = [line([run('Primeiro', 40, false), run('Segundo', 400, false)], 1, 700)];
    expect(extractLyrics(lines, { measure })).toBe('Primeiro\nSegundo');
  });

  it("returns '' for no lyric text and collapses blank lines", () => {
    expect(extractLyrics([])).toBe('');
    expect(extractLyrics([line([run('G', 40)], 1, 700)])).toBe('');

    const lines = [
      line([run('Primeiro  verso', 40, false)], 1, 700),
      line([run('   ', 40, false)], 1, 680),
      line([run('Segundo verso', 40, false)], 1, 660),
    ];
    expect(extractLyrics(lines)).toBe('Primeiro verso\nSegundo verso');
  });
});
