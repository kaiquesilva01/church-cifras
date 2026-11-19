import { describe, expect, it } from 'vitest';
import { padOwnerFor } from './padRoute';

describe('padOwnerFor', () => {
  it('returns a song owner outside a setlist', () => {
    expect(padOwnerFor('s1', null)).toEqual({ kind: 'song', songId: 's1' });
  });

  it('returns a setlist owner inside a setlist', () => {
    expect(padOwnerFor('s1', 'r1')).toEqual({ kind: 'setlist', setlistId: 'r1' });
  });
});
