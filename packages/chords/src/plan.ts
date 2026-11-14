import { semitonesBetween, transposeChord } from './chord';
import { findKeyIndicator } from './keyIndicator';
import type { Key } from './keys';
import { analyzeSegment, segmentLine, tokenizeSegment } from './lines';
import type { TextLine, Token } from './lines';

const RIGHT_MARGIN = 20;
const TOLERANCE_EM = 0.05;

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
  suspectSegments: SuspectSegment[];
}

// A bold segment with chords plus 1-2 unparseable tokens: probably a chord we could not read.
export interface SuspectSegment {
  page: number;
  y: number;
  unknown: string[];
  chords: number;
}

const MAX_SUSPECT_UNKNOWN = 2;

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
  const suspectSegments: SuspectSegment[] = [];
  let chordCount = 0;

  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tokens = tokenizeSegment(segment);
      const analysis = analyzeSegment(tokens);
      const isIndicatorToken = (token: Token): boolean =>
        indicator !== null &&
        indicator.page === line.page &&
        indicator.y === line.y &&
        Math.abs(indicator.token.x - token.x) < 0.01;
      const found = analysis.chords.filter((c) => !isIndicatorToken(c.token));
      if (found.length > 0 && analysis.unknown.length > 0) {
        if (analysis.unknown.length <= MAX_SUSPECT_UNKNOWN) {
          suspectSegments.push({
            page: line.page,
            y: line.y,
            unknown: analysis.unknown,
            chords: found.length,
          });
        }
        continue;
      }
      if (analysis.unknown.length > 0 || analysis.chords.length === 0) continue;
      found.forEach(({ token, chord, prefix, suffix }) => {
        const i = tokens.indexOf(token);
        chordCount++;
        if (same) return;
        const replacement = `${prefix}${transposeChord(chord, semitones, to)}${suffix}`;
        const { fontSize, fontName } = token.run;
        const newWidth = measure(replacement, fontName, fontSize);
        const next = tokens[i + 1];
        const tolerance = TOLERANCE_EM * fontSize;
        const collides =
          next !== undefined
            ? newWidth + measure('n', fontName, fontSize) > next.x - token.x + tolerance
            : token.x + newWidth > line.pageWidth - RIGHT_MARGIN + tolerance;
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
    suspectSegments,
  };
}
