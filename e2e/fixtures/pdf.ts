import { PDFDocument, StandardFonts } from 'pdf-lib';

export interface SyntheticSong {
  title: string;
  artist: string;
  key: string;
  /** Chord lines as [x, chord] pairs; each one gets a made-up lyric line below it. */
  chordLines?: Array<Array<[x: number, chord: string]>>;
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
 * Chords close enough that a longer transposed name (C -> Db, F -> Gb) runs into its neighbour,
 * so the "Mudar tom" panel warns about collisions.
 */
export const CROWDED_LINES: Array<Array<[number, string]>> = [
  [
    [40, 'C'],
    [49, 'F'],
    [58, 'G'],
    [67, 'C'],
  ],
  [
    [40, 'F'],
    [49, 'C'],
    [58, 'G'],
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
  page.drawText(`${song.title} - ${song.artist} (${song.key})`, {
    x: 40,
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
