import { KEY_OPTIONS, parseKey } from './keys';
import type { KeyName } from './keys';
import { parseChord } from './chord';
import { classifySegment, segmentLine, tokenizeSegment } from './lines';
import type { TextLine } from './lines';
import type { KeyIndicator } from './keyIndicator';

export interface MetadataSuggestion {
  title: string;
  artist: string;
  key: KeyName | null;
  keySource: 'indicator' | 'filename' | 'chords' | null;
  swapped: boolean;
}

export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Case-sensitive on purpose: a lowercase word before the extension is never a key.
const FILE_KEY = /[\s_-]([A-G][#b]?m?)(?:-\d+)?\.pdf$/;
const SEPARATORS = [' - ', ' – ', ' | '];

function titleFromPdfText(lines: TextLine[]): string {
  const firstPage = lines.reduce((min, l) => Math.min(min, l.page), Infinity);
  let best = '';
  let bestSize = -1;
  for (const l of lines) {
    if (l.page !== firstPage) continue;
    for (const segment of segmentLine(l)) {
      const tokens = tokenizeSegment(segment);
      if (tokens.length === 0 || classifySegment(tokens) === 'chords') continue;
      if (/^tom:?$/i.test(tokens[0]!.text)) continue;
      const bold = segment.filter((r) => r.bold);
      const text = bold
        .map((r) => r.text)
        .join('')
        .replace(/\s*\([A-G][#b]?m?\)\s*$/, '')
        .trim();
      if (text === '') continue;
      const size = Math.max(...bold.map((r) => r.fontSize));
      if (size > bestSize) {
        best = text;
        bestSize = size;
      }
    }
  }
  return best;
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/-\d+$/, '')
    .replace(/[\s_-][A-G][#b]?m?$/, '')
    .replace(/\s*[-–_]\s*$/, '')
    .trim();
}

function splitArtist(
  text: string,
  knownArtists: string[],
): { title: string; artist: string; swapped: boolean } {
  let at = -1;
  let len = 0;
  for (const sep of SEPARATORS) {
    const i = text.indexOf(sep);
    if (i >= 0 && (at < 0 || i < at)) {
      at = i;
      len = sep.length;
    }
  }
  if (at < 0) return { title: text, artist: '', swapped: false };
  const left = text.slice(0, at).trim();
  const right = text.slice(at + len).trim();
  const known = new Set(knownArtists.map(normalizeText));
  if (known.has(normalizeText(left)) && !known.has(normalizeText(right))) {
    return { title: right, artist: left, swapped: true };
  }
  return { title: left, artist: right, swapped: false };
}

function keyFromChord(token: string): KeyName | null {
  const chord = parseChord(token);
  if (!chord) return null;
  const minor = /^(m(?!aj)|min)/.test(chord.quality);
  return (minor ? KEY_OPTIONS.minor : KEY_OPTIONS.major)[chord.rootPc] ?? null;
}

export function suggestMetadata(input: {
  lines: TextLine[];
  fileName: string;
  knownArtists: string[];
  indicator: KeyIndicator | null;
  firstChord: string | null;
  lastChord: string | null;
}): MetadataSuggestion {
  const raw = titleFromPdfText(input.lines) || titleFromFileName(input.fileName);
  const { title, artist, swapped } = splitArtist(raw, input.knownArtists);

  const fileKey = FILE_KEY.exec(input.fileName);
  const fromFile = fileKey ? parseKey(fileKey[1]!)?.name : undefined;
  const fromChords =
    (input.lastChord && keyFromChord(input.lastChord)) ||
    (input.firstChord && keyFromChord(input.firstChord)) ||
    null;

  let key: KeyName | null = null;
  let keySource: MetadataSuggestion['keySource'] = null;
  if (input.indicator) {
    key = input.indicator.key.name;
    keySource = 'indicator';
  } else if (fromFile) {
    key = fromFile;
    keySource = 'filename';
  } else if (fromChords) {
    key = fromChords;
    keySource = 'chords';
  }
  return { title, artist, key, keySource, swapped };
}
