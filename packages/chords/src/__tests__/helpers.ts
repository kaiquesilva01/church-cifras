import type { TextLine, TextRun } from '../lines';

export const FONT_SIZE = 10;

// Monospace run: each character is 0.6 * fontSize wide.
export function run(text: string, x: number, bold = true, y = 700): TextRun {
  return {
    text,
    x,
    y,
    width: text.length * 0.6 * FONT_SIZE,
    fontSize: FONT_SIZE,
    fontName: 'Courier',
    bold,
  };
}

export function line(runs: TextRun[], page = 1, y = 700): TextLine {
  return { page, y, pageWidth: 600, runs };
}

export const measure = (text: string, _fontName: string, fontSize: number): number =>
  text.length * 0.6 * fontSize;
