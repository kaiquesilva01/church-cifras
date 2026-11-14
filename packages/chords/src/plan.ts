import { parseChord, semitonesBetween, transposeChord } from './chord';
import { findKeyIndicator } from './keyIndicator';
import type { Key } from './keys';
import { classifySegment, isLabel, segmentLine, tokenizeSegment } from './lines';
import type { TextLine } from './lines';

export type Measure = (text: string, fontName: string, fontSize: number) => number;

export interface Replacement {
  page: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  original: string;
  replacement: string;
  newWidth: number;
  collides: boolean;
}

export interface TransposePlan {
  from: Key;
  to: Key;
  chords: Replacement[];
  keyIndicator: Replacement | null;
  chordCount: number;
  collisions: number;
}

export function buildTransposePlan(input: {
  lines: TextLine[];
  from: Key;
  to: Key;
  measure: Measure;
}): TransposePlan {
  const { lines, from, to, measure } = input;
  const semitones = semitonesBetween(from, to);
  const same = from.tonicPc === to.tonicPc && from.minor === to.minor;
  const indicator = findKeyIndicator(lines);
  const chords: Replacement[] = [];
  let chordCount = 0;

  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tokens = tokenizeSegment(segment);
      if (classifySegment(tokens) !== 'chords') continue;
      tokens.forEach((token, i) => {
        if (isLabel(token.text)) return;
        const isIndicatorToken =
          indicator !== null &&
          indicator.page === line.page &&
          indicator.y === line.y &&
          Math.abs(indicator.token.x - token.x) < 0.01;
        if (isIndicatorToken) return;
        const chord = parseChord(token.text);
        if (!chord) return;
        chordCount++;
        if (same) return;
        const replacement = transposeChord(chord, semitones, to);
        const { fontSize, fontName } = token.run;
        const newWidth = measure(replacement, fontName, fontSize);
        const next = tokens[i + 1];
        const collides =
          next !== undefined && newWidth + measure('n', fontName, fontSize) > next.x - token.x;
        chords.push({
          page: line.page,
          x: token.x,
          y: token.run.y,
          width: token.width,
          fontSize,
          fontName,
          original: token.text,
          replacement,
          newWidth,
          collides,
        });
      });
    }
  }

  let keyIndicator: Replacement | null = null;
  if (indicator && !same) {
    const { token } = indicator;
    keyIndicator = {
      page: indicator.page,
      x: token.x,
      y: token.run.y,
      width: token.width,
      fontSize: token.run.fontSize,
      fontName: token.run.fontName,
      original: token.text,
      replacement: indicator.kind === 'title' ? `(${to.name})` : to.name,
      newWidth: 0,
      collides: false,
    };
    keyIndicator.newWidth = measure(
      keyIndicator.replacement,
      keyIndicator.fontName,
      keyIndicator.fontSize,
    );
  }

  return {
    from,
    to,
    chords,
    keyIndicator,
    chordCount,
    collisions: chords.filter((c) => c.collides).length,
  };
}
