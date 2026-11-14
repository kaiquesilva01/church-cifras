import { describe, expect, it } from 'vitest';
import { pdfFileName } from './fileName';

describe('pdfFileName', () => {
  it('builds "<title> - <artist> (<key>).pdf"', () => {
    expect(pdfFileName('Sonda-me', 'Aline Barros', 'F#m')).toBe(
      'Sonda-me - Aline Barros (F#m).pdf',
    );
  });

  it('pdfFileName sanitizes invalid characters and whitespace', () => {
    expect(pdfFileName('A/B: "C"?', ' Ar*tist <x>|y\\z ', 'G')).toBe('AB C - Artist xyz (G).pdf');
    expect(pdfFileName('Dois   espaços', 'X', 'G')).toBe('Dois espaços - X (G).pdf');
  });
});

describe('pdfFileName limits', () => {
  it('caps each part at 80 characters', () => {
    const name = pdfFileName('a'.repeat(100), 'b'.repeat(100), 'G');
    expect(name).toBe(`${'a'.repeat(80)} - ${'b'.repeat(80)} (G).pdf`);
  });

  it('falls back to "cifra" when a part is empty after cleaning', () => {
    expect(pdfFileName('///', '  ', 'G')).toBe('cifra - cifra (G).pdf');
  });
});
