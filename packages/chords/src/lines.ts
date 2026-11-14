import { parseChord } from './chord';
import type { Chord } from './chord';

export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  bold: boolean;
}

export interface TextLine {
  page: number;
  y: number;
  pageWidth: number;
  runs: TextRun[];
}

export interface Token {
  text: string;
  x: number;
  width: number;
  run: TextRun;
}

const sortByX = (runs: TextRun[]): TextRun[] => [...runs].sort((a, b) => a.x - b.x);

export function segmentLine(line: TextLine): TextRun[][] {
  const segments: TextRun[][] = [];
  let current: TextRun[] = [];
  let prevEnd = 0;
  for (const run of sortByX(line.runs)) {
    if (current.length > 0 && run.x - prevEnd > line.pageWidth / 3) {
      segments.push(current);
      current = [];
    }
    current.push(run);
    prevEnd = run.x + run.width;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

export function mergeFragments(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of sortByX(runs)) {
    const prev = merged[merged.length - 1];
    const joinable =
      prev !== undefined &&
      prev.bold &&
      run.bold &&
      !/\s$/.test(prev.text) &&
      !/^\s/.test(run.text) &&
      run.x - (prev.x + prev.width) < 0.1 * run.fontSize;
    if (joinable) {
      merged[merged.length - 1] = {
        ...prev,
        text: prev.text + run.text,
        width: run.x + run.width - prev.x,
      };
    } else {
      merged.push(run);
    }
  }
  return merged;
}

// Splits runs on whitespace; token x comes from the character index within its run.
export function tokenizeRuns(runs: TextRun[]): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const perChar = run.width / run.text.length;
    for (const match of run.text.matchAll(/\S+/g)) {
      tokens.push({
        text: match[0],
        x: run.x + perChar * match.index,
        width: perChar * match[0].length,
        run,
      });
    }
  }
  return tokens;
}

export function tokenizeSegment(runs: TextRun[]): Token[] {
  return tokenizeRuns(mergeFragments(runs.filter((r) => r.bold)));
}

const LABEL_PATTERNS = [
  /:$/,
  /^\[.*\]$/,
  /^\[[^\]]*$/,
  /^[^[]*\]$/,
  /^\d+x$/i,
  /^x\d+$/i,
  /^\(\d+x\)$/i,
  /^[()\-–|/]$/,
];

export function isLabel(token: string): boolean {
  return LABEL_PATTERNS.some((p) => p.test(token));
}

export interface ChordToken {
  chord: Chord;
  prefix: string;
  suffix: string;
}

// Accepts a chord wrapped in bracket punctuation (`[Am]`, `[Intro:Am`, `G]`); the punctuation
// is returned so the replacement can keep it in place.
export function parseChordToken(text: string): ChordToken | null {
  let prefix = '';
  let core = text;
  let suffix = '';
  if (core.startsWith('[')) {
    prefix = '[';
    core = core.slice(1);
    const label = /^\p{L}+:(?=.)/u.exec(core);
    if (label) {
      prefix += label[0];
      core = core.slice(label[0].length);
    }
  }
  if (core.endsWith(']')) {
    suffix = ']';
    core = core.slice(0, -1);
  }
  const chord = parseChord(core);
  return chord ? { chord, prefix, suffix } : null;
}

export interface SegmentAnalysis {
  chords: Array<ChordToken & { token: Token }>;
  unknown: string[];
}

// Chords win over labels: `[Am]` and `G]` are chords even though they look like brackets.
export function analyzeSegment(tokens: Token[]): SegmentAnalysis {
  const result: SegmentAnalysis = { chords: [], unknown: [] };
  for (const token of tokens) {
    const parsed = parseChordToken(token.text);
    if (parsed) result.chords.push({ ...parsed, token });
    else if (!isLabel(token.text)) result.unknown.push(token.text);
  }
  return result;
}

export function classifySegment(tokens: Token[]): 'chords' | 'other' {
  const { chords, unknown } = analyzeSegment(tokens);
  return unknown.length === 0 && chords.length > 0 ? 'chords' : 'other';
}
