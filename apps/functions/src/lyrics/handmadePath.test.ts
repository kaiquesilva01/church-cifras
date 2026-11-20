import { describe, expect, it } from 'vitest';
import { pickHandmadePath } from './handmadePath';

describe('pickHandmadePath', () => {
  it('returns the first non-empty string path', () => {
    expect(pickHandmadePath(['songs/s1/a.pdf', 'songs/s1/b.pdf'])).toBe('songs/s1/a.pdf');
  });

  it('skips empty and non-string paths without hiding a valid later one', () => {
    expect(pickHandmadePath(['', undefined, null, 42, 'songs/s1/b.pdf'])).toBe('songs/s1/b.pdf');
  });

  it('returns null when there is no usable path', () => {
    expect(pickHandmadePath([])).toBeNull();
    expect(pickHandmadePath(['', undefined])).toBeNull();
  });
});
