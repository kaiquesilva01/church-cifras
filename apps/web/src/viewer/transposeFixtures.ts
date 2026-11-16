/// <reference types="node" />
import type { TextLine, TextRun } from '@cifras/chords';
import { FONT_FILES, type FontId } from '@cifras/overlay/ops';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Test-only helpers: real TTF bytes from the overlay package and a tiny synthetic chord sheet.
const fontsDir = resolve(import.meta.dirname, '../../../../packages/overlay/fonts');

export const loadFontFromDisk = (id: FontId): Promise<Uint8Array> =>
  Promise.resolve(new Uint8Array(readFileSync(resolve(fontsDir, FONT_FILES[id]))));

const CHAR = 0.6 * 12; // Courier advance at 12pt

const run = (text: string, x: number, y: number, bold: boolean): TextRun => ({
  text,
  x,
  y,
  width: text.length * CHAR,
  fontSize: 12,
  fontName: bold ? 'Courier-Bold' : 'Courier',
  bold,
  ascent: 0.8,
  descent: -0.2,
});

const line = (y: number, runs: TextRun[]): TextLine => ({ page: 1, y, pageWidth: 600, runs });

// Song in G: `Tom: G`, a chord line (G, C, D/F#) and a lyric line.
export function sheetInG(
  chordRuns: Array<[string, number]> = [
    ['G', 50],
    ['C', 150],
    ['D/F#', 250],
  ],
) {
  return [
    line(760, [run('Tom: G', 50, 760, true)]),
    line(
      700,
      chordRuns.map(([text, x]) => run(text, x, 700, true)),
    ),
    line(688, [run('Sonda-me Senhor e conhece', 50, 688, false)]),
  ];
}
