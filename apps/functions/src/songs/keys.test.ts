import { describe, expect, it } from 'vitest';
import { summarizeArrangements } from './keys';

describe('summarizeArrangements', () => {
  it('summarizes keys and handmade keys in canonical order', () => {
    expect(
      summarizeArrangements([
        { key: 'Am', source: 'handmade' },
        { key: 'G', source: 'generated' },
        { key: 'C', source: 'handmade' },
        { key: 'F#m', source: 'generated' },
      ]),
    ).toEqual({ keys: ['C', 'G', 'F#m', 'Am'], handmadeKeys: ['C', 'Am'] });
  });

  it('drops invalid keys and duplicates', () => {
    expect(
      summarizeArrangements([
        { key: 'C', source: 'generated' },
        { key: 'C', source: 'generated' },
        { key: 'H', source: 'handmade' },
        { key: 'x', source: 'handmade' },
      ]),
    ).toEqual({ keys: ['C'], handmadeKeys: [] });
  });
});
