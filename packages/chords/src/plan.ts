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
  // Identity of the pdf text run the original token came from (`page:y:x` of the run).
  runKey: string;
  // Width of a space in the font (at fontSize) used by `measure`.
  spaceWidth: number;
  // Collides when `x + newWidth` exceeds this (next token minus a letter, or the page edge).
  limitX: number;
  // True when the next token on the line is another chord (the key indicator is always false).
  nextIsChord: boolean;
}

export interface TransposePlan {
  from: Key;
  to: Key;
  chords: Replacement[];
  keyIndicator: Replacement | null;
  chordCount: number;
  collisions: number;
  suspectSegments: SuspectSegment[];
  // Bold segments with chords that were not classified as chord lines nor reported as suspects.
  ignoredChordLines: number;
}

// A bold segment with chords plus 1-2 unparseable tokens: probably a chord we could not read.
export interface SuspectSegment {
  page: number;
  y: number;
  unknown: string[];
  chords: number;
}

const MAX_SUSPECT_UNKNOWN = 2;
// Segments with this many non-chord words or more are titles/lyrics in bold, not ignored chords.
const MIN_TITLE_WORDS = 3;
// An unknown token only counts if it looks like a mistyped chord: a chord letter (optionally
// with an accidental) not followed by two more letters, or followed by a quality word.
// All-caps words (DE, DO, EM, ADORAÇÃO) are title text, never a chord attempt.
const ALL_CAPS_WORD = /^[A-G][A-ZÀ-Ý]+$/;
// An all-caps word beside a chord-like letter (`MEU PRAZER E`) marks a bold title.
// An opening bracket marks an annotation (`(repete`, `(BIS)`) beside chords, never a title.
const ANNOTATION = /^[([]/;
const ALL_CAPS_TITLE_WORD = /^[A-ZÀ-Ý]{2,}$/;
const CHORD_ATTEMPT = /^[[(]?[A-G](?:[#b]?(?![a-z]{2}|[A-Z]{2})|[#b]?(?:maj|min|dim|aug|sus|add))/;

function collisionLimit(input: {
  next: Token | null;
  pageWidth: number;
  fontName: string;
  fontSize: number;
  measure: Measure;
}): number {
  const { next, pageWidth, fontName, fontSize, measure } = input;
  const tolerance = TOLERANCE_EM * fontSize;
  return next !== null
    ? next.x - measure('n', fontName, fontSize) + tolerance
    : pageWidth - RIGHT_MARGIN + tolerance;
}

const runKeyOf = (page: number, run: { x: number; y: number }): string =>
  `${page}:${run.y}:${run.x}`;

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
  let ignoredChordLines = 0;

  for (const segment of scanSegments(lines, indicator, measure)) {
    const attempts = segment.unknown.filter((t) => CHORD_ATTEMPT.test(t) && !ALL_CAPS_WORD.test(t));
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
    } else if (
      segment.chords.length > 0 &&
      !segment.isChordLine &&
      (segment.unknown.some((t) => ANNOTATION.test(t)) ||
        (segment.unknown.length < MIN_TITLE_WORDS &&
          !segment.unknown.some((t) => ALL_CAPS_TITLE_WORD.test(t))))
    ) {
      ignoredChordLines++;
    }
  }

  const occurrences = findChords(lines, { indicator, measure });
  const chordTokens = new Set(occurrences.map((o) => o.token));
  for (const occurrence of occurrences) {
    const { token, chord, prefix, suffix, next, page, pageWidth } = occurrence;
    chordCount++;
    if (same) continue;
    const replacement = `${prefix}${transposeChord(chord, semitones, to)}${suffix}`;
    const { fontSize, fontName } = token.run;
    const newWidth = measure(replacement, fontName, fontSize);
    const limitX = collisionLimit({ next, pageWidth, fontName, fontSize, measure });
    const collides = token.x + newWidth > limitX;
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
      runKey: runKeyOf(page, token.run),
      spaceWidth: measure(' ', fontName, fontSize),
      limitX,
      nextIsChord: next !== null && chordTokens.has(next),
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
      runKey: runKeyOf(indicator.page, token.run),
      spaceWidth: measure(' ', token.run.fontName, token.run.fontSize),
      limitX: 0,
      nextIsChord: false,
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
    keyIndicator.limitX = collisionLimit({
      next: next ?? null,
      pageWidth,
      fontName: keyIndicator.fontName,
      fontSize: keyIndicator.fontSize,
      measure,
    });
    keyIndicator.collides = token.x + keyIndicator.newWidth > keyIndicator.limitX;
  }

  return {
    from,
    to,
    chords,
    keyIndicator,
    chordCount,
    collisions: chords.filter((c) => c.collides).length,
    suspectSegments,
    ignoredChordLines,
  };
}
