import { describe, expect, it } from 'vitest';
import { KEY_OPTIONS, parseKey, prefersFlats } from './keys';

describe('keys', () => {
  it('parses canonical and synonym keys', () => {
    expect(parseKey('A#')?.name).toBe('Bb');
    expect(parseKey('D#m')?.name).toBe('Ebm');
    expect(parseKey('Dbm')?.name).toBe('C#m');
    expect(parseKey(' g ')?.name).toBe('G');
    expect(parseKey('H')).toBeNull();
  });

  it('lists key options', () => {
    expect(KEY_OPTIONS.major).toEqual([
      'C',
      'C#',
      'D',
      'Eb',
      'E',
      'F',
      'F#',
      'G',
      'Ab',
      'A',
      'Bb',
      'B',
    ]);
    expect(KEY_OPTIONS.minor[0]).toBe('Cm');
    expect(KEY_OPTIONS.minor).toHaveLength(12);
  });

  it('prefers flats only for flat keys', () => {
    for (const name of ['F', 'Bb', 'Eb', 'Ab', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']) {
      expect(prefersFlats(parseKey(name)!), name).toBe(true);
    }
    for (const name of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'Am', 'Em']) {
      expect(prefersFlats(parseKey(name)!), name).toBe(false);
    }
  });
});
