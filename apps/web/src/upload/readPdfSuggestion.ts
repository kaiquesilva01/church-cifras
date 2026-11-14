import {
  buildTransposePlan,
  findChords,
  findKeyIndicator,
  parseKey,
  suggestMetadata,
  type MetadataSuggestion,
} from '@cifras/chords';
import { readTextLines } from '@cifras/pdf';
import '../lib/pdfWorker';

export interface PdfSuggestion {
  chordCount: number;
  suspects: string[][];
  suggestion: MetadataSuggestion;
}

// Approximate monospace-ish width; only used for geometry, never for output.
const measure = (text: string, _fontName: string, fontSize: number): number =>
  text.length * 0.55 * fontSize;

export async function readPdfSuggestion(
  file: File,
  knownArtists: string[],
): Promise<PdfSuggestion> {
  const lines = await readTextLines(new Uint8Array(await file.arrayBuffer()));
  const indicator = findKeyIndicator(lines, measure);
  const chords = findChords(lines, { indicator, measure });
  const suggestion = suggestMetadata({
    lines,
    fileName: file.name,
    knownArtists,
    indicator,
    firstChord: chords[0]?.chord.raw ?? null,
    lastChord: chords[chords.length - 1]?.chord.raw ?? null,
  });
  // from = to: nothing is transposed, we only read the plan's suspect segments.
  const key = parseKey(suggestion.key ?? 'C')!;
  const plan = buildTransposePlan({ lines, from: key, to: key, measure });
  return {
    chordCount: chords.length,
    suspects: plan.suspectSegments.map((segment) => segment.unknown),
    suggestion,
  };
}
