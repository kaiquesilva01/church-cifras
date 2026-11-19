import { describe, expect, it } from 'vitest';
import { isSongId } from './songId';

describe('isSongId', () => {
  it('accepts letters, digits, underscore and hyphen', () => {
    expect(isSongId('abc123')).toBe(true);
    expect(isSongId('a_b-C')).toBe(true);
    expect(isSongId('x'.repeat(100))).toBe(true);
  });

  it('rejects empty, too long and ids with slashes or other characters', () => {
    expect(isSongId('')).toBe(false);
    expect(isSongId('x'.repeat(101))).toBe(false);
    expect(isSongId('a/b')).toBe(false);
    expect(isSongId('a b')).toBe(false);
    expect(isSongId('.')).toBe(false);
  });

  it('rejects ids reserved by Firestore (__name__)', () => {
    expect(isSongId('__x__')).toBe(false);
    expect(isSongId('____')).toBe(false);
    expect(isSongId('__x')).toBe(true);
  });
});
