import type { TextLine, TextRun } from '@cifras/chords';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

const SAME_LINE_TOLERANCE = 1;
const BOLD_FONT = /bold|black|heavy/i;

// Browser entry point: the app points pdf.js at its bundled worker file.
export function configurePdfWorker(src: string): void {
  pdfjs.GlobalWorkerOptions.workerSrc = src;
}

interface PageFont {
  name?: string;
}

interface CommonObjs {
  get(id: string, callback?: (font: unknown) => void): unknown;
}

const FONT_TIMEOUT_MS = 2000;
const DEFAULT_ASCENT = 0.8;
const DEFAULT_DESCENT = -0.2;

// The same pdf.js instance (legacy build) for every caller, so the worker setup applies to all.
export function getPdfjs(): typeof pdfjs {
  return pdfjs;
}

const cleanFontName = (font: PageFont | undefined, id: string): string =>
  (font?.name ?? id).replace(/^[A-Z]{6}\+/, '');

// In browsers the font object may not be loaded yet: wait for it via the callback form and only
// fall back to the synchronous get when the callback never arrives.
export function resolveFontName(
  commonObjs: CommonObjs,
  id: string,
  timeoutMs = FONT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve) => {
    const syncName = (): string => {
      try {
        return cleanFontName(commonObjs.get(id) as PageFont | undefined, id);
      } catch {
        return id;
      }
    };
    const timer = setTimeout(() => resolve(syncName()), timeoutMs);
    try {
      commonObjs.get(id, (font) => {
        clearTimeout(timer);
        resolve(cleanFontName(font as PageFont | undefined, id));
      });
    } catch {
      clearTimeout(timer);
      resolve(syncName());
    }
  });
}

// The document must have been opened with `fontExtraProperties: true` (pdfjs 6.x) so real font
// names, and therefore bold detection, are available.
export async function readTextLinesFromDocument(doc: PDFDocumentProxy): Promise<TextLine[]> {
  const lines: TextLine[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const [left = 0, , right = 0] = page.view;
    const pageWidth = right - left;
    const content = await page.getTextContent();
    await page.getOperatorList();
    const names = new Map<string, string>();

    const runs: TextRun[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str.length === 0) continue;
      let fontName = names.get(item.fontName);
      if (fontName === undefined) {
        fontName = await resolveFontName(page.commonObjs, item.fontName);
        names.set(item.fontName, fontName);
      }
      const style = content.styles[item.fontName] as
        { ascent?: number; descent?: number } | undefined;
      const [a = 0, b = 0, , , e = 0, f = 0] = item.transform as number[];
      runs.push({
        text: item.str,
        x: e,
        y: f,
        width: item.width,
        fontSize: Math.hypot(a, b),
        fontName,
        bold: BOLD_FONT.test(fontName),
        ascent: style?.ascent ?? DEFAULT_ASCENT,
        descent: style?.descent ?? DEFAULT_DESCENT,
      });
    }

    const rows: Array<{ y: number; runs: TextRun[] }> = [];
    for (const run of runs) {
      const row = rows.find((r) => Math.abs(r.y - run.y) <= SAME_LINE_TOLERANCE);
      if (row) row.runs.push(run);
      else rows.push({ y: run.y, runs: [run] });
    }
    rows.sort((r1, r2) => r2.y - r1.y);
    for (const row of rows) {
      row.runs.sort((r1, r2) => r1.x - r2.x);
      lines.push({ page: pageNumber, y: row.y, pageWidth, runs: row.runs });
    }
  }
  return lines;
}

export async function readTextLines(data: Uint8Array): Promise<TextLine[]> {
  // pdf.js transfers the buffer to its worker; copy so callers keep their data.
  const task = pdfjs.getDocument({ data: data.slice(), verbosity: 0, fontExtraProperties: true });
  try {
    return await readTextLinesFromDocument(await task.promise);
  } finally {
    await task.destroy();
  }
}
