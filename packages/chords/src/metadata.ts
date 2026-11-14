import { KEY_OPTIONS, parseKey } from './keys';
import type { KeyName } from './keys';
import { parseChord } from './chord';
import { classifySegment, isLabel, segmentLine, tokenizeRuns, tokenizeSegment } from './lines';
import type { TextLine, TextRun } from './lines';
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

interface Candidate {
  text: string;
  fontSize: number;
  bold: boolean;
  y: number;
}

function assembleText(runs: TextRun[]): string {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  let out = '';
  let prev: TextRun | undefined;
  for (const r of sorted) {
    if (prev) {
      const gap = r.x - (prev.x + prev.width);
      if (gap > 0.1 * r.fontSize && !/\s$/.test(out) && !/^\s/.test(r.text)) out += ' ';
    }
    out += r.text;
    prev = r;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const byProminence = (a: Candidate, b: Candidate): number => b.fontSize - a.fontSize || b.y - a.y;

function titleFromPdfText(lines: TextLine[]): { title: string; artist: string } | null {
  const firstPage = lines.reduce((min, l) => Math.min(min, l.page), Infinity);
  const pageLines = lines.filter((l) => l.page === firstPage);
  const body = median(
    pageLines.flatMap((l) => l.runs.filter((r) => !r.bold).map((r) => r.fontSize)),
  );
  const candidates: Candidate[] = [];
  for (const l of pageLines) {
    for (const segment of segmentLine(l)) {
      const tokens = tokenizeRuns([...segment].sort((a, b) => a.x - b.x));
      if (tokens.length === 0 || tokens.every((t) => isLabel(t.text))) continue;
      if (/^tom:?$/i.test(tokens[0]!.text)) continue;
      if (classifySegment(tokenizeSegment(segment)) === 'chords') continue;
      const text = assembleText(segment)
        .replace(/\s*\([A-G][#b]?m?\)\s*$/, '')
        .trim();
      if (text === '') continue;
      candidates.push({
        text,
        fontSize: Math.max(...segment.map((r) => r.fontSize)),
        bold: segment.some((r) => r.bold),
        y: l.y,
      });
    }
  }
  const bold = candidates.filter((c) => c.bold).sort(byProminence);
  const best = bold[0] ?? candidates.filter((c) => c.fontSize > body).sort(byProminence)[0] ?? null;
  if (!best) return null;
  let artist = '';
  if (best.bold && !SEPARATORS.some((sep) => best.text.includes(sep))) {
    const below = candidates.filter((c) => c.y < best.y).sort((a, b) => b.y - a.y)[0];
    if (
      below &&
      below.bold &&
      below.fontSize === best.fontSize &&
      best.y - below.y <= 2 * best.fontSize
    ) {
      artist = below.text;
    }
  }
  return { title: best.text, artist };
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, '')
    .replace(/-\d+$/, '')
    .replace(/[\s_-][A-G][#b]?m?$/, '')
    .replace(/\s*[-–_]\s*$/, '')
    .trim();
}

function splitText(text: string): { left: string; right: string } | null {
  let at = -1;
  let len = 0;
  for (const sep of SEPARATORS) {
    const i = text.indexOf(sep);
    if (i >= 0 && (at < 0 || i < at)) {
      at = i;
      len = sep.length;
    }
  }
  if (at < 0) return null;
  return { left: text.slice(0, at).trim(), right: text.slice(at + len).trim() };
}

function resolveArtist(
  left: string,
  right: string,
  knownArtists: string[],
): { title: string; artist: string; swapped: boolean } {
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
  const found = titleFromPdfText(input.lines);
  const raw = found?.title ?? titleFromFileName(input.fileName);
  const parts = found?.artist ? { left: raw, right: found.artist } : splitText(raw);
  const { title, artist, swapped } = parts
    ? resolveArtist(parts.left, parts.right, input.knownArtists)
    : { title: raw, artist: '', swapped: false };

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
