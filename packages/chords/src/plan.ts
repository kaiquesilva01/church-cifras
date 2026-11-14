import { semitonesBetween, transposeChord } from './chord';
import { findKeyIndicator } from './keyIndicator';
import type { Key } from './keys';
import { findChords, scanSegments } from './findChords';
import type { Measure, TextLine } from './lines';

const RIGHT_MARGIN = 20;
const TOLERANCE_EM = 0.05;

export type { Measure };

export interface Replacement {
  page: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  ascent: number;
  descent: number;
  bold: boolean;
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
  const indicator = findKeyIndicator(lines, measure);
  const chords: Replacement[] = [];
  const suspectSegments: SuspectSegment[] = [];
  let chordCount = 0;

  for (const segment of scanSegments(lines, indicator, measure)) {
    if (segment.chords.length > 0 && segment.unknown.length > 0) {
      if (segment.unknown.length <= MAX_SUSPECT_UNKNOWN) {
        suspectSegments.push({
          page: segment.line.page,
          y: segment.line.y,
          unknown: segment.unknown,
          chords: segment.chords.length,
        });
      }
    }
  }

  for (const occurrence of findChords(lines, { indicator, measure })) {
    const { token, chord, prefix, suffix, next, page, pageWidth } = occurrence;
    chordCount++;
    if (same) continue;
    const replacement = `${prefix}${transposeChord(chord, semitones, to)}${suffix}`;
    const { fontSize, fontName } = token.run;
    const newWidth = measure(replacement, fontName, fontSize);
    const tolerance = TOLERANCE_EM * fontSize;
    const collides =
      next !== null
        ? newWidth + measure('n', fontName, fontSize) > next.x - token.x + tolerance
        : token.x + newWidth > pageWidth - RIGHT_MARGIN + tolerance;
    chords.push({
      page,
      x: token.x,
      y: token.run.y,
      width: token.width,
      fontSize,
      fontName,
      ascent: token.run.ascent,
      descent: token.run.descent,
      bold: token.run.bold,
      original: token.text,
      replacement,
      newWidth,
      collides,
    });
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
      ascent: token.run.ascent,
      descent: token.run.descent,
      bold: token.run.bold,
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
