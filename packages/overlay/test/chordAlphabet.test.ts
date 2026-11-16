import { describe, expect, it } from 'vitest';
import { parseChord } from '@cifras/chords';
import { SUBSET_CHARSET } from '../scripts/charset.mjs';

// Every character the chord grammar can emit, mirroring CHORD_PATTERN in
// packages/chords/src/chord.ts: roots A-G, accidentals # and b, quality words (maj min dim aug sus
// add m M), digits, the symbols ° º + ø - ( ) and the slash bass; plus the key indicator "(E)".
const GRAMMAR_ALPHABET = [
  ...'ABCDEFG',
  ...'#b',
  ...'majminduglsM',
  ...'0123456789',
  ...'°º+ø-()/',
];

describe('SUBSET_CHARSET vs chord grammar', () => {
  it.each(GRAMMAR_ALPHABET)('contains %s', (ch) => {
    expect(SUBSET_CHARSET).toContain(ch);
  });

  it('the listed alphabet really is what the grammar accepts', () => {
    for (const ch of GRAMMAR_ALPHABET) {
      if (/[A-G]/.test(ch)) expect(parseChord(ch), ch).not.toBeNull();
    }
    // a character outside the alphabet is rejected by the grammar
    expect(parseChord('Cx')).toBeNull();
    expect(parseChord('C&')).toBeNull();
  });
});
