export type KeyName = string;

export interface Key {
  tonicPc: number;
  minor: boolean;
  name: KeyName;
}

const MAJOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export const KEY_OPTIONS: {
  readonly major: readonly KeyName[];
  readonly minor: readonly KeyName[];
} = Object.freeze({
  major: Object.freeze(MAJOR_NAMES),
  minor: Object.freeze(MINOR_NAMES),
});

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const FLAT_MAJOR_PCS = new Set([5, 10, 3, 8]);
const FLAT_MINOR_PCS = new Set([2, 7, 0, 5, 10, 3]);

export function parseKey(input: string): Key | null {
  const match = /^([A-G])([#b]?)(m?)$/.exec(input.trim().replace(/^./, (c) => c.toUpperCase()));
  if (!match) return null;
  const [, letter, accidental, m] = match;
  const base = LETTER_PC[letter!]!;
  const tonicPc = (base + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0) + 12) % 12;
  const minor = m === 'm';
  return { tonicPc, minor, name: (minor ? MINOR_NAMES : MAJOR_NAMES)[tonicPc]! };
}

export function relativeMajorPc(key: Key): number {
  return key.minor ? (key.tonicPc + 3) % 12 : key.tonicPc;
}

export function prefersFlats(key: Key): boolean {
  return (key.minor ? FLAT_MINOR_PCS : FLAT_MAJOR_PCS).has(key.tonicPc);
}
