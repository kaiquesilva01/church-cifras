import { PDFDocument, StandardFonts } from 'pdf-lib';

export interface SyntheticSong {
  title: string;
  artist: string;
  key: string;
  /** Chord lines as [x, chord] pairs; each one gets a made-up lyric line below it. */
  chordLines?: Array<Array<[x: number, chord: string]>>;
  /**
   * Right-aligns the heading so it ends at this x (points). Page width is 595 and the app's right
   * margin limit is about 575, so ending at 571 lets "(C)" fit but "(C#)" overflow.
   */
  headingEndX?: number;
  /** Heading text; defaults to "title - artist (key)". Keeps the title short while the song title stays unique. */
  heading?: string;
}

const LYRICS = [
  'Luz que nasce sobre o campo verde',
  'Canto simples para quem escuta',
  'Passos leves pela estrada antiga',
  'Todo o vale responde ao sol',
];

const DEFAULT_LINES: Array<Array<[number, string]>> = [
  [
    [40, 'C'],
    [140, 'G'],
    [240, 'Am'],
    [340, 'F'],
  ],
  [
    [40, 'F'],
    [140, 'C'],
    [240, 'G'],
  ],
  [
    [40, 'Am'],
    [140, 'F'],
    [240, 'C'],
    [340, 'G'],
  ],
  [
    [40, 'G'],
    [140, 'Am'],
    [240, 'F'],
    [340, 'C'],
  ],
];

/**
 * C7 (ends at 52) and F (at 62): C# 7 (18 wide) runs into F, so the overlay pushes F right to two
 * spaces and nothing is left in red. Nothing else collides.
 */
export const COLLIDING_LINES: Array<Array<[number, string]>> = [
  [
    [40, 'C7'],
    [62, 'F'],
  ],
  [
    [40, 'G'],
    [140, 'Am'],
  ],
];

/**
 * Collision the spreading cannot resolve: C# 7 (18 wide) runs into the non-chord label "(2x)", which
 * is never moved, so exactly one chord stays red. Nothing else collides.
 */
export const UNRESOLVABLE_LINES: Array<Array<[number, string]>> = [
  [
    [40, 'C7'],
    [62, '(2x)'],
  ],
  [
    [40, 'G'],
    [140, 'Am'],
  ],
];

/** Fully synthetic PDF: invented lyrics, Courier-Bold chords above Courier lines. Never a real score. */
export async function syntheticPdf(song: SyntheticSong): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const heading = await doc.embedFont(StandardFonts.HelveticaBold);
  const chordFont = await doc.embedFont(StandardFonts.CourierBold);
  const lyricFont = await doc.embedFont(StandardFonts.Courier);

  const top = 842 - 50;
  const headingText = song.heading ?? `${song.title} - ${song.artist} (${song.key})`;
  const headingX =
    song.headingEndX === undefined
      ? 40
      : song.headingEndX - heading.widthOfTextAtSize(headingText, 16);
  page.drawText(headingText, {
    x: headingX,
    y: top,
    size: 16,
    font: heading,
  });
  const lines = song.chordLines ?? DEFAULT_LINES;
  lines.forEach((chords, index) => {
    const y = top - 50 - index * 30;
    for (const [x, chord] of chords) page.drawText(chord, { x, y, size: 10, font: chordFont });
    page.drawText(LYRICS[index % LYRICS.length]!, { x: 40, y: y - 12, size: 10, font: lyricFont });
  });
  return Buffer.from(await doc.save());
}
