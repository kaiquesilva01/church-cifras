import { describe, expect, it } from 'vitest';
import { MAX_TEXT, validateArtist, validateTitle } from './songText';

describe('song text validation', () => {
  it('requires a title and an artist', () => {
    expect(validateTitle('   ')).toBe('Informe o nome da música.');
    expect(validateArtist('')).toBe('Informe o cantor.');
  });

  it('requires letters or numbers', () => {
    expect(validateTitle('---')).toBe('Use letras ou números no nome.');
    expect(validateArtist('!!!')).toBe('Use letras ou números no nome.');
  });

  it('accepts valid names and limits the length', () => {
    expect(validateTitle('Sonda-me')).toBeNull();
    expect(validateArtist('Aline Barros')).toBeNull();
    expect(validateTitle('a'.repeat(MAX_TEXT))).toBeNull();
    expect(validateTitle('a'.repeat(MAX_TEXT + 1))).toBe(`Use no máximo ${MAX_TEXT} caracteres.`);
  });
});
