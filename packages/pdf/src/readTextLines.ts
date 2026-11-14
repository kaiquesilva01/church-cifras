import type { TextLine, TextRun } from '@cifras/chords';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const SAME_LINE_TOLERANCE = 1;
const BOLD_FONT = /bold|black|heavy/i;

// Browser entry point: the app points pdf.js at its bundled worker file.
export function configurePdfWorker(src: string): void {
  pdfjs.GlobalWorkerOptions.workerSrc = src;
}

interface PageFont {
  name?: string;
}

function realFontName(commonObjs: { get(id: string): unknown }, id: string): string {
  try {
    const font = commonObjs.get(id) as PageFont | undefined;
    return (font?.name ?? id).replace(/^[A-Z]{6}\+/, '');
  } catch {
    return id;
  }
}

export async function readTextLines(data: Uint8Array): Promise<TextLine[]> {
  // pdf.js transfers the buffer to its worker; copy so callers keep their data.
  // fontExtraProperties is required in pdfjs 6.x to expose real font names (bold detection).
  const task = pdfjs.getDocument({ data: data.slice(), verbosity: 0, fontExtraProperties: true });
  const doc = await task.promise;
  const lines: TextLine[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const pageWidth = page.getViewport({ scale: 1 }).width;
      const content = await page.getTextContent();
      await page.getOperatorList();
      const names = new Map<string, string>();

      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item) || item.str.length === 0) continue;
        let fontName = names.get(item.fontName);
        if (fontName === undefined) {
          fontName = realFontName(page.commonObjs, item.fontName);
          names.set(item.fontName, fontName);
        }
        const [a = 0, b = 0, , , e = 0, f = 0] = item.transform as number[];
        runs.push({
          text: item.str,
          x: e,
          y: f,
          width: item.width,
          fontSize: Math.hypot(a, b),
          fontName,
          bold: BOLD_FONT.test(fontName),
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
  } finally {
    await task.destroy();
  }
  return lines;
}
