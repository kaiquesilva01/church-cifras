import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

export interface SyntheticLine {
  chords?: Array<[x: number, chord: string]>;
  lyric?: string;
}

export interface SyntheticOptions {
  title: string;
  keyStyle: 'paren' | 'tom' | 'none';
  chordFont: 'CourierBold' | 'HelveticaBold';
  lyricFont: 'Courier' | 'Helvetica';
  lines: SyntheticLine[];
  twoColumns?: boolean;
  splitChord?: string;
  key?: string;
}

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

// Draws made-up lyrics and chords; the split chord is drawn as adjacent one-character fragments.
export async function buildSyntheticPdf(options: SyntheticOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const fonts: Record<string, PDFFont> = {
    CourierBold: await doc.embedFont(StandardFonts.CourierBold),
    HelveticaBold: await doc.embedFont(StandardFonts.HelveticaBold),
    Courier: await doc.embedFont(StandardFonts.Courier),
    Helvetica: await doc.embedFont(StandardFonts.Helvetica),
  };
  const chordFont = fonts[options.chordFont]!;
  const lyricFont = fonts[options.lyricFont]!;

  const titleText =
    options.keyStyle === 'paren' ? `${options.title} (${options.key})` : options.title;
  const top = PAGE_HEIGHT - 50;
  page.drawText(titleText, { x: 40, y: top, size: 16, font: fonts.HelveticaBold! });
  if (options.keyStyle === 'tom') {
    page.drawText(`Tom: ${options.key}`, { x: 40, y: top - 20, size: 10, font: lyricFont });
  }

  const startY = top - 50;
  const perColumn = options.twoColumns ? Math.ceil(options.lines.length / 2) : options.lines.length;
  options.lines.forEach((entry, index) => {
    const column = options.twoColumns && index >= perColumn ? 1 : 0;
    const y = startY - (index - column * perColumn) * 30;
    const offsetX = column * 300;
    for (const [x, chord] of entry.chords ?? []) {
      if (options.splitChord === chord) {
        let cursor = offsetX + x;
        for (const fragment of chord) {
          page.drawText(fragment, { x: cursor, y, size: 10, font: chordFont });
          cursor += chordFont.widthOfTextAtSize(fragment, 10);
        }
      } else {
        page.drawText(chord, { x: offsetX + x, y, size: 10, font: chordFont });
      }
    }
    if (entry.lyric) {
      page.drawText(entry.lyric, { x: offsetX + 40, y: y - 12, size: 10, font: lyricFont });
    }
  });
  return doc.save();
}
