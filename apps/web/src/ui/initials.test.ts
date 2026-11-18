import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('Gabriela Rocha')).toBe('GR');
    expect(initialsOf('Casa Worship Brasil')).toBe('CW');
    expect(initialsOf('adhemar')).toBe('A');
    expect(initialsOf('  ')).toBe('');
  });

  it('keeps a character outside the basic plane whole', () => {
    expect(initialsOf('𝒜lma Nova')).toBe('𝒜N');
  });
});
