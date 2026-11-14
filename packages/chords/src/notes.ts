import { prefersFlats, relativeMajorPc, type Key } from './keys';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const FLAT_DEGREES = new Set([1, 3, 8, 10]);

export function pitchClass(letter: string, accidental: '' | '#' | 'b'): number {
  const base = LETTER_PC[letter];
  if (base === undefined) throw new Error(`Invalid note letter: ${letter}`);
  return (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
}

export function noteName(pc: number, key: Key): string {
  const normalized = ((pc % 12) + 12) % 12;
  const degree = (normalized - relativeMajorPc(key) + 12) % 12;
  const useFlats = FLAT_DEGREES.has(degree) || prefersFlats(key);
  return (useFlats ? FLATS : SHARPS)[normalized]!;
}
