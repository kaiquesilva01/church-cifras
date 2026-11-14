import { semitonesBetween, transposeChord } from './chord';
import { findKeyIndicator } from './keyIndicator';
import type { Key } from './keys';
import { findChords, scanSegments } from './findChords';
import { segmentLine, tokenizeRuns } from './lines';
import type { Measure, TextLine, Token } from './lines';

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
// An unknown token only counts if it looks like a mistyped chord: a chord letter (optionally
// with an accidental) not followed by two more letters, or followed by a quality word.
const CHORD_ATTEMPT = /^[[(]?[A-G](?:[#b]?(?![a-z]{2}|[A-Z]{2})|[#b]?(?:maj|min|dim|aug|sus|add))/;

function isCollision(input: {
  x: number;
  newWidth: number;
  next: Token | null;
  pageWidth: number;
  fontName: string;
  fontSize: number;
  measure: Measure;
}): boolean {
  const { x, newWidth, next, pageWidth, fontName, fontSize, measure } = input;
  const tolerance = TOLERANCE_EM * fontSize;
  return next !== null
    ? newWidth + measure('n', fontName, fontSize) > next.x - x + tolerance
    : x + newWidth > pageWidth - RIGHT_MARGIN + tolerance;
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
  const indicator = findKeyIndicator(lines, measure);
  const chords: Replacement[] = [];
  const suspectSegments: SuspectSegment[] = [];
  let chordCount = 0;

  for (const segment of scanSegments(lines, indicator, measure)) {
    const attempts = segment.unknown.filter((t) => CHORD_ATTEMPT.test(t));
    if (
      segment.chords.length > 0 &&
      attempts.length > 0 &&
      attempts.length <= MAX_SUSPECT_UNKNOWN
    ) {
      suspectSegments.push({
        page: segment.line.page,
        y: segment.line.y,
        unknown: attempts,
        chords: segment.chords.length,
      });
    }
  }

  for (const occurrence of findChords(lines, { indicator, measure })) {
    const { token, chord, prefix, suffix, next, page, pageWidth } = occurrence;
    chordCount++;
    if (same) continue;
    const replacement = `${prefix}${transposeChord(chord, semitones, to)}${suffix}`;
    const { fontSize, fontName } = token.run;
    const newWidth = measure(replacement, fontName, fontSize);
    const collides = isCollision({
      x: token.x,
      newWidth,
      next,
      pageWidth,
      fontName,
      fontSize,
      measure,
    });
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
    const siblings = lines
      .filter((l) => l.page === indicator.page && l.y === indicator.y)
      .flatMap((l) => segmentLine(l))
      .find((segment) => segment.includes(token.run));
    const next = tokenizeRuns(siblings ?? [token.run], measure).find((t) => t.x > token.x + 0.01);
    const pageWidth = lines.find((l) => l.page === indicator.page)?.pageWidth ?? Infinity;
    keyIndicator.collides = isCollision({
      x: token.x,
      newWidth: keyIndicator.newWidth,
      next: next ?? null,
      pageWidth,
      fontName: keyIndicator.fontName,
      fontSize: keyIndicator.fontSize,
      measure,
    });
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
