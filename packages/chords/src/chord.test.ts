import { describe, expect, it } from 'vitest';
import { parseChord, semitonesBetween, transposeChord } from './chord';
import { parseKey } from './keys';

const key = (name: string) => parseKey(name)!;

function transpose(token: string, from: string, to: string): string {
  const chord = parseChord(token)!;
  return transposeChord(chord, semitonesBetween(key(from), key(to)), key(to));
}

describe('parseChord', () => {
  it('parses chords with quality and bass', () => {
    for (const t of [
      'Gm7/F',
      'A#/D',
      'C7(b9)',
      'F#m7(b5)',
      'D°',
      'G7M',
      'Dm7',
      'A9',
      'Bb',
      'E4',
      '(A9)',
    ]) {
      expect(parseChord(t), t).not.toBeNull();
    }
    expect(parseChord('C7(b9)')?.quality).toBe('7(b9)');
    expect(parseChord('A#/D')?.bassPc).toBe(2);
    expect(parseChord('(A9)')?.wrapped).toBe(true);
  });

  it('accepts a slash-digit extension inside the quality', () => {
    for (const t of ['E7/9', 'G6/9', 'A4/7', 'F#m7/5-', 'C/9', 'E7/9/G']) {
      expect(parseChord(t), t).not.toBeNull();
    }
    expect(parseChord('C/9')).toMatchObject({ quality: '/9', bassPc: null });
    expect(parseChord('F#m7/5-')).toMatchObject({ quality: 'm7/5-', bassPc: null });
    expect(parseChord('E7/9/G')).toMatchObject({ quality: '7/9', bassPc: 7 });
    expect(transpose('G6/9', 'G', 'A')).toBe('A6/9');
    expect(transpose('E7/9/G', 'E', 'F#')).toBe('F#7/9/A');
  });

  it('rejects non chords', () => {
    for (const t of ['Intro:', 'Senhor', '2x', 'H7', 'Am7/X', 'E7/9x', 'C/', '']) {
      expect(parseChord(t), t).toBeNull();
    }
  });
});

describe('transposeChord', () => {
  it('transposes the sample from Bb to D', () => {
    const tokens = 'A# F/A Gm Gm7/F D# A#/D Cm D#9 F/D# Dm7 D#/G'.split(' ');
    const out = tokens.map((t) => transposeChord(parseChord(t)!, 4, key('D')));
    expect(out.join(' ')).toBe('D A/C# Bm Bm7/A G D/F# Em G9 A/G F#m7 G/B');
  });

  it('uses flats for flat target', () => {
    expect(transpose('C', 'C', 'Bb')).toBe('Bb');
    expect(transpose('G7', 'C', 'Bb')).toBe('F7');
    expect(transpose('A#m', 'C', 'F')).toBe('Ebm');
  });

  it('uses flat names for chromatic degrees in sharp keys', () => {
    expect(transposeChord(parseChord('A#')!, 0, key('C'))).toBe('Bb');
    expect(transposeChord(parseChord('D#')!, 0, key('G'))).toBe('Eb');
  });

  it('transposes minor key using relative major spelling', () => {
    expect(['Am', 'G', 'F', 'E7'].map((t) => transpose(t, 'Am', 'Cm'))).toEqual([
      'Cm',
      'Bb',
      'Ab',
      'G7',
    ]);
  });

  it('keeps parentheses', () => {
    expect(transpose('(A9)', 'A', 'B')).toBe('(B9)');
  });
});

describe('semitonesBetween', () => {
  it('throws on mixed modes', () => {
    expect(() => semitonesBetween(key('C'), key('Am'))).toThrow();
  });
});
