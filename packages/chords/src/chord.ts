import type { Key } from './keys';
import { noteName, pitchClass } from './notes';

export interface Chord {
  rootPc: number;
  quality: string;
  bassPc: number | null;
  wrapped: boolean;
  raw: string;
}

const CHORD_PATTERN =
  /^([A-G])([#b]?)((?:maj|min|dim|aug|sus|add|m|M|[0-9]|[°º+ø#b()-])*)(?:\/([A-G])([#b]?))?$/;

export function parseChord(token: string): Chord | null {
  const wrapped = token.length > 2 && token.startsWith('(') && token.endsWith(')');
  const inner = wrapped ? token.slice(1, -1) : token;
  const match = CHORD_PATTERN.exec(inner);
  if (!match) return null;
  const [, letter, accidental, quality, bassLetter, bassAccidental] = match;
  return {
    rootPc: pitchClass(letter!, accidental as '' | '#' | 'b'),
    quality: quality!,
    bassPc: bassLetter ? pitchClass(bassLetter, bassAccidental as '' | '#' | 'b') : null,
    wrapped,
    raw: token,
  };
}

export function semitonesBetween(from: Key, to: Key): number {
  if (from.minor !== to.minor) {
    throw new Error(`Cannot transpose between different modes: ${from.name} -> ${to.name}`);
  }
  return (to.tonicPc - from.tonicPc + 12) % 12;
}

export function transposeChord(chord: Chord, semitones: number, target: Key): string {
  const root = noteName(chord.rootPc + semitones, target);
  const bass = chord.bassPc === null ? '' : `/${noteName(chord.bassPc + semitones, target)}`;
  const text = `${root}${chord.quality}${bass}`;
  return chord.wrapped ? `(${text})` : text;
}
