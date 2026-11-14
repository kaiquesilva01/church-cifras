import { parseChord } from './chord';
import type { Chord } from './chord';

export type Measure = (text: string, fontName: string, fontSize: number) => number;

// Coordinates are PDF user space: origin at the bottom-left of the page, y grows upward,
// and `y` is the text baseline. `ascent`/`descent` are font metrics in em units
// (descent is negative), so the glyph box spans y + descent*fontSize .. y + ascent*fontSize.
export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  bold: boolean;
  ascent: number;
  descent: number;
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

// Horizontal span of run.text[start, end). With a measure the prefix is measured and scaled to the
// run's real width (proportional fonts); without one, or if it measures 0, characters are equal.
export function spanInRun(
  run: TextRun,
  start: number,
  end: number,
  measure?: Measure,
): { x: number; width: number } {
  const total = measure ? measure(run.text, run.fontName, run.fontSize) : 0;
  if (measure && total > 0) {
    const scale = run.width / total;
    const from = measure(run.text.slice(0, start), run.fontName, run.fontSize) * scale;
    const to = measure(run.text.slice(0, end), run.fontName, run.fontSize) * scale;
    return { x: run.x + from, width: to - from };
  }
  const perChar = run.text.length > 0 ? run.width / run.text.length : 0;
  return { x: run.x + perChar * start, width: perChar * (end - start) };
}

// Splits runs on whitespace.
export function tokenizeRuns(runs: TextRun[], measure?: Measure): Token[] {
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const match of run.text.matchAll(/\S+/g)) {
      const { x, width } = spanInRun(run, match.index, match.index + match[0].length, measure);
      tokens.push({ text: match[0], x, width, run });
    }
  }
  return tokens;
}

export function tokenizeSegment(runs: TextRun[], measure?: Measure): Token[] {
  return tokenizeRuns(mergeFragments(runs.filter((r) => r.bold)), measure);
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
