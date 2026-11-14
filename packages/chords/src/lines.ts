import { parseChord } from './chord';

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

export function classifySegment(tokens: Token[]): 'chords' | 'other' {
  let chords = 0;
  for (const token of tokens) {
    if (isLabel(token.text)) continue;
    if (parseChord(token.text) === null) return 'other';
    chords++;
  }
  return chords > 0 ? 'chords' : 'other';
}
