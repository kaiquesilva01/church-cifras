import type { Chord } from './chord';
import { findKeyIndicator } from './keyIndicator';
import type { KeyIndicator } from './keyIndicator';
import { analyzeSegment, segmentLine, tokenizeSegment } from './lines';
import type { ChordToken, TextLine, Token } from './lines';

export interface ChordOccurrence {
  token: Token;
  chord: Chord;
  page: number;
  y: number;
  // Punctuation around the chord in the token text (`[Am]`), kept by replacements.
  prefix: string;
  suffix: string;
  // Next token of the same segment (any kind); null for the last one.
  next: Token | null;
  pageWidth: number;
}

export interface ScannedSegment {
  line: TextLine;
  tokens: Token[];
  chords: Array<ChordToken & { token: Token }>;
  unknown: string[];
  isChordLine: boolean;
}

export function scanSegments(lines: TextLine[], indicator: KeyIndicator | null): ScannedSegment[] {
  const scanned: ScannedSegment[] = [];
  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tokens = tokenizeSegment(segment);
      const { chords, unknown } = analyzeSegment(tokens);
      const isIndicator = (token: Token): boolean =>
        indicator !== null &&
        indicator.page === line.page &&
        indicator.y === line.y &&
        Math.abs(indicator.token.x - token.x) < 0.01;
      scanned.push({
        line,
        tokens,
        chords: chords.filter((c) => !isIndicator(c.token)),
        unknown,
        isChordLine: unknown.length === 0 && chords.length > 0,
      });
    }
  }
  return scanned;
}

// Every chord of every chord line, in reading order, except the key indicator token.
export function findChords(
  lines: TextLine[],
  indicator: KeyIndicator | null = findKeyIndicator(lines),
): ChordOccurrence[] {
  const found: ChordOccurrence[] = [];
  for (const { line, tokens, chords, isChordLine } of scanSegments(lines, indicator)) {
    if (!isChordLine) continue;
    for (const { token, chord, prefix, suffix } of chords) {
      found.push({
        token,
        chord,
        page: line.page,
        y: line.y,
        prefix,
        suffix,
        next: tokens[tokens.indexOf(token) + 1] ?? null,
        pageWidth: line.pageWidth,
      });
    }
  }
  return found;
}
