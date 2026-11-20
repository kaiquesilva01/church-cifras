import type { TextLine, TextRun } from '@cifras/chords';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readTextLines = vi.fn<(data: Uint8Array) => Promise<TextLine[]>>();
vi.mock('@cifras/pdf', () => ({ readTextLines: (d: Uint8Array) => readTextLines(d) }));
vi.mock('../lib/pdfWorker', () => ({}));

import { readPdfSuggestion } from './readPdfSuggestion';

const run = (text: string, x: number, y: number, bold: boolean): TextRun => ({
  text,
  x,
  y,
  width: text.length * 6,
  fontSize: 10,
  fontName: 'Courier',
  bold,
  ascent: 0.8,
  descent: -0.2,
});
const line = (runs: TextRun[], y: number): TextLine => ({ page: 1, y, pageWidth: 600, runs });

function pdfFile(name: string): File {
  const file = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(1)) });
  return file;
}

describe('readPdfSuggestion', () => {
  beforeEach(() => readTextLines.mockReset());

  it('counts chords and suggests metadata', async () => {
    readTextLines.mockResolvedValue([
      line([run('Sonda-me - Aline Barros', 40, 780, true)], 780),
      line([run('G', 40, 700, true), run('D', 120, 700, true)], 700),
      line([run('Sonda-me, Senhor', 40, 686, false)], 686),
    ]);
    const result = await readPdfSuggestion(pdfFile('Sonda-me - Aline Barros - G.pdf'), [
      'Aline Barros',
    ]);
    expect(result.chordCount).toBe(2);
    expect(result.suspects).toEqual([]);
    expect(result.suggestion.key).toBe('G');
    expect(result.suggestion.artist).toBe('Aline Barros');
  });

  it('returns the lyrics without chord lines', async () => {
    readTextLines.mockResolvedValue([
      line([run('Sonda-me - Aline Barros', 40, 780, true)], 780),
      line([run('G', 40, 700, true), run('D', 120, 700, true)], 700),
      line([run('Sonda-me, Senhor', 40, 686, false)], 686),
    ]);
    const result = await readPdfSuggestion(pdfFile('x.pdf'), []);
    expect(result.lyrics).toContain('Sonda-me, Senhor');
    expect(result.lyrics).not.toContain('G D');
  });

  it('reports zero chords for a text-only pdf', async () => {
    readTextLines.mockResolvedValue([line([run('Só letra', 40, 700, false)], 700)]);
    const result = await readPdfSuggestion(pdfFile('x.pdf'), []);
    expect(result.chordCount).toBe(0);
  });

  it('lists tokens near chords that were not recognised', async () => {
    readTextLines.mockResolvedValue([
      line(
        [run('G', 40, 700, true), run('Xm7', 120, 700, true), run('Bsus9z', 200, 700, true)],
        700,
      ),
    ]);
    const result = await readPdfSuggestion(pdfFile('x.pdf'), []);
    expect(result.suspects.flat().length).toBeGreaterThan(0);
  });

  it('counts chord lines ignored because of a non chord word', async () => {
    readTextLines.mockResolvedValue([
      line([run('G D (repete', 40, 700, true)], 700),
      line([run('G D', 40, 650, true)], 650),
    ]);
    const result = await readPdfSuggestion(pdfFile('x.pdf'), []);
    expect(result.ignoredChordLines).toBe(1);
    expect(result.suspects).toEqual([]);
  });
});
