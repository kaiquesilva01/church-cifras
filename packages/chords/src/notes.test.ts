import { describe, expect, it } from 'vitest';
import { parseKey } from './keys';
import { noteName, pitchClass } from './notes';

const name = (pc: number, key: string) => noteName(pc, parseKey(key)!);

describe('notes', () => {
  it('computes pitch classes', () => {
    expect(pitchClass('C', '')).toBe(0);
    expect(pitchClass('B', '#')).toBe(0);
    expect(pitchClass('E', 'b')).toBe(3);
    expect(pitchClass('A', '#')).toBe(10);
  });

  it('names notes by degree', () => {
    expect([name(10, 'C'), name(3, 'C'), name(6, 'C')]).toEqual(['Bb', 'Eb', 'F#']);
    expect([1, 6, 8, 10, 0].map((pc) => name(pc, 'E'))).toEqual(['C#', 'F#', 'G#', 'A#', 'C']);
    expect([name(3, 'Bb'), name(10, 'Bb')]).toEqual(['Eb', 'Bb']);
    expect(name(10, 'Am')).toBe('Bb');
    expect(name(5, 'F#')).toBe('F');
    expect(name(2, 'C#')).toBe('D');
  });
});
